# Image Compressor Plugin for Amplenote

A high-performance, privacy-first Amplenote plugin that intelligently inspects, analyzes, and compresses images in your notes directly within the browser using the HTML5 Canvas API. Features viewport/scroll position preservation, a clean 2-step guided workflow, intelligent size thresholds, contextual reduction presets, real-time metadata inspection, interactive multi-image selection, resolution downscaling, format optimization, native Amplenote image caption formatting, and non-destructive audit tagging.

---

## Actions & Options

- 📝 **`noteOption["Optimize note"]`**: Note-level multi-image optimizer with guided 2-step workflow (Quick Batch or Step-by-Step Individual).
- 🖼️ **`imageOption["Optimize image"]`**: Direct drop-down menu action on any individual image in your note with live metadata analysis and instant savings alerts.

---

## Key Features

- 📍 **Viewport & Scroll Position Preservation**:
  - Automatically captures the editor's scroll position and active image element before opening modal dialogs and seamlessly restores viewport alignment across multiple animation frames (`0ms`, `50ms`, `200ms`, `500ms`), preventing the editor from jumping or resetting cursor to the top of the note.
- 🛡️ **Dual Output Modes**:
  - **Surgical In-Place Replacement (`replace`)**: Uses direct ProseMirror image node swaps (`updateNoteImage` / `note.updateImage`). Updates only the target image's `src` and native `caption` property without reading, modifying, or reloading the note's markdown. Zero formatting disruption, zero task checklist resets, and zero scroll jumping.
  - **Save to Report Note in `-reports/-image-compressor` (`new_note`)**: A non-destructive export mode that leaves the active note **100% untouched**. Automatically creates a dedicated report note filed under the `-reports/-image-compressor` tag, attaches all compressed images, adds before/after size benchmarks, and generates clickable backlinks to the source note.
- 🧙‍♂️ **Guided 2-Step Workflow (`noteOption` -> "Optimize note")**:
  - **Step 1 — Clean Image Selector**: Presents a clean, focused checklist showing each image's size, dimensions ($W \times H$), and `[Needs Optimization]` vs `[Optimized]` status badges, without overwhelming the user with settings.
  - **Step 2 — Flexible Strategy Choice**:
    - **`⚡ Quick Batch`**: Apply unified target size, format, dimension limits, and output mode across all selected images in a single prompt.
    - **`🎯 Step-by-Step Individual`**: Inspect and configure each selected image individually with its own custom target size, dimension cap, format, and placement mode.
    - **Fast-Track**: If only 1 image is selected, fast-tracks directly to its individual configuration.
- 🧠 **Context-Aware Intelligence**:
  - **No Illogical 500 KB Targets on Small Images**: When inspecting a lightweight image (e.g. 31 KB), the plugin automatically detects that it is already optimized and replaces static targets with relative reduction options (`50% Reduction (~16 KB)`, `75% Reduction (~8 KB)`, `Tiny Thumbnail (10 KB)`).
  - **Note-Wide Optimization Status**: When analyzing a note where all images are already small (e.g., 3 images totaling 95 KB), the dialog immediately confirms that all images are already lightweight and optimized, avoiding false alarm banners.
  - **Smart Dimension Filtering**: Dimension caps are scaled to the image's actual resolution (e.g., a 612 px image will only offer `Keep 612 px` or `Max 400 px Thumbnail`, not irrelevant 1920 px Full HD options).
  - **Contextual Format Conversion**: Format conversion options are tailored to whether the source image is PNG/WebP (70–90% reduction via JPEG) or already standard JPEG.
- 📊 **Real-Time Image Inspection**: Pre-fetches and displays exact file sizes (in KB/MB), pixel dimensions ($W \times H$), and MIME types before compressing.
- 🎯 **Single-Image Optimization (`imageOption` -> "Optimize image")**: Direct drop-down menu action on any individual image in your note with live metadata analysis and instant savings alerts.
- ⚡ **Presets & Flexible Custom Sizing**: Choose from smart contextual presets (`500 KB`, `250 KB`, `100 KB`, `50% reduction`, `25% reduction`) or enter custom targets supporting `KB`, `MB`, and `%`.
- 🔄 **PNG/WebP to JPEG Optimization**: Optional automatic format conversion to reduce photographic screenshots and PNGs by 70–90%.
- 📐 **Max Width Dimension Limiting**: Constrain massive 4K/iPhone camera photos to standard display sizes (`1920 px Full HD`, `1280 px HD`, `800 px Inline`) preserving aspect ratio.
- 🎬 **GIF Animation Protection**: Automatically detects animated `.gif` files with an option to skip them so animations are preserved.
- 📈 **Detailed Savings Report**: Displays comprehensive before/after statistics and percentage space saved upon completion.
- 🔒 **Zero Third-Party Runtime Dependencies**: Runs purely client-side using standard Web Platform APIs (`Canvas 2D`, `createImageBitmap`, `fetch`, `Blob`).

---

## Output Modes Breakdown

