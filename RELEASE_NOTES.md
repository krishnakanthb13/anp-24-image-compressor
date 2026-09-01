# Release Notes: Amplenote Image Compressor

## v0.0.7 (2026-09-01)

### 🐛 Bug Fixes & Hardening
- **Fixed Caption Detachment in Append Mode**: Replaced email-style blockquotes (`\n> Caption`) with native markdown image captions `![Caption](url)` in `insertImageBelow`, followed by direct ProseMirror caption binding via `app.updateNoteImage`. Eliminates detached blockquotes.
- **Fixed Quick Batch Strategy Selection**: Improved `select` strategy parsing in `optimizeNote` to recognize both string and object prompt responses, ensuring Quick Batch displays a single unified prompt rather than cycling through each image individually.
- **Enhanced Viewport / Scroll Position Anchoring**: Updated `withPreservedScroll` to safely traverse parent and top-level window documents (`window.parent.document`), centering target images via `scrollIntoView({ block: "center", behavior: "smooth" })` across multi-frame render cycles.
- **Fixed `preserveGif` Checkbox Parsing**: Updated boolean evaluation in `optimizeImage` and `optimizeNote` to strictly check truthy values (`true`, `"true"`, `1`), preventing unchecked options from evaluating to `true`.
- **Fixed Image Counter State Tracking**: Added fallback mutation on `DEFAULT_CONSTANTS.imageCount` so lifetime compression counts track properly regardless of action execution context and `this` binding.
- **Base64 Data URL Return (`blobToDataUrl`)**: Converted skipped/GIF-preservation paths to return valid base64 data URLs via `FileReader` / `arrayBuffer`, guaranteeing compatibility with `app.attachNoteMedia` and preventing object URL leaks.
- **Format `"auto"` Transparency Preservation**: Extended `compressImage` to inspect `blob.type` and preserve PNG / WebP formats without forced JPEG conversion when `"auto"` is selected.
- **CORS Fetch Timeout & Status Error Capture**: Added 15-second `AbortController` timeout per attempt and explicit `HTTP ${status}` error logging in `fetchWithCorsFallback`.
- **Safe CSS Selector Escaping**: Applied `CSS.escape()` in `withPreservedScroll` to safely handle filenames containing parentheses, brackets, or quotes.

### 🧪 Tests
- **Expanded Test Suite**: 47 automated tests passing across all 5 test suites.

---

## v0.0.6 (2026-09-01)

### 🚀 New Features
- **Native Amplenote Image Caption Formatting**: Integrated automatic caption audit notes with Amplenote's native rich-text editor engine.
  - In **Replace in-place** mode, sets the native image `caption` property (`app.context.updateImage({ src, caption })` and `app.updateNoteImage`), cleanly binding the savings note directly beneath the image box.
  - In **Append below** mode, outputs markdown with strict single-newline syntax (`![Compressed](url)\n> 🗜️ Compressed: 355 KB (was 3.98 MB — 91% saved)`), preventing detached blockquotes.
- **Multi-Proxy CORS Fallback Cascade (`fetchWithCorsFallback`)**: Added an automated multi-proxy failover pipeline (`Primary Render Proxy` $\rightarrow$ `corsproxy.io` $\rightarrow$ `Direct Origin`). Completely resolves `TypeError: Failed to fetch` cross-origin blocks when running inside the sandboxed plugin iframe (`plugins.amplenote.com`).
- **Multi-Frame Viewport & Scroll Position Lock (`withPreservedScroll`)**: Implemented active container scroll offset capture and multi-frame animation anchoring (`0ms`, `50ms`, `200ms`, `500ms`). Eliminates cursor jumps and viewport resets to the top of the note when opening prompt modals or committing media updates.
- **Unified Action Naming**: Aligned action names across the plugin to `noteOption["Optimize note"]` and `imageOption["Optimize image"]`, eliminating redundant naming with the plugin title.

### ⚡ Improvements
- **Fast-Track Single-Image Selection**: When only 1 image is selected in the note optimizer, automatically skips batch strategy selection and fast-tracks directly into custom single-image configuration.
- **Safeguarded Object URL Lifecycle**: Hardened `compressImage` with defensive environment checks for `URL.createObjectURL`, ensuring zero-runtime exceptions across headless and sandboxed browser runtimes.
- **Comprehensive Completion Reports**: Enhanced completion dialogs with explicit metrics for images processed, skipped (already under threshold), failed, total bytes before/after, and percentage space saved.

