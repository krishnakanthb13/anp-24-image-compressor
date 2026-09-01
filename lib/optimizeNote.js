/**
 * @file optimizeNote.js
 * @description Amplenote noteOption handler for optimizing and compressing note images.
 */
import { CORS_PROXY_URL, DEFAULT_MAX_SIZE_KB, COMPRESSION_MODES } from "./constants.js";
import { compressImage, resolveImageUrl, insertImageBelow } from "./compressor.js";

/**
 * Note option handler for optimizing all images in a note.
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
            const images = await app.getNoteImages(noteHandle);

            if (!images || images.length === 0) {
                await app.alert("No images found in this note to optimize.");
                return;
            }

            const promptResult = await app.prompt("Optimize Note Images", {
                inputs: [
                    {
                        label: "Max image size (KB)",
                        type: "string",
                        value: String(DEFAULT_MAX_SIZE_KB)
                    },
                    {
                        label: "Output mode",
                        type: "select",
                        options: [
                            { label: "Replace existing images in-place", value: COMPRESSION_MODES.REPLACE },
                            { label: "Add compressed images below original (Keep original)", value: COMPRESSION_MODES.APPEND }
                        ],
                        value: COMPRESSION_MODES.REPLACE
                    }
                ]
            });

            // If user canceled the prompt
            if (promptResult === null || promptResult === undefined) {
                return;
            }

            let maxSizeNum = DEFAULT_MAX_SIZE_KB;
            let mode = COMPRESSION_MODES.REPLACE;

            if (Array.isArray(promptResult)) {
                maxSizeNum = Number(promptResult[0]);
                mode = promptResult[1] || COMPRESSION_MODES.REPLACE;
            } else if (typeof promptResult === "string") {
                maxSizeNum = Number(promptResult);
            }

            if (isNaN(maxSizeNum) || maxSizeNum <= 0) {
                await app.alert("Invalid input. Please enter a positive number for image size (KB).");
                return;
            }

            const note = app.notes?.find ? await app.notes.find(targetUUID) : null;
            let noteContent = mode === COMPRESSION_MODES.APPEND ? await app.getNoteContent(noteHandle) : null;

            let compressedCount = 0;
            let failedCount = 0;
            let skippedCount = 0;

            for (const img of images) {
                try {
                    const resolvedUrl = resolveImageUrl(img.src, CORS_PROXY_URL);
                    const stateTracker = { imageCount: 0 };
                    const dataURL = await compressImage(resolvedUrl, maxSizeNum, stateTracker);

                    if (dataURL.startsWith("blob:")) {
                        skippedCount += 1;
                        continue; // Image already within target size limit
                    }

                    const fileURL = await app.attachNoteMedia(noteHandle, dataURL);

                    if (mode === COMPRESSION_MODES.APPEND) {
                        const caption = img.caption ? `Compressed: ${img.caption}` : "Compressed image";
                        noteContent = insertImageBelow(noteContent, img.src, fileURL, caption);
                    } else {
                        // In-place replacement
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

            // If in append mode and any images were compressed, write the updated note content
            if (mode === COMPRESSION_MODES.APPEND && compressedCount > 0 && noteContent) {
                if (app.replaceNoteContent) {
                    await app.replaceNoteContent(noteHandle, noteContent);
                } else if (note?.replaceContent) {
                    await note.replaceContent(noteContent);
                }
            }

            // Build informative summary message
            const modeDesc = mode === COMPRESSION_MODES.APPEND ? "added below originals" : "replaced in-place";
            if (compressedCount > 0) {
                let msg = `Successfully compressed and ${modeDesc} for ${compressedCount} image${compressedCount === 1 ? "" : "s"}!`;
                if (skippedCount > 0) {
                    msg += ` (${skippedCount} already under ${maxSizeNum} KB)`;
                }
                if (failedCount > 0) {
                    msg += ` [${failedCount} failed to process]`;
                }
                await app.alert(msg);
            } else if (skippedCount > 0 && failedCount === 0) {
                await app.alert(`All ${skippedCount} image${skippedCount === 1 ? " is" : "s are"} already under ${maxSizeNum} KB.`);
            } else if (failedCount > 0) {
                await app.alert(`Failed to process ${failedCount} image${failedCount === 1 ? "" : "s"}. Please check your connection or CORS proxy.`);
            }
        } catch (error) {
            console.error("Error running note image optimization:", error);
            await app.alert("An error occurred while optimizing note images: " + (error?.message || error));
        }
    }
};
