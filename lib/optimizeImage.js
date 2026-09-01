/**
 * @file optimizeImage.js
 * @description Amplenote imageOption handler with intelligent contextual inspection, smart size presets, and complete lifecycle viewport lock.
 */
import { CORS_PROXY_URL, DEFAULT_MAX_SIZE_KB, LIGHTWEIGHT_THRESHOLD_KB, COMPRESSION_MODES, DEFAULT_CONSTANTS } from "./constants.js";
import {
    fetchImageMetadata,
    compressImage,
    insertImageBelow,
    parseSizeInput,
    formatBytes,
    getSmartSizePresets,
    getSmartDimensionLimits,
    getSmartDefaultTarget,
    withPreservedScroll
} from "./compressor.js";

/**
 * imageOption handler to inspect and compress an individual selected image.
 */
export const optimizeImage = {
    check: async function(app, image) {
        return Boolean(image && image.src);
    },
    run: async function(app, image) {
        if (!image || !image.src) {
            await app.alert("No valid image selected.");
            return;
        }

        return await withPreservedScroll(image.src, async () => {
            try {
                // Step 1: Pre-fetch and inspect metadata for the selected image
                let meta = null;
                try {
                    meta = await fetchImageMetadata(image.src, CORS_PROXY_URL);
                } catch (err) {
                    console.warn("Could not pre-fetch image metadata:", err);
                }

                const currentBytes = meta?.size || 0;
                const isLightweight = currentBytes > 0 && currentBytes <= LIGHTWEIGHT_THRESHOLD_KB * 1024;
                const isUnderDefault = currentBytes > 0 && currentBytes <= DEFAULT_MAX_SIZE_KB * 1024;

                // Step 2: Build intelligent, contextual header
                let dialogHeader = "";
                if (meta) {
                    const dimStr = meta.width > 0 ? `${meta.width} × ${meta.height} px` : "Unknown dimensions";
                    if (isLightweight) {
                        dialogHeader = `✅ Image is Already Optimized (${meta.formattedSize}, ${dimStr})\n`;
                        dialogHeader += `This image is already lightweight. If you still want to reduce it further (e.g. for a tiny thumbnail), select an aggressive target:`;
                    } else if (isUnderDefault) {
                        dialogHeader = `ℹ️ Image is Within Standard Limits (${meta.formattedSize}, ${dimStr})\n`;
                        dialogHeader += `Current size is under ${DEFAULT_MAX_SIZE_KB} KB. Choose a target below to compress further:`;
                    } else {
                        dialogHeader = `⚠️ Large Image Detected (${meta.formattedSize}, ${dimStr})\n`;
                        dialogHeader += `Recommended: Compress to under ${DEFAULT_MAX_SIZE_KB} KB for faster page load:`;
                    }
                } else {
                    dialogHeader = "📐 Image Compression Settings:\nConfigure target size and output mode below:";
                }

                // Step 3: Build inputs with fixed, predictable indexing
                const smartPresets = getSmartSizePresets(currentBytes);
                const smartDefaultTarget = getSmartDefaultTarget(currentBytes);
                const smartDimensions = getSmartDimensionLimits(meta?.width || 0);

                const isPngOrWebp = meta && (meta.mimeType?.includes("png") || meta.mimeType?.includes("webp"));
                const formatOptions = isPngOrWebp
                    ? [
                          { label: `Convert ${meta.mimeType.split("/")[1]?.toUpperCase() || "PNG"} to JPEG (70-90% smaller)`, value: "image/jpeg" },
                          { label: `Keep Original (${meta.mimeType.split("/")[1]?.toUpperCase() || "Original"})`, value: meta.mimeType }
                      ]
                    : [
                          { label: "Standard JPEG", value: "image/jpeg" },
                          { label: "Keep Original Format", value: "auto" }
                      ];

                const inputs = [
                    {
                        label: "Target Size Profile",
                        type: "select",
                        options: smartPresets,
                        value: smartPresets[0]?.value || "500kb"
                    },
                    {
                        label: "Custom Target Size (KB, MB, or %)",
                        type: "string",
                        value: smartDefaultTarget
                    },
                    {
                        label: "Max Width Limit",
                        type: "select",
                        options: smartDimensions,
                        value: "0"
                    },
                    {
                        label: "Format Optimization",
                        type: "select",
                        options: formatOptions,
                        value: "image/jpeg"
                    },
                    {
                        label: "Output Mode",
                        type: "select",
                        options: [
                            { label: "Replace existing image in-place", value: COMPRESSION_MODES.REPLACE },
                            { label: "Add compressed image below original (Keep original)", value: COMPRESSION_MODES.APPEND }
                        ],
                        value: COMPRESSION_MODES.REPLACE
                    },
                    {
                        label: "Skip GIF to preserve animation",
                        type: "checkbox",
                        value: true
                    }
                ];

                const promptResult = await app.prompt(dialogHeader, { inputs });

                if (promptResult === null || promptResult === undefined) {
                    return; // User canceled
                }

                const resultArray = Array.isArray(promptResult) ? promptResult : [promptResult];
                const presetVal = resultArray[0] || smartPresets[0]?.value || "500kb";
                const customInput = resultArray[1] || smartDefaultTarget;
                const maxDimension = Number(resultArray[2]) || 0;
                const formatChoice = resultArray[3] || "image/jpeg";
                const mode = resultArray[4] || COMPRESSION_MODES.REPLACE;
                const preserveGif = Boolean(resultArray[5] === true || resultArray[5] === "true" || resultArray[5] === 1);

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
                    await app.alert(`Image already complies with your target settings (${formatBytes(targetSizeBytes)})${reason}. No re-compression needed.`);
                    return;
                }

                const noteUUID = app.context?.noteUUID;
                const noteHandle = noteUUID ? { uuid: noteUUID } : null;

                if (!noteHandle) {
                    await app.alert("Could not identify the note containing this image.");
                    return;
                }

                const fileURL = await app.attachNoteMedia(noteHandle, compressResult.dataUrl);

                const beforeStr = formatBytes(compressResult.originalBytes);
                const afterStr = formatBytes(compressResult.finalBytes);
                const percentSaved = compressResult.savingsPercent;
                const existingCaption = image.caption ? `${image.caption} • ` : "";
                const auditCaption = `${existingCaption}Compressed: ${afterStr} (was ${beforeStr} — ${percentSaved}% saved)`;

                if (mode === COMPRESSION_MODES.APPEND) {
                    const noteContent = await app.getNoteContent(noteHandle);
                    const updatedContent = insertImageBelow(noteContent, image.src, fileURL, auditCaption);
                    await app.replaceNoteContent(noteHandle, updatedContent);

                    // Re-query note images to attach native caption directly in ProseMirror
                    try {
                        if (typeof app.getNoteImages === "function") {
                            const freshImages = await app.getNoteImages(noteHandle);
                            const newImg = freshImages?.find((i) => i.src === fileURL);
                            if (newImg && typeof app.updateNoteImage === "function") {
                                await app.updateNoteImage(noteHandle, newImg, { caption: auditCaption });
                            }
                        }
                    } catch (syncErr) {
                        console.warn("Could not bind native caption to appended image:", syncErr);
                    }
                } else {
                    if (app.context?.updateImage) {
                        await app.context.updateImage({ src: fileURL, caption: auditCaption });
                    } else if (app.updateNoteImage) {
                        await app.updateNoteImage(noteHandle, image, { src: fileURL, caption: auditCaption });
                    }
                }

                if (this?.constants && typeof this.constants.imageCount === "number") {
                    this.constants.imageCount += 1;
                } else if (typeof DEFAULT_CONSTANTS?.imageCount === "number") {
                    DEFAULT_CONSTANTS.imageCount += 1;
                }

                // Summary report
                const spaceSaved = compressResult.originalBytes > compressResult.finalBytes ? compressResult.originalBytes - compressResult.finalBytes : 0;

                let report = `🎉 Image optimized successfully!\n\n`;
                report += `• Before: ${beforeStr}\n`;
                report += `• After: ${afterStr}\n`;
                report += `• Space Saved: ${formatBytes(spaceSaved)} (${percentSaved}% reduction)\n`;
                report += `• Caption Updated: "${auditCaption}"\n`;
                report += `• Mode: ${mode === COMPRESSION_MODES.APPEND ? "Added below original with caption" : "Replaced in-place with caption"}`;

                await app.alert(report);
            } catch (error) {
                console.error("Error compressing single image:", error);
                await app.alert("Failed to compress image: " + (error?.message || error));
            }
        });
    }
};

