/**
 * @file image-compressor.js
 * @description Amplenote Image Compressor Plugin - Inspects and optimizes images in notes.
 *
 * Exposes:
 *  - constants: Default state tracker (imageCount)
 *  - noteOption["Optimize note"]: Guided 2-step note-level optimizer
 *  - imageOption["Optimize image"]: Live inspection and single-image optimizer
 *  - compressImage: Core compression engine method
 */
import { DEFAULT_CONSTANTS } from "./lib/constants.js";
import { compressImage } from "./lib/compressor.js";
import { optimizeNote } from "./lib/optimizeNote.js";
import { optimizeImage } from "./lib/optimizeImage.js";

const plugin = {
    constants: DEFAULT_CONSTANTS,
    noteOption: {
        "Optimize note": optimizeNote
    },
    imageOption: {
        "Optimize image": optimizeImage
    },
    compressImage
};

export default plugin;