### 🧪 Tests & Quality Assurance
- **Full Test Suite Verification**: 46 automated unit tests across 5 test suites (`constants`, `compressor`, `optimizeImage`, `optimizeNote`, `image-compressor`) passing with 100% success.
- **Clean Lint & Code Formatting**: ESLint (0 errors, 0 warnings) and Prettier verified across all source modules.

---

## v0.0.5 (2026-09-01)

### 🚀 New Features
- **Guided 2-Step Note Optimization Wizard (`noteOption`)**:
  - **Step 1 (Clean Image Selector)**: Presents a clean checklist displaying each image's size, dimensions ($W \times H$), and `[Needs Optimization]` vs `[Optimized]` status badges.
  - **Step 2 (Strategy Choice)**: Choose between **`⚡ Quick Batch`** (unified settings for all selected images) and **`🎯 Step-by-Step Individual`** (dedicated inspection and custom parameters per image).
- **Context-Aware Intelligence & Relative Reduction Presets**:
  - Automatically identifies small/lightweight images ($\le 150$ KB, e.g. 31 KB) and replaces static 500 KB targets with contextual relative reductions (`50% Reduction (~16 KB)`, `75% Reduction (~8 KB)`, `Tiny Thumbnail (10 KB)`).
  - Calculates dynamic percentage savings for oversized images (e.g. `500 KB — 83% space saved`).
  - Detects note-wide optimization status and confirms when all images are already lightweight.

### ⚡ Improvements
- **Smart Dimension Filtering**: Constrains max width downscaling choices relative to the image's actual resolution (e.g., 612 px image only displays `Keep 612 px` and `Max 400 px`).
- **Contextual Format Conversion**: Intelligently offers JPEG conversion specifically for PNG/WebP photographic screenshots (70–90% reduction) while offering standard options for existing JPEGs.

---

## v0.0.4 (2026-09-01)

### 🚀 New Features
- **Real-Time Image Inspection (`imageOption`)**: Pre-fetches image metadata to display live file sizes (in KB/MB), exact pixel resolutions ($W \times H$), and MIME types before compression.
- **Single-Image Context Menu Action**: Direct drop-down menu action on any note image with live metadata analysis and instant savings alerts.
- **GIF Animation Protection**: Automatically detects animated `.gif` files with an option to preserve animations without flattening frames.
- **Max Width Dimension Downscaling**: Added proportional resolution capping (`1920 px Full HD`, `1280 px HD`, `800 px Inline`, `400 px Thumbnail`).

---

## v0.0.3 (2026-09-01)

### 📚 Documentation & Security
- **Comprehensive Project Documentation**: Built complete technical documentation, architecture diagrams, data flow charts, and usage manuals in `README.md` and `CODE_DOCUMENTATION.md`.
- **Security Audit & Verification**: Audited codebase for OWASP vulnerabilities, sanitized markdown regex escaping in `insertImageBelow`, and updated `SECURITY.md`.
- **Design Philosophy**: Created `DESIGN_PHILOSOPHY.md` detailing the client-side privacy-first architecture, non-destructive audit tagging, and modular design principles.

---

## v0.0.2 (2026-09-01)

### 🧪 Test Infrastructure
- **Comprehensive Jest Test Suite**: Added complete unit tests covering byte formatting, unit-aware string parsing (`KB`, `MB`, `%`), CORS proxy URL resolution, canvas quality stepping, dimension scaling, and markdown placement.
- **ESM VM Modules Execution**: Configured Jest runner for native ECMAScript Modules with jsdom environment support.

---

## v0.0.1 (2026-09-01)

### 🚀 Initial Release
- **Pure Client-Side Compression Engine**: In-browser canvas-based image compressor with multi-pass JPEG quality stepping and dimensional downscaling.
- **Dual Placement Modes**: Supports in-place replacement (`replace`) and non-destructive image appending (`append`) below original images.
- **Zero Third-Party Dependencies**: Self-contained IIFE bundle utilizing standard Web Platform APIs (`Canvas 2D`, `createImageBitmap`, `fetch`, `Blob`).
