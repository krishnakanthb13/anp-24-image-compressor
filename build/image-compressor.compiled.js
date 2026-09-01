(() => {
// anp-24-image-compressor/lib/constants.js
var CORS_PROXY_URL = "https://amplenote-plugins-cors-anywhere.onrender.com/";
var DEFAULT_MAX_SIZE_KB = 500;
var COMPRESSION_MODES = {
  REPLACE: "replace",
  APPEND: "append"
};
var SIZE_PRESETS = [
  { label: "\u{1F680} Standard / Web (500 KB)", value: "500kb" },
  { label: "\u{1F4F1} Mobile / Fast Load (250 KB)", value: "250kb" },
  { label: "\u26A1 Compact / Thumbnail (100 KB)", value: "100kb" },
  { label: "\u{1F4C9} 50% of Current Size", value: "50%" },
  { label: "\u{1F4C9} 25% of Current Size", value: "25%" },
  { label: "\u270F\uFE0F Custom Input (Use field below)", value: "custom" }
];
var DIMENSION_LIMITS = [
  { label: "Keep Original Dimensions", value: "0" },
  { label: "Max 1920 px (Full HD)", value: "1920" },
  { label: "Max 1280 px (Standard HD)", value: "1280" },
  { label: "Max 800 px (Small / Inline)", value: "800" }
];
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
function formatBytes(bytes) {
  if (isNaN(bytes) || bytes <= 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }
  return `${(kb / 1024).toFixed(2)} MB`;
}
function parseSizeInput(input, originalSizeBytes = 0) {
  if (!input) return 500 * 1024;
  const str = String(input).trim().toLowerCase();
  if (str.endsWith("%")) {
    const percent = parseFloat(str);
    if (!isNaN(percent) && percent > 0 && originalSizeBytes > 0) {
      return Math.round(originalSizeBytes * percent / 100);
    }
  }
  if (str.endsWith("mb") || str.endsWith("m")) {
    const num2 = parseFloat(str);
    if (!isNaN(num2) && num2 > 0) {
      return Math.round(num2 * 1024 * 1024);
    }
  }
  const cleaned = str.replace(/kb|k/g, "").trim();
  const num = parseFloat(cleaned);
  if (!isNaN(num) && num > 0) {
    return Math.round(num * 1024);
  }
  return 500 * 1024;
}
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
async function fetchImageMetadata(imageUrl, proxyUrl) {
  const resolvedUrl = resolveImageUrl(imageUrl, proxyUrl);
  const response = await fetch(resolvedUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  const blob = await response.blob();
  const isGif = blob.type && blob.type.includes("gif") || imageUrl.toLowerCase().includes(".gif");
  let width = 0;
  let height = 0;
  try {
    const imgBitmap = await createImageBitmap(blob);
    width = imgBitmap.width;
    height = imgBitmap.height;
  } catch {
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
async function compressImage(imageSource, targetSizeBytes, options = {}, state = null) {
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
  const isGif = blob.type && blob.type.includes("gif") || typeof imageSource === "string" && imageSource.toLowerCase().includes(".gif");
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
  if (maxDimension > 0 && (initialWidth > maxDimension || initialHeight > maxDimension)) {
    const ratio = Math.min(maxDimension / initialWidth, maxDimension / initialHeight);
    initialWidth = Math.round(initialWidth * ratio);
    initialHeight = Math.round(initialHeight * ratio);
  } else if (blob.size <= targetSizeBytes && maxDimension === 0) {
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
  let scale = 1;
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
  const savingsPercent = originalBytes > finalBytes ? Math.round((originalBytes - finalBytes) / originalBytes * 100) : 0;
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
      const rawImages = await app.getNoteImages(noteHandle);
      if (!rawImages || rawImages.length === 0) {
        await app.alert("No images found in this note to optimize.");
        return;
      }
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
      let totalNoteBytes = 0;
      analyzedImages.forEach((img) => {
        if (img.meta?.size) totalNoteBytes += img.meta.size;
      });
      const inputs = [];
      analyzedImages.forEach((img, idx) => {
        let desc;
        const isOverLimit = img.meta?.size ? img.meta.size > DEFAULT_MAX_SIZE_KB * 1024 : true;
        if (img.meta) {
          const dim = img.meta.width > 0 ? `${img.meta.width}\xD7${img.meta.height}px` : "size";
          const captionPart = img.caption ? ` \u2014 "${img.caption.slice(0, 20)}"` : "";
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
      inputs.push({
        label: "Max Width Limit",
        type: "select",
        options: DIMENSION_LIMITS,
        value: "0"
      });
      inputs.push({
        label: "Format Optimization",
        type: "select",
        options: [
          { label: "Convert PNG/WebP to JPEG (Recommended for size)", value: "image/jpeg" },
          { label: "Preserve Original Format", value: "auto" }
        ],
        value: "image/jpeg"
      });
      inputs.push({
        label: "Output Mode",
        type: "select",
        options: [
          { label: "Replace existing images in-place", value: COMPRESSION_MODES.REPLACE },
          { label: "Add compressed images below original (Keep original)", value: COMPRESSION_MODES.APPEND }
        ],
        value: COMPRESSION_MODES.REPLACE
      });
      inputs.push({
        label: "Skip GIF images to preserve animation",
        type: "checkbox",
        value: true
      });
      const dialogHeader = `Found ${analyzedImages.length} image${analyzedImages.length === 1 ? "" : "s"} (${formatBytes(totalNoteBytes)} total).
Select images to compress and choose settings:`;
      const promptResult = await app.prompt(dialogHeader, { inputs });
      if (promptResult === null || promptResult === void 0) {
        return;
      }
      const resultArray = Array.isArray(promptResult) ? promptResult : [promptResult];
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
      if (mode === COMPRESSION_MODES.APPEND && compressedCount > 0 && noteContent) {
        if (app.replaceNoteContent) {
          await app.replaceNoteContent(noteHandle, noteContent);
        } else if (note?.replaceContent) {
          await note.replaceContent(noteContent);
        }
      }
      const modeDesc = mode === COMPRESSION_MODES.APPEND ? "added below originals" : "replaced in-place";
      if (compressedCount > 0) {
        const spaceSaved = totalBytesBefore > totalBytesAfter ? totalBytesBefore - totalBytesAfter : 0;
        const percentSaved = totalBytesBefore > 0 ? Math.round(spaceSaved / totalBytesBefore * 100) : 0;
        let report = `\u{1F389} Successfully optimized ${compressedCount} image${compressedCount === 1 ? "" : "s"} (${modeDesc})!

`;
        report += `\u2022 Before: ${formatBytes(totalBytesBefore)}
`;
        report += `\u2022 After: ${formatBytes(totalBytesAfter)}
`;
        report += `\u2022 Saved: ${formatBytes(spaceSaved)} (${percentSaved}% reduction)`;
        if (skippedCount > 0) report += `
\u2022 Skipped: ${skippedCount} (already under target size/GIF)`;
        if (failedCount > 0) report += `
\u2022 Failed: ${failedCount} images`;
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
      let meta = null;
      try {
        meta = await fetchImageMetadata(image.src, CORS_PROXY_URL);
      } catch (err) {
        console.warn("Could not pre-fetch image metadata:", err);
      }
      let dialogHeader = "\u{1F4D0} Image Optimization & Compression Settings:\n";
      if (meta) {
        const dimStr = meta.width > 0 ? `${meta.width} \xD7 ${meta.height} px` : "Unknown";
        dialogHeader += `
\u2022 Current Size: ${meta.formattedSize} (${meta.size.toLocaleString()} bytes)`;
        dialogHeader += `
\u2022 Dimensions: ${dimStr}`;
        dialogHeader += `
\u2022 Format: ${meta.mimeType}${meta.isGif ? " [Animated GIF]" : ""}
`;
      } else {
        dialogHeader += "\n\u2022 Could not pre-fetch current size. Applying default profile:\n";
      }
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
      if (promptResult === null || promptResult === void 0) {
        return;
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
      const beforeStr = formatBytes(compressResult.originalBytes);
      const afterStr = formatBytes(compressResult.finalBytes);
      const spaceSaved = compressResult.originalBytes > compressResult.finalBytes ? compressResult.originalBytes - compressResult.finalBytes : 0;
      const percentSaved = compressResult.savingsPercent;
      let report = `\u{1F389} Image optimized successfully!

`;
      report += `\u2022 Before: ${beforeStr}
`;
      report += `\u2022 After: ${afterStr}
`;
      report += `\u2022 Space Saved: ${formatBytes(spaceSaved)} (${percentSaved}% reduction)
`;
      report += `\u2022 Mode: ${mode === COMPRESSION_MODES.APPEND ? "Added below original" : "Replaced in-place"}`;
      await app.alert(report);
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