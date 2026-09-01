(() => {
// anp-24-image-compressor/lib/constants.js
var CORS_PROXY_URL = "https://amplenote-plugins-cors-anywhere.onrender.com/";
var DEFAULT_MAX_SIZE_KB = 500;
var COMPRESSION_MODES = {
  REPLACE: "replace",
  APPEND: "append"
};
var COMPRESSION_CONFIG = {
  initialQuality: 0.9,
  minQuality: 0.1,
  qualityStep: 0.1,
  scaleStep: 0.8,
  minDimension: 100
};
var DEFAULT_CONSTANTS = {
  imageCount: 0
};

// anp-24-image-compressor/lib/compressor.js
function resolveImageUrl(rawUrl, proxyUrl) {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) {
    return rawUrl;
  }
  if (proxyUrl && !rawUrl.startsWith(proxyUrl)) {
    return `${proxyUrl}${rawUrl}`;
  }
  return rawUrl;
}
function insertImageBelow(content, originalSrc, newSrc, caption = "Compressed") {
  if (!content || !originalSrc || !newSrc) return content || "";
  const escapedSrc = originalSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(!\\[[^\\]]*\\]\\(${escapedSrc}\\))`, "g");
  if (regex.test(content)) {
    return content.replace(regex, `$1

![${caption}](${newSrc})`);
  }
  return `${content}

![${caption}](${newSrc})`;
}
async function compressImage(imageUrl, targetSizeKB, state) {
  const targetSizeBytes = Number(targetSizeKB) * 1024;
  if (isNaN(targetSizeBytes) || targetSizeBytes <= 0) {
    throw new Error("Invalid target size specified for compression");
  }
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  const blob = await response.blob();
  if (blob.size <= targetSizeBytes) {
    return URL.createObjectURL(blob);
  }
  const img = await createImageBitmap(blob);
  let currentWidth = img.width;
  let currentHeight = img.height;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let finalDataUrl = null;
  let scale = 1;
  while (scale >= 0.2) {
    canvas.width = Math.max(Math.round(currentWidth * scale), COMPRESSION_CONFIG.minDimension);
    canvas.height = Math.max(Math.round(currentHeight * scale), COMPRESSION_CONFIG.minDimension);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let quality = COMPRESSION_CONFIG.initialQuality;
    while (quality >= COMPRESSION_CONFIG.minQuality) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const compressedSize = dataUrl.length * 0.75;
      if (compressedSize <= targetSizeBytes) {
        finalDataUrl = dataUrl;
        break;
      }
      quality = Math.round((quality - COMPRESSION_CONFIG.qualityStep) * 100) / 100;
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
  }
  if (state && typeof state.imageCount === "number") {
    state.imageCount += 1;
  }
  return finalDataUrl;
}

// anp-24-image-compressor/lib/optimizeNote.js
var optimizeNote = {
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
      if (promptResult === null || promptResult === void 0) {
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
            continue;
          }
          const fileURL = await app.attachNoteMedia(noteHandle, dataURL);
          if (mode === COMPRESSION_MODES.APPEND) {
            const caption = img.caption ? `Compressed: ${img.caption}` : "Compressed image";
            noteContent = insertImageBelow(noteContent, img.src, fileURL, caption);
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
      if (mode === COMPRESSION_MODES.APPEND && compressedCount > 0 && noteContent) {
        if (app.replaceNoteContent) {
          await app.replaceNoteContent(noteHandle, noteContent);
        } else if (note?.replaceContent) {
          await note.replaceContent(noteContent);
        }
      }
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

// anp-24-image-compressor/lib/optimizeImage.js
var optimizeImage = {
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
      if (promptResult === null || promptResult === void 0) {
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

// anp-24-image-compressor/image-compressor.js
var image_compressor_default = {
  constants: { ...DEFAULT_CONSTANTS },
  noteOption: {
    "Optimize note": optimizeNote
  },
  imageOption: {
    "Compress image": optimizeImage
  },
  compressImage
};


return image_compressor_default;
})()