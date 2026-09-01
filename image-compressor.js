/**
 * @file image-compressor.js
 * @description Main entry point for the Image Compressor Amplenote Plugin.
 * @author Krishna Kanth B
 */
import { DEFAULT_CONSTANTS } from "./lib/constants.js";
import { compressImage } from "./lib/compressor.js";
import { optimizeNote } from "./lib/optimizeNote.js";
import { optimizeImage } from "./lib/optimizeImage.js";

/**
 * Amplenote Plugin definition.
 */
export default {
    constants: { ...DEFAULT_CONSTANTS },

    noteOption: {
        "Optimize note": optimizeNote
    },

    imageOption: {
        "Compress image": optimizeImage
    },

    compressImage
};