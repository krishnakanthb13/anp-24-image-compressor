/**
 * @file constants.js
 * @description Configuration constants and default values for the Image Compressor plugin.
 */

export const CORS_PROXY_URL = "https://amplenote-plugins-cors-anywhere.onrender.com/";

/**
 * Default maximum size per image in Kilobytes (per ds.md specification).
 * @type {number}
 */
export const DEFAULT_MAX_SIZE_KB = 500;

/**
 * Modes for handling compressed images.
 * - REPLACE: Overwrite/update existing image in-place.
 * - APPEND: Keep existing image intact and add the compressed image below it.
 */
export const COMPRESSION_MODES = {
    REPLACE: "replace",
    APPEND: "append"
};

/**
 * Quality stepping configuration for canvas compression loop.
 */
export const COMPRESSION_CONFIG = {
    initialQuality: 0.9,
    minQuality: 0.1,
    qualityStep: 0.1,
    scaleStep: 0.8,
    minDimension: 100
};

export const DEFAULT_CONSTANTS = {
    imageCount: 0
};
