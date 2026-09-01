/**
 * @file constants.js
 * @description Configuration constants, baseline thresholds, and defaults for the Image Compressor plugin.
 */

export const CORS_PROXY_URL = "https://amplenote-plugins-cors-anywhere.onrender.com/";

/**
 * Standard recommended maximum size per image in Kilobytes for note publishing and fast loading.
 * @type {number}
 */
export const DEFAULT_MAX_SIZE_KB = 500;

/**
 * Size threshold below which an image is considered already lightweight and optimized.
 * @type {number}
 */
export const LIGHTWEIGHT_THRESHOLD_KB = 150;

/**
 * Modes for handling compressed images.
 * - REPLACE: Overwrite/update existing image in-place (surgical).
 * - NEW_NOTE: Save compressed image(s) to a dedicated report note in -reports/-image-compressor (non-destructive).
 */
export const COMPRESSION_MODES = {
    REPLACE: "replace",
    NEW_NOTE: "new_note"
};

/**
 * Amplenote tag applied to newly generated compression report notes.
 */
export const REPORT_TAG = "-reports/-image-compressor";

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