### 1. In-Place Surgical Replacement (`replace`)
- Targets only the specific image object in Amplenote's internal document tree using `app.context.updateImage({ src, caption })` or `app.updateNoteImage(noteHandle, image, { src, caption })`.
- Does **not** replace the full note markdown.
- Directly updates the image `src` URL and binds the compression audit caption (`Compressed: 355 KB (was 3.98 MB — 91% saved)`) to Amplenote's native caption container.

### 2. Save to New Report Note (`new_note`)
- Creates a dedicated note tagged with `["-reports/-image-compressor"]` titled `YYYY-MM-DD HH:mm:ss`.
- Attaches the newly compressed images to the report note with the audit metrics attached directly as the image caption: `![Image 1 • 250 KB (was 1.2 MB — 79% saved)](hostedURL)`.
- Binds native ProseMirror captions to the image cards in the report note.
- Inserts a structured report with a summary statistics table and a backlink to the source note.
- Leaves the active source note **100% unmodified and untouched**.

---

## Installation

1. **Create a Plugin Note**: In Amplenote, create a new note titled `Image Compressor Plugin`.
2. **Setup Metadata Table**: At the very top of the note, insert a table with the following properties:

| Field | Value |
| :--- | :--- |
| `name` | Image Compressor |
| `description` | Inspect and optimize oversized images in your notes with intelligent presets, guided batch/individual workflows, and non-destructive options. |
| `icon` | photo_size_select_large |
| `instructions` | Use the note options menu (...) -> "Optimize note" to inspect and select images to compress, or click the triple dot menu on any image -> "Optimize image" to inspect and optimize an individual image. |

3. **Insert Code Block**: Below the metadata table, insert a Javascript code block (type ` ```javascript `).
4. **Paste Compiled Code**: Copy the entire contents of [`build/image-compressor.compiled.js`](build/image-compressor.compiled.js) and paste it into the code block.
5. **Activate Plugin**: Navigate to **Account Settings** -> **Plugins**, and select your newly created note.

---

## Usage Workflows

### 1. Optimize Note (`noteOption` -> "Optimize note")
```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Selector Dialog: Select Images & Strategy                │
│    [x] Image 1: 3.2 MB (4032×3024px) [Needs Optimization]   │
│    [x] Image 2: 1.8 MB (1920×1080px) [Needs Optimization]   │
│    Strategy: [⚡ Quick Batch | 🎯 Step-by-Step Individual]   │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ Branch A: Quick Batch        │    │ Branch B: Step-by-Step       │
│ • Unified Target Size        │    │ • Image 1: Custom Settings   │
│ • Unified Max Dimension Cap  │    │ • Image 2: Custom Settings   │
│ • Unified Placement Mode     │    │ • Individual Format Options  │
└──────────────┬───────────────┘    └──────────────┬───────────────┘
               │                                   │
               └─────────────────┬─────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 🎉 Savings Report: "Saved 4.2 MB (78% space reduction)"     │
└─────────────────────────────────────────────────────────────┘
```

1. Click the note menu (`...`) -> **Optimize note**.
2. **Step 1 (Image Selector)**:
   - Check the images you want to optimize (oversized images $> 500$ KB are pre-checked).
   - Choose **⚡ Quick Batch** (apply settings to all) or **🎯 Step-by-Step** (customize each image).
3. **Step 2 (Configuration)**:
   - In **Quick Batch**: Configure a single dialog with preset size, dimension cap, format, and mode.
   - In **Step-by-Step**: Configure each image individually with dedicated inspection metrics.
4. **Savings Summary**: Review the final report showing total space reduction across the note.

---

### 2. Optimize Image (`imageOption` -> "Optimize image")
1. Click the drop-down menu on any image in a note -> **Optimize image**.
2. The dialog immediately displays:
   - Current file size in KB/MB and exact byte count.
   - Pixel dimensions ($W \times H$).
   - Current format and animated GIF detection.
   - Intelligent status badge (`Already Optimized`, `Within Limits`, or `Large Image`).
3. Select your target preset (with calculated percentage savings), custom threshold, dimension limit, and placement mode.
4. The image is compressed and attached seamlessly with a detailed before/after savings summary and caption update while your scroll position is preserved.

---

## Technical Architecture

```
anp-24-image-compressor/
├── image-compressor.js       ← Slim plugin entry point
├── build/
│   └── image-compressor.compiled.js  ← Compiled IIFE bundle
├── lib/
│   ├── constants.js          ← Thresholds, presets, dimension limits, quality steps
│   ├── compressor.js         ← Metadata inspection, CORS fallback, scroll lock, multi-pass canvas loop
│   ├── optimizeNote.js       ← noteOption guided 2-step workflow handler
│   ├── optimizeImage.js      ← imageOption live inspection & optimization handler
│   └── index.js              ← Barrel export
└── test/
    ├── constants.test.js     ← Unit tests for constants
    ├── compressor.test.js    ← Tests for compression engine, CORS cascade, smart presets, scroll anchor
    ├── optimizeNote.test.js  ← Tests for guided workflows, batch & step-by-step modes, captions
    ├── optimizeImage.test.js ← Tests for image inspection, captions, & format conversion
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