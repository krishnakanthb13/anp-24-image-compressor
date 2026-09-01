/**
 * @file optimizeNote.js
 * @description Amplenote noteOption handler with guided 2-step wizard, batch vs step-by-step workflows, fast-track single selection, and native image caption audit notes.
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
 * noteOption handler to inspect, select, and optimize images across the entire note.
 */
export const optimizeNote = {
    check: async function(app) {
        return Boolean(app);
    },
    run: async function(app, noteUUID) {
        const noteHandle = noteUUID ? { uuid: noteUUID } : null;
        if (!noteHandle) {
            await app.alert("Could not identify the active note.");
            return;
        }

        return await withPreservedScroll(null, async () => {
            try {
                const noteImages = await app.getNoteImages(noteHandle);

                if (!noteImages || noteImages.length === 0) {
                    await app.alert("No images found in this note to optimize.");
                    return;
                }

                // Step 1: Pre-fetch and inspect metadata for all note images in parallel
                const imageMetas = await Promise.all(
                    noteImages.map(async (img, idx) => {
                        try {
                            const meta = await fetchImageMetadata(img.src, CORS_PROXY_URL);
                            return { ...img, ...meta, originalIndex: idx };
                        } catch (err) {
                            console.warn(`Could not inspect image ${idx + 1}:`, err);
                            return {
                                ...img,
                                size: 0,
                                formattedSize: "Unknown size",
                                width: 0,
                                height: 0,
                                mimeType: "image/jpeg",
                                isGif: false,
                                originalIndex: idx
                            };
                        }
                    })
                );

                const totalNoteBytes = imageMetas.reduce((sum, img) => sum + (img.size || 0), 0);
                const allLightweight = imageMetas.every((img) => img.size > 0 && img.size <= LIGHTWEIGHT_THRESHOLD_KB * 1024);

                // Build Step 1 Clean Selector Dialog
                let step1Header = `🖼️ Note Images Analysis (${imageMetas.length} image${imageMetas.length === 1 ? "" : "s"}, ${formatBytes(totalNoteBytes)} total)\n`;
                if (allLightweight) {
                    step1Header += `✅ All images in this note are already lightweight and optimized (under ${LIGHTWEIGHT_THRESHOLD_KB} KB).\n`;
                    step1Header += `Select any images you wish to downscale further:`;
                } else {
                    step1Header += `Select which images you want to optimize and choose your configuration strategy:`;
                }

                const selectorInputs = imageMetas.map((img, idx) => {
                    const caption = img.caption ? ` ("${img.caption.slice(0, 25)}")` : "";
                    const dim = img.width > 0 ? `${img.width}×${img.height}px` : "";
                    const needsOpt = img.size > DEFAULT_MAX_SIZE_KB * 1024;
                    const status = needsOpt ? " [Needs Optimization]" : " [Optimized]";

                    return {
                        label: `Image ${idx + 1}: ${img.formattedSize} ${dim ? `(${dim})` : ""}${caption}${status}`,
                        type: "checkbox",
                        value: needsOpt || allLightweight
                    };
                });

                if (imageMetas.length > 1) {
                    selectorInputs.push({
                        label: "Optimization Strategy",
                        type: "select",
                        options: [
                            { label: "⚡ Quick Batch (Apply same settings to all selected)", value: "batch" },
                            { label: "🎯 Step-by-Step Individual (Customize settings per image)", value: "individual" }
                        ],
                        value: "batch"
                    });
                }

                const step1Result = await app.prompt(step1Header, { inputs: selectorInputs });

                if (step1Result === null || step1Result === undefined) {
                    return; // User canceled
                }

                const step1Answers = Array.isArray(step1Result) ? step1Result : [step1Result];
                const rawStrategy = imageMetas.length > 1 ? (step1Answers[imageMetas.length] ?? step1Answers[step1Answers.length - 1]) : "batch";
                const strategyStr = typeof rawStrategy === "object" && rawStrategy !== null
                    ? String(rawStrategy.value || rawStrategy.label || "")
                    : String(rawStrategy || "");
                const isBatch = !strategyStr.toLowerCase().includes("individual");

                const selectedImages = imageMetas.filter((img, idx) => {
                    return Boolean(step1Answers[idx]);
                });

                if (selectedImages.length === 0) {
                    await app.alert("No images were selected for optimization.");
                    return;
                }

                let totalOriginalBytes = 0;
                let totalFinalBytes = 0;
                let processedCount = 0;
                let skippedCount = 0;
                let failedCount = 0;
                let appendReplacements = [];

                if (isBatch) {
                    // Step 2A: Quick Batch Configuration Dialog (Single prompt for all selected images)
                    const maxImgBytes = Math.max(...selectedImages.map((img) => img.size || 0));
                    const smartPresets = getSmartSizePresets(maxImgBytes);
                    const smartDefault = getSmartDefaultTarget(maxImgBytes);

                    const batchInputs = [
                        {
                            label: "Batch Target Size",
                            type: "select",
                            options: smartPresets,
                            value: smartPresets[0]?.value || "500kb"
                        },
                        {
                            label: "Custom Target Size (KB, MB, %)",
                            type: "string",
                            value: smartDefault
                        },
                        {
                            label: "Max Width Limit for All Images",
                            type: "select",
                            options: [
                                { label: "Keep Original Dimensions", value: "0" },
                                { label: "Max 1920 px (Full HD)", value: "1920" },
                                { label: "Max 1280 px (Standard HD)", value: "1280" },
                                { label: "Max 800 px (Small / Inline)", value: "800" },
                                { label: "Max 400 px (Thumbnail)", value: "400" }
                            ],
                            value: "0"
                        },
                        {
                            label: "Format Optimization",
                            type: "select",
                            options: [
                                { label: "Convert PNG/WebP to JPEG (70-90% smaller)", value: "image/jpeg" },
                                { label: "Keep Original Format", value: "auto" }
                            ],
                            value: "image/jpeg"
                        },
                        {
                            label: "Output Mode",
                            type: "select",
                            options: [
                                { label: "Replace existing images in-place", value: COMPRESSION_MODES.REPLACE },
                                { label: "Add compressed images below originals (Keep originals)", value: COMPRESSION_MODES.APPEND }
                            ],
                            value: COMPRESSION_MODES.REPLACE
                        },
                        {
                            label: "Skip GIFs to preserve animation",
                            type: "checkbox",
                            value: true
                        }
                    ];

                    const batchResult = await app.prompt(`⚡ Quick Batch Settings (${selectedImages.length} image${selectedImages.length === 1 ? "" : "s"} selected):`, {
                        inputs: batchInputs
                    });

                    if (batchResult === null || batchResult === undefined) {
                        return; // User canceled
                    }

                    const batchAnswers = Array.isArray(batchResult) ? batchResult : [batchResult];
                    const presetVal = batchAnswers[0] || "500kb";
                    const customVal = batchAnswers[1] || smartDefault;
                    const maxDim = Number(batchAnswers[2]) || 0;
                    const formatChoice = batchAnswers[3] || "image/jpeg";
                    const mode = batchAnswers[4] || COMPRESSION_MODES.REPLACE;
                    const preserveGif = Boolean(batchAnswers[5] === true || batchAnswers[5] === "true" || batchAnswers[5] === 1);

                    for (const img of selectedImages) {
                        try {
                            const originalBytes = img.size || 0;
                            let targetBytes;
                            if (presetVal === "custom") {
                                targetBytes = parseSizeInput(customVal, originalBytes);
                            } else if (presetVal.endsWith("%") || presetVal.endsWith("kb") || presetVal.endsWith("mb")) {
                                targetBytes = parseSizeInput(presetVal, originalBytes);
                            } else {
                                targetBytes = parseSizeInput(customVal, originalBytes);
                            }

                            const source = img.blob || img.src;
                            const stateTracker = { imageCount: 0 };
                            const result = await compressImage(
                                source,
                                targetBytes,
                                { maxDimension: maxDim, format: formatChoice, preserveGif },
                                stateTracker
                            );

                            totalOriginalBytes += result.originalBytes;
                            totalFinalBytes += result.finalBytes;

                            if (result.skipped) {
                                skippedCount += 1;
                            } else {
                                const fileURL = await app.attachNoteMedia(noteHandle, result.dataUrl);
                                const beforeStr = formatBytes(result.originalBytes);
                                const afterStr = formatBytes(result.finalBytes);
                                const percentSaved = result.savingsPercent;
                                const existingCaption = img.caption ? `${img.caption} • ` : "";
                                const auditCaption = `${existingCaption}Compressed: ${afterStr} (was ${beforeStr} — ${percentSaved}% saved)`;

                                if (mode === COMPRESSION_MODES.APPEND) {
                                    appendReplacements.push({ originalSrc: img.src, newSrc: fileURL, auditCaption });
                                } else {
                                    if (app.updateNoteImage) {
                                        await app.updateNoteImage(noteHandle, img, { src: fileURL, caption: auditCaption });
                                    }
                                }
                                processedCount += 1;
                            }
                        } catch (imgErr) {
                            console.error("Failed to compress note image:", img.src, imgErr);
                            failedCount += 1;
                        }
                    }
                } else {
                    // Step 2B: Step-by-Step Individual Configuration Dialogs (Custom per-image settings)
                    for (let i = 0; i < selectedImages.length; i++) {
                        const img = selectedImages[i];
                        const imgBytes = img.size || 0;
                        const smartPresets = getSmartSizePresets(imgBytes);
                        const smartDefault = getSmartDefaultTarget(imgBytes);
                        const smartDims = getSmartDimensionLimits(img.width || 0);

                        const isPngOrWebp = img.mimeType?.includes("png") || img.mimeType?.includes("webp");
                        const formatOptions = isPngOrWebp
                            ? [
                                  { label: `Convert ${img.mimeType.split("/")[1]?.toUpperCase() || "PNG"} to JPEG (70-90% smaller)`, value: "image/jpeg" },
                                  { label: `Keep Original (${img.mimeType.split("/")[1]?.toUpperCase() || "Original"})`, value: img.mimeType }
                              ]
                            : [
                                  { label: "Standard JPEG", value: "image/jpeg" },
                                  { label: "Keep Original Format", value: "auto" }
                              ];

                        const singleInputs = [
                            {
                                label: "Target Size Profile",
                                type: "select",
                                options: smartPresets,
                                value: smartPresets[0]?.value || "500kb"
                            },
                            {
                                label: "Custom Target Size (KB, MB, %)",
                                type: "string",
                                value: smartDefault
                            },
                            {
                                label: "Max Width Limit",
                                type: "select",
                                options: smartDims,
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

                        const dimStr = img.width > 0 ? `${img.width}×${img.height}px` : "Unknown dimensions";
                        const singlePrompt = await app.prompt(
                            `🎯 Configure Image ${i + 1} of ${selectedImages.length} (${img.formattedSize}, ${dimStr}):`,
                            { inputs: singleInputs }
                        );

                        if (singlePrompt === null || singlePrompt === undefined) {
                            continue; // Skip this image on cancel
                        }

                        const singleAnswers = Array.isArray(singlePrompt) ? singlePrompt : [singlePrompt];
                        const presetVal = singleAnswers[0] || smartPresets[0]?.value || "500kb";
                        const customVal = singleAnswers[1] || smartDefault;
                        const maxDim = Number(singleAnswers[2]) || 0;
                        const formatChoice = singleAnswers[3] || "image/jpeg";
                        const mode = singleAnswers[4] || COMPRESSION_MODES.REPLACE;
                        const preserveGif = Boolean(singleAnswers[5] === true || singleAnswers[5] === "true" || singleAnswers[5] === 1);

                        try {
                            let targetBytes;
                            if (presetVal === "custom") {
                                targetBytes = parseSizeInput(customVal, imgBytes);
                            } else if (presetVal.endsWith("%") || presetVal.endsWith("kb") || presetVal.endsWith("mb")) {
                                targetBytes = parseSizeInput(presetVal, imgBytes);
                            } else {
                                targetBytes = parseSizeInput(customVal, imgBytes);
                            }

                            const source = img.blob || img.src;
                            const stateTracker = { imageCount: 0 };
                            const result = await compressImage(
                                source,
                                targetBytes,
                                { maxDimension: maxDim, format: formatChoice, preserveGif },
                                stateTracker
                            );

                            totalOriginalBytes += result.originalBytes;
                            totalFinalBytes += result.finalBytes;

                            if (result.skipped) {
                                skippedCount += 1;
                            } else {
                                const fileURL = await app.attachNoteMedia(noteHandle, result.dataUrl);
                                const beforeStr = formatBytes(result.originalBytes);
                                const afterStr = formatBytes(result.finalBytes);
                                const percentSaved = result.savingsPercent;
                                const existingCaption = img.caption ? `${img.caption} • ` : "";
                                const auditCaption = `${existingCaption}Compressed: ${afterStr} (was ${beforeStr} — ${percentSaved}% saved)`;

                                if (mode === COMPRESSION_MODES.APPEND) {
                                    appendReplacements.push({ originalSrc: img.src, newSrc: fileURL, auditCaption });
                                } else {
                                    if (app.updateNoteImage) {
                                        await app.updateNoteImage(noteHandle, img, { src: fileURL, caption: auditCaption });
                                    }
                                }
                                processedCount += 1;
                            }
                        } catch (imgErr) {
                            console.error("Failed to compress note image:", img.src, imgErr);
                            failedCount += 1;
                        }
                    }
                }

                // Handle append replacements in markdown
                if (appendReplacements.length > 0) {
                    let noteContent = await app.getNoteContent(noteHandle);
                    for (const item of appendReplacements) {
                        noteContent = insertImageBelow(noteContent, item.originalSrc, item.newSrc, item.auditCaption);
                    }
                    await app.replaceNoteContent(noteHandle, noteContent);

                    // Re-query note images to attach native captions directly in ProseMirror
                    try {
                        const freshImages = await app.getNoteImages(noteHandle);
                        if (freshImages && app.updateNoteImage) {
                            for (const item of appendReplacements) {
                                const newImg = freshImages.find((i) => i.src === item.newSrc);
                                if (newImg) {
                                    await app.updateNoteImage(noteHandle, newImg, { caption: item.auditCaption });
                                }
                            }
                        }
                    } catch (syncErr) {
                        console.warn("Could not bind native captions to appended images:", syncErr);
                    }
                }

                if (this?.constants && typeof this.constants.imageCount === "number") {
                    this.constants.imageCount += processedCount;
                } else if (typeof DEFAULT_CONSTANTS?.imageCount === "number") {
                    DEFAULT_CONSTANTS.imageCount += processedCount;
                }

                // Final Summary Report
                const spaceSaved = totalOriginalBytes > totalFinalBytes ? totalOriginalBytes - totalFinalBytes : 0;
                const percentSaved = totalOriginalBytes > 0 ? Math.round((spaceSaved / totalOriginalBytes) * 100) : 0;

                let report = `🎉 Note Optimization Completed!\n\n`;
                report += `• Images Optimized: ${processedCount} of ${selectedImages.length}\n`;
                if (skippedCount > 0) {
                    report += `• Already Under Target (Skipped): ${skippedCount}\n`;
                }
                if (failedCount > 0) {
                    report += `• Failed to Process: ${failedCount}\n`;
                }
                report += `• Original Total: ${formatBytes(totalOriginalBytes)}\n`;
                report += `• Optimized Total: ${formatBytes(totalFinalBytes)}\n`;
                report += `• Total Space Saved: ${formatBytes(spaceSaved)} (${percentSaved}% reduction)\n`;
                report += `• Captions: Updated with compression metrics`;

                await app.alert(report);
            } catch (error) {
                console.error("Error optimizing note images:", error);
                await app.alert("Failed to optimize note images: " + (error?.message || error));
            }
        });
    }
};


