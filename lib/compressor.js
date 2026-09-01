/**
 * @file compressor.js
 * @description Image compression engine using Canvas API, iterative quality reduction, and dimensional scaling.
 */
import { COMPRESSION_CONFIG } from "./constants.js";

/**
 * Normalizes an image URL, routing through CORS proxy if necessary.
 *
 * @param {string} rawUrl - The source URL of the image
 * @param {string} proxyUrl - The CORS proxy base URL
 * @returns {string} Fully resolved URL ready for fetch
 */
export function resolveImageUrl(rawUrl, proxyUrl) {
    if (!rawUrl) return "";
    if (rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) {
        return rawUrl;
    }
    if (proxyUrl && !rawUrl.startsWith(proxyUrl)) {
        return `${proxyUrl}${rawUrl}`;
    }
    return rawUrl;
}

/**
 * Inserts a compressed image markdown tag immediately after the original image in the note content.
 *
 * @param {string} content - Markdown content of the note
 * @param {string} originalSrc - Original image src/URL
 * @param {string} newSrc - New compressed image URL
 * @param {string} [caption] - Optional caption
 * @returns {string} Updated markdown content
 */
export function insertImageBelow(content, originalSrc, newSrc, caption = "Compressed") {
    if (!content || !originalSrc || !newSrc) return content || "";

    // Escape special regex characters in originalSrc
    const escapedSrc = originalSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Pattern to match markdown image: ![optional caption](originalSrc)
    const regex = new RegExp(`(!\\[[^\\]]*\\]\\(${escapedSrc}\\))`, "g");

    if (regex.test(content)) {
        return content.replace(regex, `$1\n\n![${caption}](${newSrc})`);
    }

    // Fallback: append at the end of the note if specific markdown pattern wasn't matched
    return `${content}\n\n![${caption}](${newSrc})`;
}

/**
 * Compresses an image by fetching it and drawing it onto a canvas at decreasing quality and scale levels.
 *
 * @param {string} imageUrl - The URL of the image to fetch and compress
 * @param {number|string} targetSizeKB - The maximum allowed size in KB
 * @param {object} [state] - Optional state object to track imageCount
 * @returns {Promise<string>} Data URL or Blob URL of the compressed image
 * @throws {Error} If image fetching or canvas conversion fails
 */
export async function compressImage(imageUrl, targetSizeKB, state) {
    const targetSizeBytes = Number(targetSizeKB) * 1024;
    if (isNaN(targetSizeBytes) || targetSizeBytes <= 0) {
        throw new Error("Invalid target size specified for compression");
    }

    // Fetch image as blob
    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();

    // Check if the original image already complies with the target size
    if (blob.size <= targetSizeBytes) {
        return URL.createObjectURL(blob);
    }

    const img = await createImageBitmap(blob);
    let currentWidth = img.width;
    let currentHeight = img.height;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    let finalDataUrl = null;
    let scale = 1.0;

    // Iterative loop: reduce quality, then downscale dimensions if quality floor is reached
    while (scale >= 0.2) {
        canvas.width = Math.max(Math.round(currentWidth * scale), COMPRESSION_CONFIG.minDimension);
        canvas.height = Math.max(Math.round(currentHeight * scale), COMPRESSION_CONFIG.minDimension);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let quality = COMPRESSION_CONFIG.initialQuality;
        while (quality >= COMPRESSION_CONFIG.minQuality) {
            const dataUrl = canvas.toDataURL("image/jpeg", quality);
            const compressedSize = dataUrl.length * 0.75; // Base64 byte estimation
            if (compressedSize <= targetSizeBytes) {
                finalDataUrl = dataUrl;
                break;
            }
            quality = Math.round((quality - COMPRESSION_CONFIG.qualityStep) * 100) / 100;
        }

        if (finalDataUrl) {
            break;
        }

        // If quality reduction alone did not reach target size, step down scale
        scale *= COMPRESSION_CONFIG.scaleStep;
        if (canvas.width <= COMPRESSION_CONFIG.minDimension && canvas.height <= COMPRESSION_CONFIG.minDimension) {
            break;
        }
    }

    // Fallback: return lowest quality output from current canvas if target couldn't be strictly met
    if (!finalDataUrl) {
        finalDataUrl = canvas.toDataURL("image/jpeg", COMPRESSION_CONFIG.minQuality);
    }

    // Increment count on successful compression
    if (state && typeof state.imageCount === "number") {
        state.imageCount += 1;
    }

    return finalDataUrl;
}
