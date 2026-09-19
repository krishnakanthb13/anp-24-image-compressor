/**
 * @file image-compressor.js
 * @description Amplenote Image Compressor Plugin - Inspects and optimizes images in notes.
 *
 * Exposes:
 *  - constants: Default state tracker (imageCount)
 *  - noteOption["Optimize note"]: Guided 2-step note-level optimizer
 *  - imageOption["Optimize"]: Live inspection and single-image optimizer
 *  - imageOption["Download"]: 1-click shortcut to compress and download image
 *  - compressImage: Core compression engine method
 */
import { DEFAULT_CONSTANTS } from "./lib/constants.js";
import { compressImage } from "./lib/compressor.js";
import { optimizeNote } from "./lib/optimizeNote.js";
import { optimizeImage, downloadImageOption } from "./lib/optimizeImage.js";

const plugin = {
    constants: DEFAULT_CONSTANTS,
    noteOption: {
        "Optimize note": optimizeNote
    },
    imageOption: {
        "Optimize": optimizeImage,
        "Download": downloadImageOption
    },
    compressImage
};

export default plugin;