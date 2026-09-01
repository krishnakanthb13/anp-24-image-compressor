# Code Documentation — Image Compressor (`anp-24`)

## Overview

The **Image Compressor Plugin** enables Amplenote users to compress and optimize images in their notes. The plugin utilizes a modular architecture designed for high testability, safety, and zero external runtime dependencies.

---

## Core Modules

### 1. Main Entry Point (`image-compressor.js`)
- Exposes standard Amplenote API hook points:
  - `constants`: Default state (`imageCount: 0`).
  - `noteOption["Optimize note"]`: Whole-note optimization workflow.
  - `imageOption["Compress image"]`: Single-image dropdown workflow.
  - `compressImage`: Engine method exported on the plugin root.

---

### 2. Constants & Configuration (`lib/constants.js`)
- `CORS_PROXY_URL`: Pinned HTTPS proxy for routing external media URLs.
- `DEFAULT_MAX_SIZE_KB`: Configured to `500` (derived from `ds.md` specification).
- `COMPRESSION_MODES`:
  - `REPLACE = "replace"`: In-place update of image references.
  - `APPEND = "append"`: Insertion of compressed image markdown below original.
- `COMPRESSION_CONFIG`:
  - `initialQuality`: `0.9`
  - `minQuality`: `0.1`
  - `qualityStep`: `0.1`
  - `scaleStep`: `0.8` (downscales dimensions by 20% per pass if quality reduction is insufficient)
  - `minDimension`: `100` px floor

---

### 3. Compression Engine (`lib/compressor.js`)
Contains pure and stateful utility functions:

#### `resolveImageUrl(rawUrl, proxyUrl)`
- Validates the incoming URL.
- Leaves `data:` and `blob:` URLs untouched.
- Avoids double-proxying if the string is already prefixed with `proxyUrl`.

#### `insertImageBelow(content, originalSrc, newSrc, caption)`
- Safely escapes regex metacharacters in `originalSrc`.
- Matches markdown image pattern `![optional caption](originalSrc)` and injects `![caption](newSrc)` directly beneath it.
- Falls back to appending at the end of the note if the exact markdown pattern cannot be matched.

#### `compressImage(imageUrl, targetSizeKB, state)`
- Converts `targetSizeKB` to bytes (`targetSizeKB * 1024`).
- Fetches the image via `fetch()` and checks `blob.size`. If already `<= targetSizeBytes`, returns `URL.createObjectURL(blob)` immediately (zero-overhead bypass).
- Decodes the blob with `createImageBitmap(blob)`.
- Renders to an offscreen HTML5 `<canvas>`.
- **Quality & Scaling Loop**:
  1. Iterates from `quality = 0.9` down to `0.1`.
  2. Estimates compressed byte size via base64 length (`dataUrl.length * 0.75`).
  3. If quality reduction alone cannot satisfy the target size (common for high-resolution images), decreases canvas dimensions by `scaleStep = 0.8` and re-runs the quality stepping.
- Increments `state.imageCount` upon successful compression.

---

### 4. Note Optimizer (`lib/optimizeNote.js`)
- **Workflow**:
  1. Identifies the active note (`noteUUID` or `app.context.noteUUID`).
  2. Calls `app.getNoteImages(noteHandle)`. If empty, alerts and terminates early.
  3. Prompts user for max size (default `500` KB) and output mode (`replace` vs. `append`).
  4. Iterates through all images, resolving proxy URLs and calling `compressImage`.
  5. If `dataURL` starts with `blob:`, increments `skippedCount` and skips re-uploading.
  6. Attaches media via `app.attachNoteMedia(noteHandle, dataURL)`.
  7. In `replace` mode: calls `app.updateNoteImage(noteHandle, img, { src: fileURL })`.
  8. In `append` mode: builds updated note markdown via `insertImageBelow` and applies it in a single atomic `app.replaceNoteContent` call.
  9. Displays an informative summary alert detailing compressed, skipped, and failed counts.

---

### 5. Single Image Optimizer (`lib/optimizeImage.js`)
- **Workflow**:
  1. Implements `check(app, image)` to ensure valid image selection.
  2. Prompts user for size threshold and output mode.
  3. Compresses image and attaches media.
  4. In `replace` mode: updates image via `app.context.updateImage` / `app.updateNoteImage`.
  5. In `append` mode: updates note content via `insertImageBelow` and `app.replaceNoteContent`.

---

## Build System

- **Bundler**: `esbuild` (`esbuild.js`)
- **Output Target**: `build/image-compressor.compiled.js`
- **Packaging Logic**: Evaluates ESM modules into a self-contained IIFE (`(() => { ... return plugin; })()`) ensuring no global namespace pollution and full compatibility with Amplenote's plugin execution sandbox.
