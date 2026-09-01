# Code Documentation — Image Compressor (`anp-24`)

## Overview

The **Image Compressor Plugin** inspects, analyzes, and compresses images within Amplenote notes. The codebase features real-time metadata analysis, multi-image interactive checklists, unit-aware size parsing (KB, MB, %), format conversion, resolution limiting, and non-destructive audit tagging.

---

## Core Modules

### 1. Main Entry Point (`image-compressor.js`)
- Exposes standard Amplenote API hook points:
  - `constants`: Default state (`imageCount: 0`).
  - `noteOption["Optimize note"]`: Multi-image checklist optimization workflow.
  - `imageOption["Compress image"]`: Live image inspection and compression workflow.
  - `compressImage`: Engine method exported on the plugin root.

---

### 2. Constants & Configuration (`lib/constants.js`)
- `CORS_PROXY_URL`: Pinned HTTPS proxy for routing external media URLs.
- `DEFAULT_MAX_SIZE_KB`: Configured to `500` (derived from `ds.md` specification).
- `SIZE_PRESETS`:
  - `500kb`: Standard / Web (500 KB)
  - `250kb`: Mobile / Fast Load (250 KB)
  - `100kb`: Compact / Thumbnail (100 KB)
  - `50%`: 50% of Current Size
  - `25%`: 25% of Current Size
  - `custom`: Custom user input
- `DIMENSION_LIMITS`:
  - `0`: Keep original dimensions
  - `1920`: Max 1920 px (Full HD)
  - `1280`: Max 1280 px (Standard HD)
  - `800`: Max 800 px (Small / Inline)
- `COMPRESSION_MODES`: `REPLACE = "replace"`, `APPEND = "append"`.
- `COMPRESSION_CONFIG`: Stepping rules (`initialQuality = 0.9`, `minQuality = 0.1`, `qualityStep = 0.1`, `scaleStep = 0.8`, `minDimension = 100`).

---

### 3. Compression Engine (`lib/compressor.js`)

#### `formatBytes(bytes)`
- Formats raw byte counts into human-readable strings (`"450 KB"`, `"2.35 MB"`).

#### `parseSizeInput(input, originalSizeBytes)`
- Intelligent unit parser supporting:
  - Raw numbers and `"KB"` strings (e.g. `"500"`, `"500kb"`).
  - Megabytes (e.g. `"1.5mb"`, `"2m"`).
  - Relative percentages (e.g. `"50%"` calculates half of `originalSizeBytes`).

#### `fetchImageMetadata(imageUrl, proxyUrl)`
- Pre-fetches the image blob and extracts:
  - `size` & `formattedSize` (e.g. `2.45 MB`).
  - `width` & `height` via `createImageBitmap(blob)`.
  - `mimeType` (`image/jpeg`, `image/png`, `image/webp`, `image/gif`).
  - `isGif` detection for animation preservation.

#### `insertImageBelow(content, originalSrc, newSrc, caption)`
- Safely escapes regex metacharacters in `originalSrc`.
- Matches markdown image pattern `![optional caption](originalSrc)` and injects `![caption](newSrc)` directly beneath it.
- Falls back to appending at note end if the exact markdown pattern is not found.

#### `compressImage(imageSource, targetSizeBytes, options, state)`
- Accepts a URL string or pre-fetched `Blob`.
- Checks `options.preserveGif` to prevent flattening animated GIFs.
- Applies `options.maxDimension` proportionally if the image exceeds the width limit.
- Checks if original image already complies with size and dimension constraints (zero-overhead bypass).
- **Multi-Pass Loop**:
  1. Draws image to an offscreen `<canvas>` at current scale.
  2. Steps down JPEG quality from `0.9` to `0.1`.
  3. If still oversized, scales down dimensions by `scaleStep = 0.8` and repeats quality reduction.
- Returns `{ dataUrl, skipped, originalBytes, finalBytes, savingsPercent, width, height }`.

---

### 4. Note Optimizer (`lib/optimizeNote.js`)
- **Workflow**:
  1. Pre-fetches metadata for all images in parallel (`fetchImageMetadata`).
  2. Builds an interactive prompt with:
     - Checkbox for each image (pre-checked if $> 500$ KB).
     - Target size preset profile selector.
     - Custom target size input (KB/MB/%).
     - Max width dimension constraint.
     - Format optimization (PNG/WebP to JPEG).
     - Output placement mode (`replace` vs. `append`).
     - GIF preservation checkbox.
  3. Compresses selected images, uploading via `app.attachNoteMedia`.
  4. In `append` mode, tags captions with `![Compressed (480 KB from 3.2 MB): Caption](...)` and applies atomic `app.replaceNoteContent`.
  5. In `replace` mode, updates note image references via `app.updateNoteImage`.
  6. Displays a comprehensive savings report with total note size before, after, and space saved.

---

### 5. Single Image Optimizer (`lib/optimizeImage.js`)
- **Workflow**:
  1. Implements `check(app, image)` for valid image selection.
  2. Pre-fetches metadata and displays live image statistics (size in bytes/KB/MB, resolution, format) in the dialog prompt.
  3. Allows configuring presets, custom size (KB/MB/%), dimension caps, format conversions, and placement modes.
  4. Executes compression and delivers an instant savings summary.

---

## Build System

- **Bundler**: `esbuild` (`esbuild.js`)
- **Output Target**: `build/image-compressor.compiled.js`
- **Packaging Logic**: Evaluates ESM modules into a self-contained IIFE (`(() => { ... return plugin; })()`) ensuring no global namespace pollution and full compatibility with Amplenote's plugin execution sandbox.
