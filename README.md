# Image Compressor Plugin for Amplenote

A high-performance Amplenote plugin that detects oversized images in your notes, compresses them directly within the browser using the HTML5 Canvas API, and replaces them in-place or non-destructively inserts the compressed version below the original.

---

## Features

- ⚡ **Whole-Note Optimization (`noteOption`)**: Scans all images within the active note and compresses those exceeding your chosen size threshold.
- 🎯 **Single-Image Optimization (`imageOption`)**: Direct drop-down menu action on any individual image in your note to compress it instantly.
- 🛡️ **Dual Placement Modes**:
  - **In-place Replacement (`replace`)**: Updates note images directly with their optimized versions.
  - **Append Below (`append`)**: Safely preserves the original full-resolution image and inserts the compressed version (`![Compressed](...)`) immediately below it.
- 📐 **Intelligent Multi-Pass Compression**: Decreases JPEG quality (from 0.9 down to 0.1) and iteratively downsamples dimensions proportionally if needed, guaranteeing target file size compliance without blur artifacts.
- ⚙️ **Smart Default (500 KB)**: Pre-configured with a 500 KB threshold (ideal for fast loading across low-bandwidth connections and published notes), while allowing arbitrary custom thresholds.
- 🔒 **Zero Third-Party Runtime Dependencies**: Runs purely client-side using standard Web Platform APIs (`Canvas 2D`, `createImageBitmap`, `fetch`, `Blob`).

---

## Installation

1. **Create a Plugin Note**: In Amplenote, create a new note titled `Image Compressor Plugin`.
2. **Setup Metadata Table**: At the very top of the note, insert a table with the following properties:

| Field | Value |
| :--- | :--- |
| `name` | Image Compressor |
| `description` | Detect and compress oversized images in your notes in-place or append below to improve load times and reduce bandwidth. |
| `icon` | photo_size_select_large |
| `instructions` | Use the note options menu (...) -> "Optimize note" to scan and compress all images in a note, or click the triple dot menu on any image -> "Compress image" to optimize an individual image. |

3. **Insert Code Block**: Below the metadata table, insert a Javascript code block (type ` ```javascript `).
4. **Paste Compiled Code**: Copy the entire contents of [`build/image-compressor.compiled.js`](build/image-compressor.compiled.js) and paste it into the code block.
5. **Activate Plugin**: Navigate to **Account Settings** -> **Plugins**, and select your newly created note.

---

## Usage

### 1. Optimize Note (`noteOption`)
- Open any note with images.
- Click the note action menu (`...` at the top right) -> **Optimize note**.
- A dialog will prompt you for:
  1. **Max image size (KB)** (Default: `500`).
  2. **Output mode**:
     - *Replace existing images in-place*
     - *Add compressed images below original (Keep original)*
- The plugin fetches, compresses, uploads, and updates images, then displays a clear summary alert.

### 2. Compress Single Image (`imageOption`)
- Hover over or select an image in your note.
- Click the image's dropdown menu -> **Compress image**.
- Choose your target max size (KB) and output mode.
- The compressed image is attached and inserted or replaced seamlessly.

---

## Technical Architecture

```
anp-24-image-compressor/
├── image-compressor.js       ← Slim plugin entry point
├── build/
│   └── image-compressor.compiled.js  ← Compiled IIFE bundle
├── lib/
│   ├── constants.js          ← Constants, defaults (500 KB), quality thresholds
│   ├── compressor.js         ← Core Canvas compression & markdown insertion logic
│   ├── optimizeNote.js       ← noteOption ["Optimize note"] handler
│   ├── optimizeImage.js      ← imageOption ["Compress image"] handler
│   └── index.js              ← Barrel export
└── test/
    ├── constants.test.js     ← Unit tests for constants
    ├── compressor.test.js    ← Unit tests for compression engine & URL routing
    ├── optimizeNote.test.js  ← Tests for noteOption workflows
    ├── optimizeImage.test.js ← Tests for imageOption workflows
    └── image-compressor.test.js ← API compliance tests
```

---

## Building from Source

To compile the modular source code into the production bundle:

```bash
# Build specific plugin ID
node esbuild.js 24

# Run test suite
node --experimental-vm-modules node_modules/jest/bin/jest.js "anp-24-image-compressor/test"
```