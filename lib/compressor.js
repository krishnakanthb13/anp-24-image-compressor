/**
 * @file compressor.js
 * @description Image compression engine with metadata analysis, CORS fallback cascade, intelligent contextual presets, iterative quality reduction, and dimensional scaling.
 */
import { COMPRESSION_CONFIG, DEFAULT_MAX_SIZE_KB, CORS_PROXY_URL } from "./constants.js";

/**
 * Converts a Blob to a Data URL string.
 *
 * @param {Blob} blob - The blob to convert
 * @returns {Promise<string>} Base64 Data URL
 */
export function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        if (typeof FileReader !== "undefined") {
            const reader = new FileReader();
            reader.onload = () => resolve(/** @type {string} */ (reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        } else if (blob && typeof blob.arrayBuffer === "function") {
            blob.arrayBuffer().then(buffer => {
                const bytes = new Uint8Array(buffer);
                let binary = "";
                for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64 = typeof btoa === "function" ? btoa(binary) : (typeof Buffer !== "undefined" ? Buffer.from(binary, "binary").toString("base64") : "");
                resolve(`data:${blob.type || "image/jpeg"};base64,${base64}`);
            }).catch(reject);
        } else {
            resolve("");
        }
    });
}

/**
 * Formats a raw byte count into a human-readable string (e.g. "31 KB", "2.45 MB").
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
 * Generates intelligent, size-relative presets based on the actual size of the image.
 *
 * @param {number} imageSizeBytes - Current size of the image in bytes
 * @returns {Array<{label: string, value: string}>} Context-aware presets
 */
export function getSmartSizePresets(imageSizeBytes = 0) {
    const sizeKB = imageSizeBytes > 0 ? imageSizeBytes / 1024 : DEFAULT_MAX_SIZE_KB;

    // Small images (e.g. 31 KB, <= 150 KB)
    if (sizeKB <= 150) {
        const halfSize = Math.max(Math.round(sizeKB * 0.5), 5);
        const quarterSize = Math.max(Math.round(sizeKB * 0.25), 3);
        return [
            { label: `📉 50% Reduction (~${halfSize} KB)`, value: "50%" },
            { label: `📉 75% Reduction (~${quarterSize} KB)`, value: "25%" },
            { label: "⚡ Tiny Thumbnail (10 KB)", value: "10kb" },
            { label: "✏️ Custom Input (Set below)", value: "custom" }
        ];
    }

    // Medium images (150 KB - 600 KB)
    if (sizeKB <= 600) {
        return [
            { label: `📱 Mobile / Fast Load (250 KB)`, value: "250kb" },
            { label: `⚡ Compact / Thumbnail (100 KB)`, value: "100kb" },
            { label: `📉 50% of Current Size (~${Math.round(sizeKB * 0.5)} KB)`, value: "50%" },
            { label: "✏️ Custom Input (Set below)", value: "custom" }
        ];
    }

    // Large images (> 600 KB, e.g. 2.8 MB)
    const savings500 = Math.round(((imageSizeBytes - 500 * 1024) / imageSizeBytes) * 100);
    const savings250 = Math.round(((imageSizeBytes - 250 * 1024) / imageSizeBytes) * 100);
    const savings100 = Math.round(((imageSizeBytes - 100 * 1024) / imageSizeBytes) * 100);

    return [
        { label: `🚀 Standard / Web (500 KB — ${savings500}% space saved)`, value: "500kb" },
        { label: `📱 Mobile / Fast Load (250 KB — ${savings250}% space saved)`, value: "250kb" },
        { label: `⚡ Compact / Thumbnail (100 KB — ${savings100}% space saved)`, value: "100kb" },
        { label: `📉 50% of Current Size (${formatBytes(imageSizeBytes * 0.5)})`, value: "50%" },
        { label: "✏️ Custom Input (Set below)", value: "custom" }
    ];
}

/**
 * Generates intelligent dimension limits matching the actual width of the image.
 *
 * @param {number} currentWidth - Image width in pixels
 * @returns {Array<{label: string, value: string}>} Relevant dimension options
 */
export function getSmartDimensionLimits(currentWidth = 0) {
    if (!currentWidth || currentWidth <= 800) {
        const origLabel = currentWidth > 0 ? `Keep Original (${currentWidth} px)` : "Keep Original Dimensions";
        return [
            { label: origLabel, value: "0" },
            { label: "Max 400 px (Thumbnail)", value: "400" }
        ];
    }

    if (currentWidth <= 1280) {
        return [
            { label: `Keep Original (${currentWidth} px)`, value: "0" },
            { label: "Max 800 px (Small / Inline)", value: "800" },
            { label: "Max 400 px (Thumbnail)", value: "400" }
        ];
    }

    if (currentWidth <= 1920) {
        return [
            { label: `Keep Original (${currentWidth} px)`, value: "0" },
            { label: "Max 1280 px (Standard HD)", value: "1280" },
            { label: "Max 800 px (Small / Inline)", value: "800" }
        ];
    }

    // Very high resolution (> 1920 px, e.g. 4K)
    return [
        { label: `Keep Original (${currentWidth} px)`, value: "0" },
        { label: "Max 1920 px (Full HD)", value: "1920" },
        { label: "Max 1280 px (Standard HD)", value: "1280" },
        { label: "Max 800 px (Small / Inline)", value: "800" }
    ];
}

