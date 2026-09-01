/**
 * @file optimizeImage.js
 * @description Amplenote imageOption handler with live inspection metrics, presets, dimension caps, and savings analytics.
 */
import { CORS_PROXY_URL, DEFAULT_MAX_SIZE_KB, COMPRESSION_MODES, SIZE_PRESETS, DIMENSION_LIMITS } from "./constants.js";
import {
    fetchImageMetadata,
    compressImage,
    insertImageBelow,
    parseSizeInput,
    formatBytes
} from "./compressor.js";

/**
 * imageOption handler to inspect and compress an individual selected image.
 */
export const optimizeImage = {
    check: async function(app, image) {
        return Boolean(image && image.src);
    },
    run: async function(app, image) {
        try {
            if (!image || !image.src) {
                await app.alert("No valid image selected.");
                return;
            }

            // Step 1: Pre-fetch and inspect metadata for the selected image
            let meta = null;
            try {
                meta = await fetchImageMetadata(image.src, CORS_PROXY_URL);
            } catch (err) {
                console.warn("Could not pre-fetch image metadata:", err);
            }

            // Step 2: Build inspection header
            let dialogHeader = "📐 Image Optimization & Compression Settings:\n";
            if (meta) {
                const dimStr = meta.width > 0 ? `${meta.width} × ${meta.height} px` : "Unknown";
                dialogHeader += `\n• Current Size: ${meta.formattedSize} (${meta.size.toLocaleString()} bytes)`;
                dialogHeader += `\n• Dimensions: ${dimStr}`;
                dialogHeader += `\n• Format: ${meta.mimeType}${meta.isGif ? " [Animated GIF]" : ""}\n`;
            } else {
                dialogHeader += "\n• Could not pre-fetch current size. Applying default profile:\n";
            }

            // Step 3: Build inputs
            const inputs = [
                {
                    label: "Target Size Preset",
                    type: "select",
                    options: SIZE_PRESETS,
                    value: "500kb"
                },
                {
                    label: "Custom Target Size (KB, MB, or %)",
                    type: "string",
                    value: `${DEFAULT_MAX_SIZE_KB} KB`
                },
                {
                    label: "Max Width Limit",
                    type: "select",
                    options: DIMENSION_LIMITS,
                    value: "0"
                }
            ];

            // Offer format conversion if image is PNG/WebP
            const isPngOrWebp = meta && (meta.mimeType.includes("png") || meta.mimeType.includes("webp"));
            if (isPngOrWebp) {
                inputs.push({
                    label: "Format Optimization",
                    type: "select",
                    options: [
                        { label: "Convert to JPEG (70-90% smaller for photos/screenshots)", value: "image/jpeg" },
                        { label: `Keep Original (${meta.mimeType.split("/")[1].toUpperCase()})`, value: meta.mimeType }
                    ],
                    value: "image/jpeg"
                });
            } else {
                inputs.push({
                    label: "Format Optimization",
                    type: "select",
                    options: [
                        { label: "Standard JPEG", value: "image/jpeg" },
                        { label: "Keep Original Format", value: "auto" }
                    ],
                    value: "image/jpeg"
                });
            }

            // Output placement mode
            inputs.push({
                label: "Output Mode",
                type: "select",
                options: [
                    { label: "Replace existing image in-place", value: COMPRESSION_MODES.REPLACE },
                    { label: "Add compressed image below original (Keep original)", value: COMPRESSION_MODES.APPEND }
                ],
                value: COMPRESSION_MODES.REPLACE
            });

            if (meta?.isGif) {
                inputs.push({
                    label: "Skip GIF to preserve animation",
                    type: "checkbox",
                    value: true
                });
            }

            const promptResult = await app.prompt(dialogHeader, { inputs });

            if (promptResult === null || promptResult === undefined) {
                return; // User canceled
            }

            const resultArray = Array.isArray(promptResult) ? promptResult : [promptResult];
            const presetVal = resultArray[0] || "500kb";
            const customInput = resultArray[1] || `${DEFAULT_MAX_SIZE_KB} KB`;
            const maxDimension = Number(resultArray[2]) || 0;
            const formatChoice = resultArray[3] || "image/jpeg";
            const mode = resultArray[4] || COMPRESSION_MODES.REPLACE;
            const preserveGif = meta?.isGif ? Boolean(resultArray[5] !== false) : false;

            const originalBytes = meta?.size || 0;
            let targetSizeBytes;
            if (presetVal === "custom") {
                targetSizeBytes = parseSizeInput(customInput, originalBytes);
            } else if (presetVal.endsWith("%") || presetVal.endsWith("kb") || presetVal.endsWith("mb")) {
                targetSizeBytes = parseSizeInput(presetVal, originalBytes);
            } else {
                targetSizeBytes = parseSizeInput(customInput, originalBytes);
            }

            const source = meta?.blob || image.src;
            const stateTracker = { imageCount: 0 };
            const compressResult = await compressImage(
                source,
                targetSizeBytes,
                { maxDimension, format: formatChoice, preserveGif },
                stateTracker
            );

            if (compressResult.skipped) {
                const reason = compressResult.reason ? ` (${compressResult.reason})` : "";
                await app.alert(`Image is already under ${formatBytes(targetSizeBytes)}${reason}. No compression needed.`);
                return;
            }

            const noteUUID = app.context?.noteUUID;
            const noteHandle = noteUUID ? { uuid: noteUUID } : null;

            if (!noteHandle) {
                await app.alert("Could not identify the note containing this image.");
                return;
            }

            const fileURL = await app.attachNoteMedia(noteHandle, compressResult.dataUrl);

            if (mode === COMPRESSION_MODES.APPEND) {
                const noteContent = await app.getNoteContent(noteHandle);
                const originalLabel = formatBytes(compressResult.originalBytes);
                const newLabel = formatBytes(compressResult.finalBytes);
                const captionText = image.caption ? `${image.caption} ` : "";
                const auditTag = `Compressed (${newLabel} from ${originalLabel})${captionText ? ": " + captionText : ""}`;
                const updatedContent = insertImageBelow(noteContent, image.src, fileURL, auditTag);
                await app.replaceNoteContent(noteHandle, updatedContent);
            } else {
                if (app.context?.updateImage) {
                    await app.context.updateImage({ src: fileURL });
                } else if (app.updateNoteImage) {
                    await app.updateNoteImage(noteHandle, image, { src: fileURL });
                }
            }

            if (this?.constants && typeof this.constants.imageCount === "number") {
                this.constants.imageCount += 1;
            }

            // Summary report
            const beforeStr = formatBytes(compressResult.originalBytes);
            const afterStr = formatBytes(compressResult.finalBytes);
            const spaceSaved = compressResult.originalBytes > compressResult.finalBytes ? compressResult.originalBytes - compressResult.finalBytes : 0;
            const percentSaved = compressResult.savingsPercent;

            let report = `🎉 Image optimized successfully!\n\n`;
            report += `• Before: ${beforeStr}\n`;
            report += `• After: ${afterStr}\n`;
            report += `• Space Saved: ${formatBytes(spaceSaved)} (${percentSaved}% reduction)\n`;
            report += `• Mode: ${mode === COMPRESSION_MODES.APPEND ? "Added below original" : "Replaced in-place"}`;

            await app.alert(report);
        } catch (error) {
            console.error("Error compressing single image:", error);
            await app.alert("Failed to compress image: " + (error?.message || error));
        }
    }
};
