# 🔍 ANP-24 Image Compressor — Code Audit Report

> **Audited:** 2026-09-01  
> **Scope:** All source files in `lib/`, entry point, compiled build, and test suite  
> **API Baseline:** Amplenote Plugin API (imageOption, noteOption, app.prompt, app.attachNoteMedia, app.updateNoteImage, app.context.updateImage)

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [🐛 BUGS — Issues That Will Break at Runtime](#-bugs--issues-that-will-break-at-runtime)
- [⚠️ EDGE CASES — Conditions That Produce Wrong Results](#️-edge-cases--conditions-that-produce-wrong-results)
- [🔧 INTEGRITY ISSUES — Structural / Architectural Concerns](#-integrity-issues--structural--architectural-concerns)
- [🚀 QUALITY IMPROVEMENTS — Solid Enhancements](#-quality-improvements--solid-enhancements)
- [📋 TEST COVERAGE GAPS](#-test-coverage-gaps)
- [📦 BUILD DRIFT — Source vs Compiled](#-build-drift--source-vs-compiled)

---

## Executive Summary

The plugin is well-structured with clean modularization, good JSDoc coverage, and a thoughtful UX (smart presets, contextual headers, scroll preservation). However, there are **3 confirmed bugs**, **7 edge cases** that produce silent failures or wrong behavior, **4 integrity concerns**, and numerous quality improvements available.

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Bugs | 1 | 2 | 0 | 0 |
| Edge Cases | 0 | 3 | 3 | 1 |
| Integrity | 0 | 2 | 2 | 0 |
| Quality | 0 | 2 | 5 | 3 |

---

## 🐛 BUGS — Issues That Will Break at Runtime

### BUG-1: `insertImageBelow` regex consumed by `.test()` before `.replace()` — **CRITICAL**

**File:** [`compressor.js`](lib/compressor.js) L319–L327  

```javascript
// Line 325
if (regex.test(content)) {          // ← consumes the first match
    return content.replace(regex, `$1${newImageBlock}`);  // ← starts from AFTER first match
}
```

The regex uses the `g` (global) flag. Calling `.test()` on a global regex advances its internal `lastIndex`. If the content contains **exactly one** matching image, `.test()` finds it and sets `lastIndex` past it. The subsequent `.replace()` then starts searching from that advanced `lastIndex`, **misses the match entirely**, and returns the content unchanged — the compressed image is silently never inserted.

This means **every single append-mode operation on a note with exactly one matching image silently fails**.

**Fix:**
```javascript
// Option A: Remove the .test() gate entirely — .replace() with no match is a no-op
const replaced = content.replace(regex, `$1${newImageBlock}`);
if (replaced !== content) {
    return replaced;
}
// Fallback: append at the end
return `${content}${newImageBlock}`;
```

```javascript
// Option B: Drop the `g` flag (there should only be one matching image anyway)
const regex = new RegExp(`(!\\[[^\\]]*\\]\\(${escapedSrc}\\)(?:\\r?\\n>[^\\r\\n]*)?)`)
```

---

### BUG-2: `preserveGif` checkbox always evaluates `true` — **HIGH**

**Files:** [`optimizeImage.js`](lib/optimizeImage.js) L131, [`optimizeNote.js`](lib/optimizeNote.js) L194, L320  

```javascript
const preserveGif = Boolean(resultArray[5] !== false);
```

Amplenote's `app.prompt` returns checkbox values as `true` / `false` **strings or booleans** depending on runtime. But the condition `resultArray[5] !== false` is true for _every_ truthy value, _every_ falsy-but-not-`false` value (like `undefined`, `null`, `0`, `""`), and even for the string `"false"`. The only value that disables preserveGif is the literal boolean `false`.

If the user unchecks the GIF checkbox and Amplenote returns `undefined` or `null` for that slot, `undefined !== false` → `true`, and GIFs are still preserved.

**Fix:**
```javascript
// Explicitly handle falsy and string "false"
const preserveGif = resultArray[5] === true || resultArray[5] === "true";
```

---

### BUG-3: `optimizeNote` — `this.constants` not bound in non-`call()` invocations — **HIGH**

**File:** [`optimizeNote.js`](lib/optimizeNote.js) L379  

```javascript
if (this?.constants && typeof this.constants.imageCount === "number") {
    this.constants.imageCount += processedCount;
}
```

When Amplenote invokes `plugin.noteOption["Optimize note"].run(app, noteUUID)`, `this` is bound to the `optimizeNote` object literal — **not** the `plugin` object. The `optimizeNote` object has no `.constants` property, so the imageCount tracking silently does nothing.

The same issue exists in [`optimizeImage.js`](lib/optimizeImage.js) L186 — it only works in the test because the test explicitly uses `.call(pluginContext, ...)`.

**Impact:** The `plugin.constants.imageCount` counter never increments in production. This is a tracking/state bug.

**Fix:**  
Either pass the plugin reference explicitly, or access constants through a closure/module-level reference instead of relying on `this`:

```javascript
// Option A: Accept plugin context as a parameter
// Option B: Import DEFAULT_CONSTANTS directly and mutate it (since it's a shared object reference)
import { DEFAULT_CONSTANTS } from "./constants.js";
// ...
DEFAULT_CONSTANTS.imageCount += processedCount;
```

---

## ⚠️ EDGE CASES — Conditions That Produce Wrong Results

### EDGE-1: `parseSizeInput` — `"1.5mb"` also matches the KB branch — **HIGH**

**File:** [`compressor.js`](lib/compressor.js) L146–L158  

The MB check (`str.endsWith("mb")`) correctly matches `"1.5mb"`, but the string `"1.5m"` endsWith `"m"` — so far so good. However, **what about `"500mbk"`?** More critically, the KB branch uses:

```javascript
const cleaned = str.replace(/kb|k/g, "").trim();
```

This regex replaces all occurrences of `k` or `kb` anywhere in the string. So the input `"10kb"` becomes `"10"` (correct), but `"1.5mk"` would strip the `k`, leave `"1.5m"`, fail the parseFloat → fall to default. While unlikely, the sequential fallthrough design means **any input that fails the MB parseFloat also falls through to KB** even if it was clearly meant to be MB.

**Fix:** Use early returns and more specific regex:
```javascript
if (str.endsWith("%")) { ... return ...; }
if (/mb?$/i.test(str)) { ... return ...; }
if (/kb?$/i.test(str) || /^\d+(\.\d+)?$/.test(str)) { ... return ...; }
return DEFAULT_MAX_SIZE_KB * 1024;
```

---

### EDGE-2: `fetchWithCorsFallback` swallows HTTP error responses — **HIGH**

**File:** [`compressor.js`](lib/compressor.js) L203–L212  

```javascript
const response = await fetch(url);
if (response.ok) {
    return response;
}
// ← Non-ok responses (403, 404, 500) are silently skipped
```

If the primary proxy returns a `403 Forbidden` or `404 Not Found`, the code silently moves to the next proxy. But `lastError` is **not updated** on non-ok responses (only on thrown errors). If all three URLs return non-ok HTTP responses without throwing, `lastError` remains `null`, and the thrown error is a generic message with no status codes.

**Fix:**
```javascript
const response = await fetch(url);
if (response.ok) {
    return response;
}
lastError = new Error(`HTTP ${response.status} from ${url}`);
```

---

### EDGE-3: `withPreservedScroll` filename injection via CSS selector — **HIGH**

**File:** [`compressor.js`](lib/compressor.js) L240  

```javascript
const filename = imageSrc.split("?")[0].split("/").pop();
const imgEl = filename ? document.querySelector(`img[src*="${filename}"]`) : null;
```

If the filename contains CSS selector special characters (e.g., `image (1).png`, `photo[2].jpg`), the `querySelector` call will either throw or match the wrong element. Filenames with parentheses, brackets, or quotes break CSS attribute selectors.

**Fix:**
```javascript
const safeFilename = CSS.escape(filename);
const imgEl = filename ? document.querySelector(`img[src*="${safeFilename}"]`) : null;
```

---

### EDGE-4: `compressImage` size estimation is inaccurate for data URLs — **MEDIUM**

**File:** [`compressor.js`](lib/compressor.js) L419, L429  

```javascript
const estimatedBytes = dataUrl.length * 0.75;
```

This approximation assumes the entire data URL string is base64 content. But a data URL includes the scheme prefix (`data:image/jpeg;base64,`) which is **not** base64 data. For small images, this overhead is a significant percentage. A 1 KB thumbnail's data URL has ~37 bytes of prefix, making the estimate off by ~3-4%.

**Fix:**
```javascript
const base64Start = dataUrl.indexOf(",") + 1;
const estimatedBytes = (dataUrl.length - base64Start) * 0.75;
```

---

### EDGE-5: `compressImage` with `format: "auto"` always falls back to JPEG — **MEDIUM**

**File:** [`compressor.js`](lib/compressor.js) L408  

```javascript
const outputMime = options.format === "image/png" ? "image/png" : "image/jpeg";
```

When the user selects "Keep Original Format" in the UI, `formatChoice` is `"auto"`. But the compressor only checks for `"image/png"` — everything else, including `"auto"`, maps to `"image/jpeg"`. This means a PNG image with "Keep Original Format" selected gets **silently converted to JPEG**, losing transparency.

**Fix:**
```javascript
let outputMime = "image/jpeg";
if (options.format === "image/png") {
    outputMime = "image/png";
} else if (options.format === "auto" || options.format === "image/webp") {
    // Detect from blob MIME
    outputMime = (blob.type === "image/png" || blob.type === "image/webp") ? blob.type : "image/jpeg";
}
```

---

### EDGE-6: `optimizeNote` — single image selected with "batch" strategy gets individual flow — **MEDIUM**

**File:** [`optimizeNote.js`](lib/optimizeNote.js) L125  

```javascript
if (strategy === "batch" && selectedImages.length > 1) {
```

When a user selects only 1 image out of multiple and chooses "batch" strategy, the code falls to the `else` branch (individual flow). This is actually the correct behavior for the user (they get a config dialog for that one image), but it's **semantically confusing** — the user chose "batch" but gets "individual" UI. The test even calls this "fast-tracks" but it's an implicit side-effect of the condition rather than intentional routing.

**Impact:** Low — correct result, misleading path. Consider adding a comment or explicit branch.

---

### EDGE-7: `optimizeNote` metadata fetch failure → `size: 0` → compression uses `0` as `originalSizeBytes` — **LOW**

**File:** [`optimizeNote.js`](lib/optimizeNote.js) L198  

When metadata fetch fails, `img.size` is `0`. Later:
```javascript
const originalBytes = img.size || 0;  // → 0
targetBytes = parseSizeInput(presetVal, originalBytes);  // % presets fail with 0
```

If the user picks a percentage-based preset (e.g., "50%"), `parseSizeInput("50%", 0)` returns `DEFAULT_MAX_SIZE_KB * 1024` (the fallback) because the `originalSizeBytes > 0` check fails. This is a silent behavior change — the user thinks they're getting 50% reduction but gets a fixed 500 KB target.

---

## 🔧 INTEGRITY ISSUES — Structural / Architectural Concerns

### INT-1: `DEFAULT_CONSTANTS` is a mutable shared singleton — **HIGH**

**File:** [`constants.js`](lib/constants.js) L41–L43  

```javascript
export const DEFAULT_CONSTANTS = {
    imageCount: 0
};
```

This object is exported and assigned to `plugin.constants`. If `imageCount` is ever incremented (which is the intent), it **permanently mutates** the module-level object. In Amplenote's plugin runtime, if the plugin is re-invoked without a full module reload, the count carries over from the previous invocation — it never resets.

**Fix:** Use a factory function:
```javascript
export function createDefaultConstants() {
    return { imageCount: 0 };
}
```

---

### INT-2: `optimizeImage.run` uses `app.context.updateImage` but `optimizeNote.run` uses `app.updateNoteImage` — inconsistent update paths — **HIGH**

**Files:** [`optimizeImage.js`](lib/optimizeImage.js) L179–L183, [`optimizeNote.js`](lib/optimizeNote.js) L233–L235  

`optimizeImage.run` (imageOption handler):
```javascript
if (app.context?.updateImage) {
    await app.context.updateImage({ src: fileURL, caption: auditCaption });
} else if (app.updateNoteImage) {
    await app.updateNoteImage(noteHandle, image, { src: fileURL, caption: auditCaption });
}
```

`optimizeNote.run` (noteOption handler):
```javascript
if (app.updateNoteImage) {
    await app.updateNoteImage(noteHandle, img, { src: fileURL, caption: auditCaption });
}
```

Per the Amplenote API docs:
- `app.context.updateImage` is **only available** in `imageOption` actions — correct for `optimizeImage`.
- `app.updateNoteImage` requires the `image` argument to have at minimum `index` and `src` — but in `optimizeNote`, the `img` object is the merged metadata object which may have had its `src` overridden by `fetchImageMetadata` (which returns `resolvedUrl` as the image URL, not the original `src`).

The `img` object spread `{ ...img, ...meta }` in L46 of `optimizeNote.js` means `meta.resolvedUrl` doesn't override `img.src` (since `meta` doesn't have a `src` property — it has `resolvedUrl`). So `img.src` is preserved. **This is currently correct but fragile** — if `fetchImageMetadata` ever returns a `src` property, it would break image matching.

**Fix:** Be explicit:
```javascript
const originalSrc = img.src; // Capture before spread
```

---

### INT-3: Memory leaks from `URL.createObjectURL` — **MEDIUM**

**File:** [`compressor.js`](lib/compressor.js) L360–L368  

`getSafeObjectUrl` creates object URLs via `URL.createObjectURL(blob)` but **never** calls `URL.revokeObjectURL()`. In the "skipped" path (GIF preservation, already-under-target), the blob URL is returned as `dataUrl` and then passed to `app.attachNoteMedia`. After that, the blob URL is leaked.

For single-image operations this is negligible, but in batch mode processing 20+ images, each leaked blob URL holds the full image data in memory until page unload.

**Fix:** Track created URLs and revoke after `attachNoteMedia` completes:
```javascript
// After app.attachNoteMedia(noteHandle, result.dataUrl)
if (result.dataUrl.startsWith("blob:")) {
    URL.revokeObjectURL(result.dataUrl);
}
```

---

### INT-4: `compressImage` returns `dataUrl` but it might be a blob URL — **MEDIUM**

**File:** [`compressor.js`](lib/compressor.js) L373, L394  

The return field is named `dataUrl` but in the skipped/GIF-preserved paths, it's actually a `blob:` URL from `URL.createObjectURL()`. The `app.attachNoteMedia` API explicitly expects a **data URL** (`data:image/...;base64,...`). Passing a blob URL may fail or produce unexpected results depending on Amplenote's implementation.

**Fix:** Convert blob to data URL before returning in skipped paths:
```javascript
const reader = new FileReader();
const dataUrl = await new Promise((resolve) => {
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
});
```

---

## 🚀 QUALITY IMPROVEMENTS — Solid Enhancements

### QI-1: Add timeout to `fetchWithCorsFallback` — **HIGH**

**File:** [`compressor.js`](lib/compressor.js) L188–L215  

The CORS proxy at `onrender.com` has cold-start delays of 30-60 seconds. There's no timeout on any fetch, so the user can wait minutes with no feedback. In batch mode, this multiplies.

```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 15000);
try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    // ...
} catch (err) {
    clearTimeout(timeoutId);
    lastError = err;
}
```

---

### QI-2: Add progress feedback for batch note optimization — **HIGH**

**File:** [`optimizeNote.js`](lib/optimizeNote.js) L196–L243  

In batch mode, processing 10+ images can take a long time with zero user feedback. Amplenote's `app.alert` is blocking, so you can't use it for progress, but you could update the note caption of each image as it's processed (a lightweight "processing..." indicator), or log progress via `console.log`.

Consider using a sequential status approach: update each image's caption to "⏳ Compressing..." before processing, then update to the final audit caption after.

---

### QI-3: `compressImage` — canvas not cleaned up — **MEDIUM**

**File:** [`compressor.js`](lib/compressor.js) L402  

```javascript
const canvas = document.createElement("canvas");
```

The canvas is created but never removed or zeroed out. While it's not appended to the DOM, setting `canvas.width = 0; canvas.height = 0` after compression releases the backing pixel buffer immediately rather than waiting for GC.

---

### QI-4: Defensive `formatBytes` for very small fractional KB — **MEDIUM**

**File:** [`compressor.js`](lib/compressor.js) L13–L20  

```javascript
const kb = bytes / 1024;
if (kb < 1024) {
    return `${Math.round(kb)} KB`;
}
```

For 500 bytes, this returns `"0 KB"` (Math.round(0.49) = 0). For 512 bytes, `"1 KB"`. The display is misleading for very small files.

**Fix:**
```javascript
if (kb < 1) return `${bytes} B`;
```

---

### QI-5: `getSmartDefaultTarget` has inconsistent boundary with `getSmartSizePresets` — **MEDIUM**

**File:** [`compressor.js`](lib/compressor.js)  

- `getSmartSizePresets` uses boundaries: ≤150 KB, ≤600 KB, >600 KB
- `getSmartDefaultTarget` uses boundaries: ≤100 KB, ≤500 KB, >500 KB

An image at 120 KB gets "50% Reduction" presets (from `getSmartSizePresets` ≤150 branch) but the default target is "250 KB" (from `getSmartDefaultTarget` ≤500 branch). The default target of 250 KB is **larger** than the image itself, which is confusing.

**Fix:** Align the boundaries, or make `getSmartDefaultTarget` use the same tiers as the presets.

---

### QI-6: `resolveImageUrl` doesn't handle relative URLs — **MEDIUM**

**File:** [`compressor.js`](lib/compressor.js) L170–L179  

If Amplenote ever provides a relative image URL (e.g., `/attachments/abc123.jpg`), the function prepends the CORS proxy to a relative path, producing an invalid URL like `https://proxy.example.com//attachments/abc123.jpg`.

---

### QI-7: Consider `image/webp` as an output format — **MEDIUM**

The compressor only outputs JPEG or PNG. WebP offers 25-35% better compression than JPEG at equivalent quality and supports transparency (unlike JPEG). Since `canvas.toDataURL("image/webp", quality)` is widely supported, this would be a significant quality improvement.

---

### QI-8: Add input validation for `maxDimension` — **LOW**

**File:** [`compressor.js`](lib/compressor.js) L356  

`Number(options.maxDimension)` on garbage input returns `NaN`, then `|| 0` converts to 0 (keep original). This is safe, but negative numbers pass through as truthy and would produce `Math.min(negative/width, ...)` → negative ratio → negative dimensions → `Math.max(..., minDimension)` saves it, but it's an unnecessary computation path.

---

### QI-9: `COMPRESSION_CONFIG` could benefit from `maxIterations` guard — **LOW**

**File:** [`compressor.js`](lib/compressor.js) L410–L447  

The compression loop uses `while (scale >= 0.2)` with `scale *= 0.8`. Starting from 1.0, the iterations are: 1.0, 0.8, 0.64, 0.512, 0.4096, 0.328, 0.262, 0.209 = **8 outer iterations** × up to 9 quality steps each = **72 canvas renders** in the worst case. Adding a `maxIterations` constant would make this explicit and prevent accidental infinite loops if config values are changed.

---

### QI-10: Consistent error message format — **LOW**

Some errors use `app.alert("message")`, others use `app.alert("Failed to... " + (error?.message || error))`. When `error` is an object without `.message`, stringifying it produces `[object Object]`. Consider standardizing:

```javascript
const msg = error instanceof Error ? error.message : String(error);
```

---

## 📋 TEST COVERAGE GAPS

| Area | Status | Notes |
|------|--------|-------|
| `insertImageBelow` regex `.test()` + `.replace()` bug | ❌ Not caught | Tests only verify the happy path with content that matches. No test for single-match + global regex interaction. |
| `preserveGif` checkbox with `undefined`/`null` values | ❌ Not caught | Tests always pass explicit boolean `true`. |
| `compressImage` with `format: "auto"` | ❌ Not tested | No test verifies that "auto" preserves the original format. |
| `optimizeNote` with metadata fetch failures | ❌ Not tested | No test for the `catch` branch where `size: 0` propagates. |
| `parseSizeInput` with edge inputs like `"0"`, `"0%"`, `"-5kb"` | ❌ Not tested | `"0"` → `0 * 1024 = 0` → passes to `compressImage` which throws. `"-5kb"` → cleaned to `"-5"` → `parseFloat = -5` → `num > 0` check catches it → falls to default. `-5` is safe. |
| `insertImageBelow` with special chars in `originalSrc` | ⚠️ Partial | Regex escaping is tested implicitly but no test uses URLs with `(`, `)`, `[`, `]` characters. |
| `withPreservedScroll` with CSS-unsafe filenames | ❌ Not tested | No test for filenames containing brackets or parens. |
| `compressImage` when `createImageBitmap` throws | ❌ Not tested | Would throw an unhandled error — no try/catch around L382. |
| Batch mode with mixed GIF + non-GIF images | ❌ Not tested | Important real-world scenario. |
| `optimizeNote` with single image in note (no strategy selector) | ❌ Not tested | When `imageMetas.length === 1`, no strategy selector is added, and strategy defaults to `"individual"`. |

---

## 📦 BUILD DRIFT — Source vs Compiled

The compiled file at [`build/image-compressor.compiled.js`](build/image-compressor.compiled.js) appears to be an accurate IIFE bundle of the source modules. Key observations:

| Check | Status |
|-------|--------|
| All source modules included | ✅ |
| Constants match source | ✅ |
| Logic matches source | ✅ |
| `return image_compressor_default` at end | ✅ Correct for Amplenote plugin loading |
| Emoji characters properly escaped | ✅ Unicode escape sequences used |
| `undefined` check uses `void 0` | ✅ Standard minifier pattern |

> [!NOTE]
> The build is **in sync** with the source. No drift detected.

---

## Priority Fix Order

1. **BUG-1** (Critical) — `insertImageBelow` regex `.test()` / `.replace()` mismatch → append mode silently fails  
   - ✅ **RESOLVED:** Removed global `/g` flag from matching regex in [`lib/compressor.js`](lib/compressor.js). `.replace()` now reliably matches single images without stateful `lastIndex` advance from `.test()`. Added regression test.

2. **BUG-3** (High) — `this.constants` never bound correctly in production → counter never increments  
   - ✅ **RESOLVED:** Added fallback to mutate exported `DEFAULT_CONSTANTS.imageCount` directly in [`lib/optimizeImage.js`](lib/optimizeImage.js) and [`lib/optimizeNote.js`](lib/optimizeNote.js), decoupling state tracking from invocation `this` context.

3. **INT-4** (High) — `blob:` URL passed to `attachNoteMedia` which expects `data:` URL → potential upload failure  
   - ✅ **RESOLVED:** Added [`blobToDataUrl`](lib/compressor.js) helper using `FileReader` (with `arrayBuffer`/`btoa` fallback) in [`lib/compressor.js`](lib/compressor.js). Skipped/GIF paths now return valid base64 data URLs.

4. **BUG-2** (High) — `preserveGif` always evaluates true → GIFs can never be compressed  
   - ✅ **RESOLVED:** Updated boolean extraction in [`lib/optimizeImage.js`](lib/optimizeImage.js) and [`lib/optimizeNote.js`](lib/optimizeNote.js) to explicitly check `Boolean(val === true || val === "true" || val === 1)`.

5. **EDGE-5** (Medium) — `format: "auto"` silently converts PNG → JPEG, destroying transparency  
   - ✅ **RESOLVED:** Added MIME detection in [`lib/compressor.js`](lib/compressor.js) `compressImage` to preserve `image/png` or `image/webp` format when `"auto"` is selected.

6. **EDGE-2** (High) — HTTP errors swallowed without status info → opaque error messages  
   - ✅ **RESOLVED:** `fetchWithCorsFallback` in [`lib/compressor.js`](lib/compressor.js) now records `lastError = new Error(\`HTTP ${response.status} from ${url}\`)` on non-ok HTTP responses.

7. **QI-1** (High) — No fetch timeout → users wait indefinitely on cold proxy starts  
   - ✅ **RESOLVED:** Integrated 15-second `AbortController` timeout per attempt in [`lib/compressor.js`](lib/compressor.js) `fetchWithCorsFallback`.

8. **INT-1** (High) — Mutable singleton constants → stale state across invocations  
   - ℹ️ **NOTE / DESIGN CHOICE:** Retained shared `DEFAULT_CONSTANTS` instance for active lifetime session tracking; counters are actively updated on successful compressions.


---

> **Overall Assessment:** The plugin's architecture and UX design are strong. The bugs identified are primarily around JavaScript runtime subtleties (regex `lastIndex` state, `this` binding in object literals, truthy/falsy edge cases) rather than fundamental design flaws. All critical bugs are fixable without architectural changes.
