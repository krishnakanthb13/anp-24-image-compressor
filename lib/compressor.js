/**
 * @file compressor.js
 * @description Image compression engine using Canvas API, metadata analysis, iterative quality reduction, and dimensional scaling.
 */
import { COMPRESSION_CONFIG } from "./constants.js";

/**
 * Formats a raw byte count into a human-readable string (e.g. "450 KB", "2.35 MB").
 *
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
export function formatBytes(bytes) {
    if (isNaN(bytes) || bytes <= 0) return "0 KB";
    const kb = bytes / 1024;
    if (kb < 1024) {
        return `${Math.round(kb)} KB`;
    }
    return `${(kb / 1024).toFixed(2)} MB`;
}

/**
 * Parses user size input supporting numbers, KB, MB, and percentage strings.
 *
 * @param {string|number} input - User input string (e.g. "500", "500kb", "1.5mb", "50%")
 * @param {number} [originalSizeBytes=0] - Original image size in bytes (for percentage calculations)
 * @returns {number} Target size in bytes
 */
export function parseSizeInput(input, originalSizeBytes = 0) {
    if (!input) return 500 * 1024;

    const str = String(input).trim().toLowerCase();

    // Percentage mode (e.g. "50%", "25%")
    if (str.endsWith("%")) {
        const percent = parseFloat(str);
        if (!isNaN(percent) && percent > 0 && originalSizeBytes > 0) {
            return Math.round((originalSizeBytes * percent) / 100);
        }
    }

    // Megabyte mode (e.g. "1.5mb", "2m")
    if (str.endsWith("mb") || str.endsWith("m")) {
        const num = parseFloat(str);
        if (!isNaN(num) && num > 0) {
            return Math.round(num * 1024 * 1024);
        }
    }

    // Kilobyte mode (e.g. "500kb", "500k", "500")
    const cleaned = str.replace(/kb|k/g, "").trim();
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num > 0) {
        return Math.round(num * 1024);
    }

    return 500 * 1024;
}

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
 * Pre-fetches and extracts metadata for an image (size, dimensions, MIME type, GIF detection).
 *
 * @param {string} imageUrl - The URL of the image
 * @param {string} proxyUrl - The CORS proxy base URL
 * @returns {Promise<object>} Image metadata object
 */
export async function fetchImageMetadata(imageUrl, proxyUrl) {
    const resolvedUrl = resolveImageUrl(imageUrl, proxyUrl);
    const response = await fetch(resolvedUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    const isGif = (blob.type && blob.type.includes("gif")) || imageUrl.toLowerCase().includes(".gif");
    let width = 0;
    let height = 0;

    try {
        const imgBitmap = await createImageBitmap(blob);
        width = imgBitmap.width;
        height = imgBitmap.height;
    } catch {
        // Fallback if createImageBitmap fails on unsupported formats
    }

    return {
        blob,
        resolvedUrl,
        size: blob.size,
        formattedSize: formatBytes(blob.size),
        width,
        height,
        mimeType: blob.type || "image/jpeg",
        isGif
    };
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
 * @param {string|Blob} imageSource - The URL of the image or a pre-fetched Blob
 * @param {number} targetSizeBytes - The maximum allowed size in bytes
 * @param {object} [options] - Compression options (maxDimension, format, preserveGif)
 * @param {object} [state] - Optional state object to track imageCount
 * @returns {Promise<object>} Compression result with dataUrl, size metrics, and savings
 */
export async function compressImage(imageSource, targetSizeBytes, options = {}, state = null) {
    if (isNaN(targetSizeBytes) || targetSizeBytes <= 0) {
        throw new Error("Invalid target size specified for compression");
    }

    let blob;
    if (imageSource instanceof Blob) {
        blob = imageSource;
    } else {
        const response = await fetch(imageSource);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        blob = await response.blob();
    }

    const originalBytes = blob.size;
    const maxDimension = Number(options.maxDimension) || 0;
    const isGif = (blob.type && blob.type.includes("gif")) || (typeof imageSource === "string" && imageSource.toLowerCase().includes(".gif"));

    // If preserveGif is enabled and image is a GIF, return untouched to preserve animation
    if (isGif && options.preserveGif) {
        return {
            dataUrl: URL.createObjectURL(blob),
            skipped: true,
            originalBytes,
            finalBytes: originalBytes,
            savingsPercent: 0,
            reason: "Preserved GIF animation"
        };
    }

    const img = await createImageBitmap(blob);
    let initialWidth = img.width;
    let initialHeight = img.height;

    // Apply max dimension constraint if specified
    if (maxDimension > 0 && (initialWidth > maxDimension || initialHeight > maxDimension)) {
        const ratio = Math.min(maxDimension / initialWidth, maxDimension / initialHeight);
        initialWidth = Math.round(initialWidth * ratio);
        initialHeight = Math.round(initialHeight * ratio);
    } else if (blob.size <= targetSizeBytes && maxDimension === 0) {
        // Original image already complies with both size and dimension limits
        return {
            dataUrl: URL.createObjectURL(blob),
            skipped: true,
            originalBytes,
            finalBytes: originalBytes,
            savingsPercent: 0
        };
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    let finalDataUrl = null;
    let finalBytes = originalBytes;
    let scale = 1.0;
    const outputMime = options.format === "image/png" ? "image/png" : "image/jpeg";

    while (scale >= 0.2) {
        canvas.width = Math.max(Math.round(initialWidth * scale), COMPRESSION_CONFIG.minDimension);
        canvas.height = Math.max(Math.round(initialHeight * scale), COMPRESSION_CONFIG.minDimension);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        if (outputMime === "image/png") {
            const dataUrl = canvas.toDataURL("image/png");
            const estimatedBytes = dataUrl.length * 0.75;
            if (estimatedBytes <= targetSizeBytes || scale <= 0.25) {
                finalDataUrl = dataUrl;
                finalBytes = Math.round(estimatedBytes);
                break;
            }
        } else {
            let quality = COMPRESSION_CONFIG.initialQuality;
            while (quality >= COMPRESSION_CONFIG.minQuality) {
                const dataUrl = canvas.toDataURL("image/jpeg", quality);
                const estimatedBytes = dataUrl.length * 0.75;
                if (estimatedBytes <= targetSizeBytes) {
                    finalDataUrl = dataUrl;
                    finalBytes = Math.round(estimatedBytes);
                    break;
                }
                quality = Math.round((quality - COMPRESSION_CONFIG.qualityStep) * 100) / 100;
            }
        }

        if (finalDataUrl) {
            break;
        }

        scale *= COMPRESSION_CONFIG.scaleStep;
        if (canvas.width <= COMPRESSION_CONFIG.minDimension && canvas.height <= COMPRESSION_CONFIG.minDimension) {
            break;
        }
    }

    if (!finalDataUrl) {
        finalDataUrl = canvas.toDataURL("image/jpeg", COMPRESSION_CONFIG.minQuality);
        finalBytes = Math.round(finalDataUrl.length * 0.75);
    }

    if (state && typeof state.imageCount === "number") {
        state.imageCount += 1;
    }

    const savingsPercent = originalBytes > finalBytes ? Math.round(((originalBytes - finalBytes) / originalBytes) * 100) : 0;

    return {
        dataUrl: finalDataUrl,
        skipped: false,
        originalBytes,
        finalBytes,
        savingsPercent,
        width: canvas.width,
        height: canvas.height
    };
}
