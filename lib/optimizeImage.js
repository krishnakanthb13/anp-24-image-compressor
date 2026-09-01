/**
 * @file optimizeImage.js
 * @description Amplenote imageOption handler with intelligent contextual inspection, smart size presets, surgical in-place replacement, and non-destructive report exports.
 */
import { CORS_PROXY_URL, DEFAULT_MAX_SIZE_KB, LIGHTWEIGHT_THRESHOLD_KB, COMPRESSION_MODES, DEFAULT_CONSTANTS, REPORT_TAG } from "./constants.js";
import {
    fetchImageMetadata,
    compressImage,
    parseSizeInput,
    formatBytes,
    getSmartSizePresets,
    getSmartDimensionLimits,
    getSmartDefaultTarget,
    withPreservedScroll,
    updateImageSurgically,
    createCompressionReportNote
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
                            { label: "Replace existing image in-place (Surgical)", value: COMPRESSION_MODES.REPLACE },
                            { label: `Save to new report note in ${REPORT_TAG}`, value: COMPRESSION_MODES.NEW_NOTE }
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

                const beforeStr = formatBytes(compressResult.originalBytes);
                const afterStr = formatBytes(compressResult.finalBytes);
                const percentSaved = compressResult.savingsPercent;
                const existingCaption = image.caption ? `${image.caption} • ` : "";
                const auditCaption = `${existingCaption}Compressed: ${afterStr} (was ${beforeStr} — ${percentSaved}% saved)`;
                const spaceSaved = compressResult.originalBytes > compressResult.finalBytes ? compressResult.originalBytes - compressResult.finalBytes : 0;

                if (mode === COMPRESSION_MODES.NEW_NOTE) {
                    // Non-destructive mode: Save to dedicated report note in -reports/-image-compressor (Active note 100% untouched)
                    const reportItem = {
                        dataUrl: compressResult.dataUrl,
                        caption: auditCaption,
                        beforeStr,
                        afterStr,
                        percentSaved,
                        originalBytes: compressResult.originalBytes,
                        finalBytes: compressResult.finalBytes
                    };

                    await createCompressionReportNote(app, noteUUID, [reportItem]);

                    let report = `🎉 Image compressed & exported to new note!\n\n`;
                    report += `• Before: ${beforeStr}\n`;
                    report += `• After: ${afterStr}\n`;
                    report += `• Space Saved: ${formatBytes(spaceSaved)} (${percentSaved}% reduction)\n`;
                    report += `• Saved Under Tag: "${REPORT_TAG}"\n`;
                    report += `• Original Note: Completely untouched`;

                    await app.alert(report);
                } else {
                    // Surgical in-place replacement on the active image node
                    if (!noteHandle) {
                        await app.alert("Could not identify the note containing this image.");
                        return;
                    }

                    const fileURL = await app.attachNoteMedia(noteHandle, compressResult.dataUrl);
                    await updateImageSurgically(app, noteHandle, image, { src: fileURL, caption: auditCaption });

                    let report = `🎉 Image optimized surgically in-place!\n\n`;
                    report += `• Before: ${beforeStr}\n`;
                    report += `• After: ${afterStr}\n`;
                    report += `• Space Saved: ${formatBytes(spaceSaved)} (${percentSaved}% reduction)\n`;
                    report += `• Caption: Updated with compression metrics\n`;
                    report += `• Note Content: Surrounding text and structure 100% preserved`;

                    await app.alert(report);
                }

                if (this?.constants && typeof this.constants.imageCount === "number") {
                    this.constants.imageCount += 1;
                } else if (typeof DEFAULT_CONSTANTS?.imageCount === "number") {
                    DEFAULT_CONSTANTS.imageCount += 1;
                }
            } catch (error) {
                console.error("Error compressing single image:", error);
                await app.alert("Failed to compress image: " + (error?.message || error));
            }
        });
    }
};


