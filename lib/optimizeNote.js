/**
 * @file optimizeNote.js
 * @description Amplenote noteOption handler with multi-image selection checklist, pre-inspection, and savings analytics.
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
 * Note option handler for optimizing all or selected images in a note.
 */
export const optimizeNote = {
    check: async function(app, noteUUID) {
        return true;
    },
    run: async function(app, noteUUID) {
        try {
            const targetUUID = noteUUID || app?.context?.noteUUID;
            if (!targetUUID) {
                await app.alert("Could not identify the target note.");
                return;
            }

            const noteHandle = { uuid: targetUUID };
            const rawImages = await app.getNoteImages(noteHandle);

            if (!rawImages || rawImages.length === 0) {
                await app.alert("No images found in this note to optimize.");
                return;
            }

            // Step 1: Pre-fetch and inspect metadata for all images in parallel
            const analyzedImages = await Promise.all(
                rawImages.map(async (img, index) => {
                    try {
                        const meta = await fetchImageMetadata(img.src, CORS_PROXY_URL);
                        return { ...img, index, meta, error: null };
                    } catch (err) {
                        return { ...img, index, meta: null, error: err.message };
                    }
                })
            );

            // Calculate total note image size
            let totalNoteBytes = 0;
            analyzedImages.forEach(img => {
                if (img.meta?.size) totalNoteBytes += img.meta.size;
            });

            // Step 2: Build dynamic interactive checklist prompt inputs
            const inputs = [];

            // Add checkbox for each image
            analyzedImages.forEach((img, idx) => {
                let desc;
                const isOverLimit = img.meta?.size ? img.meta.size > DEFAULT_MAX_SIZE_KB * 1024 : true;

                if (img.meta) {
                    const dim = img.meta.width > 0 ? `${img.meta.width}×${img.meta.height}px` : "size";
                    const captionPart = img.caption ? ` — "${img.caption.slice(0, 20)}"` : "";
                    const gifPart = img.meta.isGif ? " [GIF]" : "";
                    desc = `Image ${idx + 1}: ${img.meta.formattedSize} (${dim})${captionPart}${gifPart}`;
                } else {
                    desc = `Image ${idx + 1}: [Inspection failed]`;
                }

                inputs.push({
                    label: desc,
                    type: "checkbox",
                    value: isOverLimit
                });
            });

            // Target size preset & custom input
            inputs.push({
                label: "Target Size Preset",
                type: "select",
                options: SIZE_PRESETS,
                value: "500kb"
            });

            inputs.push({
                label: "Custom Target Size (KB, MB, or %)",
                type: "string",
                value: `${DEFAULT_MAX_SIZE_KB} KB`
            });

            // Max dimension constraint
            inputs.push({
                label: "Max Width Limit",
                type: "select",
                options: DIMENSION_LIMITS,
                value: "0"
            });

            // Format conversion
            inputs.push({
                label: "Format Optimization",
                type: "select",
                options: [
                    { label: "Convert PNG/WebP to JPEG (Recommended for size)", value: "image/jpeg" },
                    { label: "Preserve Original Format", value: "auto" }
                ],
                value: "image/jpeg"
            });

            // Output placement mode
            inputs.push({
                label: "Output Mode",
                type: "select",
                options: [
                    { label: "Replace existing images in-place", value: COMPRESSION_MODES.REPLACE },
                    { label: "Add compressed images below original (Keep original)", value: COMPRESSION_MODES.APPEND }
                ],
                value: COMPRESSION_MODES.REPLACE
            });

            // GIF handling option
            inputs.push({
                label: "Skip GIF images to preserve animation",
                type: "checkbox",
                value: true
            });

            const dialogHeader = `Found ${analyzedImages.length} image${analyzedImages.length === 1 ? "" : "s"} (${formatBytes(totalNoteBytes)} total).\nSelect images to compress and choose settings:`;
            const promptResult = await app.prompt(dialogHeader, { inputs });

            if (promptResult === null || promptResult === undefined) {
                return; // User canceled
            }

            const resultArray = Array.isArray(promptResult) ? promptResult : [promptResult];

            // Parse checkbox selections
            const imageCount = analyzedImages.length;
            const selectedImages = [];
            for (let i = 0; i < imageCount; i++) {
                if (resultArray[i]) {
                    selectedImages.push(analyzedImages[i]);
                }
            }

            if (selectedImages.length === 0) {
                await app.alert("No images were selected for optimization.");
                return;
            }

            // Parse configuration inputs
            const presetVal = resultArray[imageCount] || "500kb";
            const customInput = resultArray[imageCount + 1] || `${DEFAULT_MAX_SIZE_KB} KB`;
            const maxDimension = Number(resultArray[imageCount + 2]) || 0;
            const formatChoice = resultArray[imageCount + 3] || "image/jpeg";
            const mode = resultArray[imageCount + 4] || COMPRESSION_MODES.REPLACE;
            const preserveGif = Boolean(resultArray[imageCount + 5] !== false);

            const note = app.notes?.find ? await app.notes.find(targetUUID) : null;
            let noteContent = mode === COMPRESSION_MODES.APPEND ? await app.getNoteContent(noteHandle) : null;

            let compressedCount = 0;
            let skippedCount = 0;
            let failedCount = 0;
            let totalBytesBefore = 0;
            let totalBytesAfter = 0;

            for (const img of selectedImages) {
                try {
                    const originalBytes = img.meta?.size || 0;
                    totalBytesBefore += originalBytes;

                    // Resolve target size based on preset or custom input
                    let targetSizeBytes;
                    if (presetVal === "custom") {
                        targetSizeBytes = parseSizeInput(customInput, originalBytes);
                    } else if (presetVal.endsWith("%") || presetVal.endsWith("kb") || presetVal.endsWith("mb")) {
                        targetSizeBytes = parseSizeInput(presetVal, originalBytes);
                    } else {
                        targetSizeBytes = parseSizeInput(customInput, originalBytes);
                    }

                    const source = img.meta?.blob || img.src;
                    const stateTracker = { imageCount: 0 };
                    const compressResult = await compressImage(
                        source,
                        targetSizeBytes,
                        { maxDimension, format: formatChoice, preserveGif },
                        stateTracker
                    );

                    if (compressResult.skipped) {
                        skippedCount += 1;
                        totalBytesAfter += compressResult.finalBytes;
                        continue;
                    }

                    const fileURL = await app.attachNoteMedia(noteHandle, compressResult.dataUrl);
                    totalBytesAfter += compressResult.finalBytes;

                    if (mode === COMPRESSION_MODES.APPEND) {
                        const originalLabel = formatBytes(compressResult.originalBytes);
                        const newLabel = formatBytes(compressResult.finalBytes);
                        const captionText = img.caption ? `${img.caption} ` : "";
                        const auditTag = `Compressed (${newLabel} from ${originalLabel})${captionText ? ": " + captionText : ""}`;
                        noteContent = insertImageBelow(noteContent, img.src, fileURL, auditTag);
                    } else {
                        if (app.updateNoteImage) {
                            await app.updateNoteImage(noteHandle, img, { src: fileURL });
                        } else if (note?.updateImage) {
                            await note.updateImage(img, { src: fileURL });
                        }
                    }

                    compressedCount += 1;
                    if (this?.constants && typeof this.constants.imageCount === "number") {
                        this.constants.imageCount += 1;
                    }
                } catch (imgError) {
                    console.error("Failed to compress image:", img.src, imgError);
                    failedCount += 1;
                }
            }

            // Save updated markdown in append mode
            if (mode === COMPRESSION_MODES.APPEND && compressedCount > 0 && noteContent) {
                if (app.replaceNoteContent) {
                    await app.replaceNoteContent(noteHandle, noteContent);
                } else if (note?.replaceContent) {
                    await note.replaceContent(noteContent);
                }
            }

            // Build informative savings report
            const modeDesc = mode === COMPRESSION_MODES.APPEND ? "added below originals" : "replaced in-place";
            if (compressedCount > 0) {
                const spaceSaved = totalBytesBefore > totalBytesAfter ? totalBytesBefore - totalBytesAfter : 0;
                const percentSaved = totalBytesBefore > 0 ? Math.round((spaceSaved / totalBytesBefore) * 100) : 0;

                let report = `🎉 Successfully optimized ${compressedCount} image${compressedCount === 1 ? "" : "s"} (${modeDesc})!\n\n`;
                report += `• Before: ${formatBytes(totalBytesBefore)}\n`;
                report += `• After: ${formatBytes(totalBytesAfter)}\n`;
                report += `• Saved: ${formatBytes(spaceSaved)} (${percentSaved}% reduction)`;

                if (skippedCount > 0) report += `\n• Skipped: ${skippedCount} (already under target size/GIF)`;
                if (failedCount > 0) report += `\n• Failed: ${failedCount} images`;

                await app.alert(report);
            } else if (skippedCount > 0 && failedCount === 0) {
                await app.alert(`All selected images (${skippedCount}) already comply with your target settings.`);
            } else if (failedCount > 0) {
                await app.alert(`Failed to process ${failedCount} image${failedCount === 1 ? "" : "s"}. Please check your connection or CORS proxy.`);
            }
        } catch (error) {
            console.error("Error running note image optimization:", error);
            await app.alert("An error occurred while optimizing note images: " + (error?.message || error));
        }
    }
};
