# Image Compressor Plugin for Amplenote

A high-performance Amplenote plugin that inspects, analyzes, and compresses oversized images in your notes directly within the browser using the HTML5 Canvas API. Features real-time size inspection, interactive multi-image selection, resolution downscaling, format optimization, and non-destructive audit tagging.

---

## Key Features

- 📊 **Real-Time Image Inspection**: Pre-fetches and displays exact file sizes (in KB/MB), pixel dimensions ($W \times H$), and MIME types before compressing.
- 📋 **Multi-Image Selection Checklist (`noteOption`)**: Shows an interactive checklist of all images in the note with their current sizes and dimensions, allowing you to select exactly which images to optimize.
- 🎯 **Single-Image Optimization (`imageOption`)**: Direct drop-down menu action on any individual image in your note with live metadata analysis.
- ⚡ **Presets & Flexible Custom Sizing**: Choose from convenient quick presets (`500 KB`, `250 KB`, `100 KB`, `50% of original`, `25% of original`) or enter custom targets supporting `KB`, `MB`, and `%`.
- 🔄 **PNG/WebP to JPEG Optimization**: Optional automatic format conversion to reduce photographic screenshots and PNGs by 70–90%.
- 📐 **Max Width Dimension Limiting**: Constrain massive 4K/iPhone camera photos to standard display sizes (`1920 px Full HD`, `1280 px HD`, `800 px Inline`) preserving aspect ratio.
- 🎬 **GIF Animation Protection**: Automatically detects animated `.gif` files with an option to skip them so animations are preserved.
- 🛡️ **Dual Placement Modes**:
  - **In-place Replacement (`replace`)**: Updates note images directly with their optimized versions.
  - **Append Below (`append`)**: Safely preserves the original full-resolution image and inserts the compressed version (`![Compressed (480 KB from 3.2 MB): Caption](...)`) immediately below it.
- 📈 **Detailed Savings Report**: Displays comprehensive before/after statistics and percentage space saved upon completion.
- 🔒 **Zero Third-Party Runtime Dependencies**: Runs purely client-side using standard Web Platform APIs (`Canvas 2D`, `createImageBitmap`, `fetch`, `Blob`).

---

## Installation

1. **Create a Plugin Note**: In Amplenote, create a new note titled `Image Compressor Plugin`.
2. **Setup Metadata Table**: At the very top of the note, insert a table with the following properties:

| Field | Value |
| :--- | :--- |
| `name` | Image Compressor |
| `description` | Inspect and compress oversized images in your notes with custom presets, interactive checklist, and non-destructive options. |
| `icon` | photo_size_select_large |
| `instructions` | Use the note options menu (...) -> "Optimize note" to inspect and select images to compress, or click the triple dot menu on any image -> "Compress image" to inspect and optimize an individual image. |

3. **Insert Code Block**: Below the metadata table, insert a Javascript code block (type ` ```javascript `).
4. **Paste Compiled Code**: Copy the entire contents of [`build/image-compressor.compiled.js`](build/image-compressor.compiled.js) and paste it into the code block.
5. **Activate Plugin**: Navigate to **Account Settings** -> **Plugins**, and select your newly created note.

---

## Usage

### 1. Optimize Note (`noteOption` -> "Optimize note")
1. Open any note with images and click the note menu (`...`) -> **Optimize note**.
2. An interactive dialog presents:
   - **Image Checklist**: Each image listed with its current size, dimensions, and caption. Images $> 500$ KB are pre-checked automatically.
   - **Target Size Preset**: Quick profiles (`500 KB`, `250 KB`, `100 KB`, `50%`, `25%`).
   - **Custom Target Size**: Enter custom values like `300 KB`, `1.2 MB`, or `40%`.
   - **Max Width Limit**: Optional resolution cap (`1920 px`, `1280 px`, `800 px`).
   - **Format Optimization**: Convert PNG/WebP to JPEG for maximum space savings.
   - **Output Mode**: In-place replacement vs. append below original.
   - **GIF Handling**: Skip animated GIFs to preserve animation.
3. Review the savings report showing total space reduction!

### 2. Compress Single Image (`imageOption` -> "Compress image")
1. Click the drop-down menu on any image in a note -> **Compress image**.
2. The dialog immediately displays:
   - Current file size in KB/MB and exact byte count.
   - Pixel dimensions ($W \times H$).
   - Current format and animated GIF detection.
3. Select your target preset, custom threshold, dimension limit, and placement mode.
4. The image is compressed and attached seamlessly.

---

## Technical Architecture

```
anp-24-image-compressor/
├── image-compressor.js       ← Slim plugin entry point
├── build/
│   └── image-compressor.compiled.js  ← Compiled IIFE bundle
├── lib/
│   ├── constants.js          ← Presets, dimension limits, quality steps
│   ├── compressor.js         ← Metadata inspection, parsing, multi-pass canvas loop
│   ├── optimizeNote.js       ← noteOption multi-image checklist handler
│   ├── optimizeImage.js      ← imageOption live inspection & optimization handler
│   └── index.js              ← Barrel export
└── test/
    ├── constants.test.js     ← Unit tests for constants
    ├── compressor.test.js    ← Tests for compression engine & metadata parsing
    ├── optimizeNote.test.js  ← Tests for checklist & savings report
    ├── optimizeImage.test.js ← Tests for image inspection & format conversion
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