# Social Media Announcements: Amplenote Image Compressor

## Released: Image Compressor v0.0.6 (2026-09-01)

### LinkedIn
Image Compressor v0.0.6 for Amplenote is officially live! 🖼️⚡

If you deal with note bloat, sluggish page loads, or oversized smartphone camera uploads in your personal knowledge base, this release transforms image optimization into a frictionless, privacy-first experience directly in your browser:

• Multi-Proxy CORS Cascade: Seamlessly bypasses cross-origin iframe sandbox restrictions using an automated multi-proxy failover cascade, ensuring rapid pre-fetching and zero fetch failures.
• Multi-Frame Viewport Lock: Eliminates jarring scroll jumps when opening dialogs or updating images in long notes by anchoring and restoring container scroll offsets across animation frames.
• Native Amplenote Caption Integration: Automatically updates the image native caption property and formats markdown with strict single-newline syntax, keeping audit metrics cleanly attached beneath the image box.
• Guided 2-Step Note Wizard: Inspect note images with exact dimensions and sizes in a clean checklist, with flexible choices between Quick Batch and Step-by-Step Individual configuration (or 1-click single image fast-track).
• Context-Aware Intelligence: Automatically detects already-optimized small images (<= 150 KB) and replaces static limits with smart relative reductions (50% / 75% / thumbnail).
• 100% Client-Side & Zero Runtime Dependencies: Compresses and resizes images entirely in memory via HTML5 Canvas 2D without sending uncompressed data to external servers.

Check out the open-source repository and install the plugin on GitHub:
https://github.com/krishnakanthb13/amplenote_stg_plugins/tree/main/anp-24-image-compressor

#Amplenote #OpenSource #Productivity #JavaScript #WebDev #PKM #SoftwareEngineering #Performance

---

### Twitter / X
🖼️ Image Compressor v0.0.6 for @Amplenote:

⚡ Multi-proxy CORS cascade
📍 Scroll lock on prompt open
📝 Native caption audit notes
🧙‍♂️ Guided 2-step optimizer
🔒 100% in-browser Canvas

https://github.com/krishnakanthb13/amplenote_stg_plugins/tree/main/anp-24-image-compressor

---

### Bluesky
🖼️ Image Compressor v0.0.6 for Amplenote:

• Multi-proxy CORS cascade
• Viewport & scroll lock
• Native caption audit formatting
• Guided 2-step note optimizer
• 100% in-browser Canvas compression

https://github.com/krishnakanthb13/amplenote_stg_plugins/tree/main/anp-24-image-compressor

---

### Mastodon
🖼️ Image Compressor v0.0.6 for Amplenote is now available!

Highlights:
• Multi-proxy CORS fallback cascade for sandboxed fetching
• Multi-frame viewport & scroll lock
• Native Amplenote image caption formatting
• 2-step batch & individual workflows
• 46/46 automated unit tests & zero runtime dependencies

Open source under GPL-3.0:
https://github.com/krishnakanthb13/amplenote_stg_plugins/tree/main/anp-24-image-compressor

#Amplenote #PKM #Productivity #OpenSource #JavaScript

---

### Reddit
**Suggested Subreddits:** `r/Amplenote`, `r/PKM`, `r/NoteTaking`, `r/Productivity`, `r/javascript`, `r/webdev`

**Title:** I built an in-browser, privacy-first Image Compressor plugin for Amplenote with multi-proxy fallback, scroll preservation, and native caption audit notes

Hey everyone!

I've been working on solving note bloat and sluggish rendering in Amplenote caused by high-resolution smartphone screenshots and multi-megabyte camera uploads.

Today I'm releasing **Image Compressor v0.0.6** for Amplenote — an open-source, client-side plugin that lets you inspect, resize, and compress images directly inside your notes without third-party server processing.

### Key Technical Features & Challenges Solved:
1. **Multi-Proxy CORS Cascade (`fetchWithCorsFallback`)**: Amplenote plugins run inside sandboxed iframes (`plugins.amplenote.com`), which triggered cross-origin fetch blocks when downloading images. Implemented an automated fallback cascade across proxy endpoints so image pre-fetching and metadata inspection always succeed seamlessly.
2. **Viewport & Scroll Lock (`withPreservedScroll`)**: Opening modal prompts previously caused editor blur events that reset long notes back to `scrollTop = 0`. Implemented container scroll offset capture and multi-frame animation anchoring (`0ms`, `50ms`, `200ms`, `500ms`) so your view stays locked right on the image you're working on.
3. **Native Caption Formatting**: Aligned caption output with Amplenote's strict single-newline syntax (`![Compressed](url)\n> 🗜️ Caption`), while also updating Amplenote's native `caption` property in in-place replacement mode.
4. **Context-Aware Intelligence**: Replaced static 500 KB limits with dynamic reduction presets based on actual image size (e.g. 50% / 16 KB reduction for a 31 KB image, with exact percentage savings calculated for 4 MB photos).
5. **Guided 2-Step Wizard**: Step 1 gives you a clean checklist of all images with sizes and dimensions; Step 2 lets you choose between Quick Batch and Step-by-Step Individual configuration (with fast-track for single selections).
6. **Pure Client-Side**: Powered purely by HTML5 Canvas 2D, `createImageBitmap`, and `Blob` APIs with zero external runtime dependencies.

### Installation & Source Code:
Everything is open-source under GPL v3:
- GitHub: https://github.com/krishnakanthb13/amplenote_stg_plugins/tree/main/anp-24-image-compressor

Feedback and pull requests are very welcome!