/**
 * Suggests an intelligent default target size string based on current image size.
 *
 * @param {number} imageSizeBytes - Current size in bytes
 * @returns {string} Contextual default input value
 */
export function getSmartDefaultTarget(imageSizeBytes = 0) {
    if (imageSizeBytes <= 0) return `${DEFAULT_MAX_SIZE_KB} KB`;
    const sizeKB = imageSizeBytes / 1024;
    if (sizeKB <= 100) {
        return `${Math.max(Math.round(sizeKB * 0.5), 5)} KB`;
    }
    if (sizeKB <= 500) {
        return "250 KB";
    }
    return `${DEFAULT_MAX_SIZE_KB} KB`;
}

/**
 * Parses user size input supporting numbers, KB, MB, and percentage strings.
 *
 * @param {string|number} input - User input string (e.g. "500", "500kb", "1.5mb", "50%")
 * @param {number} [originalSizeBytes=0] - Original image size in bytes (for percentage calculations)
 * @returns {number} Target size in bytes
 */
export function parseSizeInput(input, originalSizeBytes = 0) {
    if (!input) return DEFAULT_MAX_SIZE_KB * 1024;

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

    return DEFAULT_MAX_SIZE_KB * 1024;
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
 * Fetches an image using a robust CORS proxy fallback cascade with timeout.
 *
 * @param {string} rawUrl - The source URL
 * @param {string} [primaryProxy=CORS_PROXY_URL] - Primary CORS proxy
 * @returns {Promise<Response>} Successful fetch response
 */
export async function fetchWithCorsFallback(rawUrl, primaryProxy = CORS_PROXY_URL) {
    if (!rawUrl) throw new Error("Empty image URL provided");

    if (rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) {
        return await fetch(rawUrl);
    }

    const urlsToTry = [];
    if (primaryProxy) {
        urlsToTry.push(resolveImageUrl(rawUrl, primaryProxy));
    }
    urlsToTry.push(`https://corsproxy.io/?${encodeURIComponent(rawUrl)}`);
    urlsToTry.push(rawUrl);

    let lastError = null;
    for (const url of urlsToTry) {
        try {
            let signal;
            let timeoutId;
            if (typeof AbortController !== "undefined") {
                const controller = new AbortController();
                timeoutId = setTimeout(() => controller.abort(), 15000);
                signal = controller.signal;
            }

            const response = await fetch(url, signal ? { signal } : undefined);
            if (timeoutId) clearTimeout(timeoutId);

            if (response.ok) {
                return response;
            } else {
                lastError = new Error(`HTTP ${response.status} from ${url}`);
            }
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error(`Failed to fetch image across all proxy endpoints: ${rawUrl}`);
}

/**
 * Safely preserves and restores the note editor scroll position across modal prompts, blur events, and editor sync re-renders.
 *
 * @param {string} [imageSrc] - Source URL of the active image to keep in view
 * @param {Function} action - Async function that performs prompts / operations
 * @returns {Promise<any>} Result of the action
 */
export async function withPreservedScroll(imageSrc, action) {
    let savedScrollTop = 0;
    let container = null;

    const getDoc = () => {
        try {
            if (typeof window !== "undefined" && window.parent && window.parent.document) {
                return window.parent.document;
            }
        } catch {
            // Sandboxed cross-origin iframe security error
        }
        try {
            if (typeof window !== "undefined" && window.top && window.top.document) {
                return window.top.document;
            }
        } catch {
            // Sandboxed cross-origin iframe security error
        }
        if (typeof document !== "undefined") {
            return document;
        }
        return null;
    };

    const doc = getDoc();
    if (doc) {
        container = doc.querySelector(".note-content-container, .note-editor-wrapper, .CodeMirror-scroll, .ProseMirror, .note-scroll-container, .infinite-scroll-component, main") || doc.documentElement || doc.body;
        if (container) {
            savedScrollTop = container.scrollTop || (typeof window !== "undefined" ? window.scrollY : 0) || 0;
        }
    }

    const restore = () => {
        const currentDoc = getDoc();
        if (!currentDoc) return;
        try {
            if (imageSrc) {
                const filename = imageSrc.split("?")[0].split("/").pop();
                const safeFilename = filename ? (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(filename) : filename.replace(/["\\]/g, "\\$&")) : null;
                const imgEl = safeFilename ? currentDoc.querySelector(`img[src*="${safeFilename}"]`) : null;
                if (imgEl && typeof imgEl.scrollIntoView === "function") {
                    imgEl.scrollIntoView({ block: "center", behavior: "smooth" });
                    return;
                }
            }
            if (container && savedScrollTop > 0) {
                container.scrollTop = savedScrollTop;
            }
        } catch {
            // Ignore DOM errors in sandboxed runtimes
        }
    };

    try {
        const result = await action();
        return result;
    } finally {
        if (typeof window !== "undefined") {
            restore();
            setTimeout(restore, 50);
            setTimeout(restore, 150);
            setTimeout(restore, 350);
            setTimeout(restore, 700);
        }
    }
}

/**
 * Pre-fetches and extracts metadata for an image (size, dimensions, MIME type, GIF detection).
 *
 * @param {string} imageUrl - The URL of the image
 * @param {string} [proxyUrl=CORS_PROXY_URL] - The CORS proxy base URL
 * @returns {Promise<object>} Image metadata object
 */
export async function fetchImageMetadata(imageUrl, proxyUrl = CORS_PROXY_URL) {
    const response = await fetchWithCorsFallback(imageUrl, proxyUrl);
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
        resolvedUrl: imageUrl,
        size: blob.size,
        formattedSize: formatBytes(blob.size),
        width,
        height,
        mimeType: blob.type || "image/jpeg",
        isGif
    };
}

/**
 * Inserts a compressed image directly below the original image in note markdown.
 * Uses native markdown image caption syntax ![Caption](url) to prevent detaching captions into blockquotes.
 *
 * @param {string} content - Markdown content of the note
 * @param {string} originalSrc - Original image src/URL
 * @param {string} newSrc - New compressed image URL
 * @param {string} [auditCaption] - Caption or audit info
 * @returns {string} Updated markdown content
 */
export function insertImageBelow(content, originalSrc, newSrc, auditCaption = "Compressed") {
    if (!content || !originalSrc || !newSrc) return content || "";

    // Escape special regex characters in originalSrc
    const escapedSrc = originalSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Matches the original markdown image tag
    const regex = new RegExp(`(!\\[[^\\]]*\\]\\(${escapedSrc}\\))`);

    // Clean caption text (strip square brackets to prevent markdown syntax breakage)
    const cleanCaption = auditCaption ? String(auditCaption).replace(/[\[\]]/g, "") : "Compressed";
    const newImageBlock = `\n\n![${cleanCaption}](${newSrc})`;

    if (regex.test(content)) {
        return content.replace(regex, `$1${newImageBlock}`);
    }

    // Fallback: append at the end of the note
    return `${content}${newImageBlock}`;
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
        const response = await fetchWithCorsFallback(imageSource, CORS_PROXY_URL);
        blob = await response.blob();
    }

    const originalBytes = blob.size;
    const maxDimension = Number(options.maxDimension) || 0;
    const isGif = (blob.type && blob.type.includes("gif")) || (typeof imageSource === "string" && imageSource.toLowerCase().includes(".gif"));

    // If preserveGif is enabled and image is a GIF, return untouched to preserve animation as dataUrl
    if (isGif && options.preserveGif) {
        const dataUrl = await blobToDataUrl(blob);
        return {
            dataUrl,
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
        const dataUrl = await blobToDataUrl(blob);
        return {
            dataUrl,
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

    let outputMime = "image/jpeg";
    if (options.format === "image/png") {
        outputMime = "image/png";
    } else if (options.format === "auto") {
        if (blob.type === "image/png" || blob.type === "image/webp") {
            outputMime = blob.type;
        }
    }

    while (scale >= 0.2) {
        canvas.width = Math.max(Math.round(initialWidth * scale), COMPRESSION_CONFIG.minDimension);
        canvas.height = Math.max(Math.round(initialHeight * scale), COMPRESSION_CONFIG.minDimension);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        if (outputMime === "image/png") {
            const dataUrl = canvas.toDataURL("image/png");
            const base64Start = dataUrl.indexOf(",") + 1;
            const estimatedBytes = (dataUrl.length - base64Start) * 0.75;
            if (estimatedBytes <= targetSizeBytes || scale <= 0.25) {
                finalDataUrl = dataUrl;
                finalBytes = Math.round(estimatedBytes);
                break;
            }
        } else {
            let quality = COMPRESSION_CONFIG.initialQuality;
            while (quality >= COMPRESSION_CONFIG.minQuality) {
                const dataUrl = canvas.toDataURL("image/jpeg", quality);
                const base64Start = dataUrl.indexOf(",") + 1;
                const estimatedBytes = (dataUrl.length - base64Start) * 0.75;
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
        const base64Start = finalDataUrl.indexOf(",") + 1;
        finalBytes = Math.round((finalDataUrl.length - base64Start) * 0.75);
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

