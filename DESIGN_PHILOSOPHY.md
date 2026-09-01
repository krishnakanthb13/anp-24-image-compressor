# Design Philosophy — Image Compressor (`anp-24`)

## Goal
To deliver a lightweight, secure, and intuitive image compression solution for Amplenote that drastically improves page load times on low-bandwidth connections while giving users complete control over destructive vs. non-destructive modifications.

---

## Core Principles

### 1. Non-Destructive Safety First ("-reports/-image-compressor" Mode)
Modifying active notes in-place can be risky for users who want to preserve original high-resolution assets or avoid any risk of markdown re-parsing.
- **Decision**: Provide an **"Export to new note in `-reports/-image-compressor`"** option alongside surgical in-place replacement.
- **Benefit**: The active note stays 100% untouched. All optimized assets, benchmarks, and backlinks are organized under Amplenote's tag hierarchy.

### 2. Surgical Precision for In-Place Updates
Overwriting a note's markdown to update a single image can reset task checkboxes, detach blockquotes, and disrupt cursor position.
- **Decision**: Use direct ProseMirror node updates (`updateNoteImage` / `note.updateImage`) that modify only the targeted image element.
- **Benefit**: Zero note re-rendering, zero markdown parsing side-effects, and instant native caption binding.

### 2. Practical Standard Defaults (500 KB Limit)
Published notes and everyday note viewing rarely require multi-megabyte images.
- **Decision**: Pre-fill prompts with `500` KB (aligned directly with the `ds.md` specification).
- **Benefit**: Users can simply hit `Enter` / confirm to achieve instant bandwidth optimization without having to calculate threshold numbers manually.

### 3. Dimensional Scaling Over Compression Artifacts
Pushing JPEG compression quality below `0.1` on huge 4K/8K images creates severe pixelation and banding without achieving target byte limits.
- **Decision**: Combine quality stepping with iterative canvas downscaling (`scaleStep = 0.8`).
- **Benefit**: Images remain crisp and visually balanced while strictly adhering to the specified file size.

### 4. Zero Supply-Chain Footprint
Third-party browser compression libraries add unnecessary bundle bloat and maintenance overhead.
- **Decision**: Utilize standard Web APIs (`HTMLCanvasElement`, `createImageBitmap`, `fetch`, `Blob`, `URL`).
- **Benefit**: Keeps the compiled bundle small (~11 KB), fast to load, and free of external runtime vulnerabilities.

### 5. Defensive UX and Error Resilience
Network calls, CORS proxies, and canvas decodes can encounter transient errors.
- **Decision**: Individual image failures never crash the whole-note optimization process. Detailed summary alerts report exact counts of compressed, skipped, and failed items.
