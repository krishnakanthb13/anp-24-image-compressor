/**
 * @file constants.js
 * @description Configuration constants, presets, and defaults for the Image Compressor plugin.
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
 * Preset target size profiles.
 */
export const SIZE_PRESETS = [
    { label: "🚀 Standard / Web (500 KB)", value: "500kb" },
    { label: "📱 Mobile / Fast Load (250 KB)", value: "250kb" },
    { label: "⚡ Compact / Thumbnail (100 KB)", value: "100kb" },
    { label: "📉 50% of Current Size", value: "50%" },
    { label: "📉 25% of Current Size", value: "25%" },
    { label: "✏️ Custom Input (Use field below)", value: "custom" }
];

/**
 * Max width / resolution limits.
 */
export const DIMENSION_LIMITS = [
    { label: "Keep Original Dimensions", value: "0" },
    { label: "Max 1920 px (Full HD)", value: "1920" },
    { label: "Max 1280 px (Standard HD)", value: "1280" },
    { label: "Max 800 px (Small / Inline)", value: "800" }
];

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
