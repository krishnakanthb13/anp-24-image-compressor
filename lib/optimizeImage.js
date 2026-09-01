/**
 * @file optimizeImage.js
 * @description Amplenote imageOption handler for optimizing an individual selected image.
 */
import { CORS_PROXY_URL, DEFAULT_MAX_SIZE_KB, COMPRESSION_MODES } from "./constants.js";
import { compressImage, resolveImageUrl, insertImageBelow } from "./compressor.js";

/**
 * imageOption handler to compress a single image directly from its drop-down menu.
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

            const promptResult = await app.prompt("Optimize Selected Image", {
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
                            { label: "Replace existing image in-place", value: COMPRESSION_MODES.REPLACE },
                            { label: "Add compressed image below original (Keep original)", value: COMPRESSION_MODES.APPEND }
                        ],
                        value: COMPRESSION_MODES.REPLACE
                    }
                ]
            });

            if (promptResult === null || promptResult === undefined) {
                return; // User canceled
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

            const resolvedUrl = resolveImageUrl(image.src, CORS_PROXY_URL);
            const stateTracker = { imageCount: 0 };
            const dataURL = await compressImage(resolvedUrl, maxSizeNum, stateTracker);

            if (dataURL.startsWith("blob:")) {
                await app.alert(`Image is already under ${maxSizeNum} KB. No compression needed.`);
                return;
            }

            const noteUUID = app.context?.noteUUID;
            const noteHandle = noteUUID ? { uuid: noteUUID } : null;

            if (!noteHandle) {
                await app.alert("Could not identify the note containing this image.");
                return;
            }

            const fileURL = await app.attachNoteMedia(noteHandle, dataURL);

            if (mode === COMPRESSION_MODES.APPEND) {
                const noteContent = await app.getNoteContent(noteHandle);
                const caption = image.caption ? `Compressed: ${image.caption}` : "Compressed image";
                const updatedContent = insertImageBelow(noteContent, image.src, fileURL, caption);
                await app.replaceNoteContent(noteHandle, updatedContent);
                await app.alert(`Compressed image added below the original (kept under ${maxSizeNum} KB).`);
            } else {
                if (app.context?.updateImage) {
                    await app.context.updateImage({ src: fileURL });
                } else if (app.updateNoteImage) {
                    await app.updateNoteImage(noteHandle, image, { src: fileURL });
                }
                await app.alert(`Image compressed and replaced in-place (under ${maxSizeNum} KB).`);
            }

            if (this?.constants && typeof this.constants.imageCount === "number") {
                this.constants.imageCount += 1;
            }
        } catch (error) {
            console.error("Error compressing single image:", error);
            await app.alert("Failed to compress image: " + (error?.message || error));
        }
    }
};
