(() => {
// anp-24-image-compressor/lib/constants.js
var CORS_PROXY_URL = "https://amplenote-plugins-cors-anywhere.onrender.com/";
var DEFAULT_MAX_SIZE_KB = 500;
var LIGHTWEIGHT_THRESHOLD_KB = 150;
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
function formatBytes(bytes) {
  if (isNaN(bytes) || bytes <= 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }
  return `${(kb / 1024).toFixed(2)} MB`;
}
function getSmartSizePresets(imageSizeBytes = 0) {
  const sizeKB = imageSizeBytes > 0 ? imageSizeBytes / 1024 : DEFAULT_MAX_SIZE_KB;
  if (sizeKB <= 150) {
    const halfSize = Math.max(Math.round(sizeKB * 0.5), 5);
    const quarterSize = Math.max(Math.round(sizeKB * 0.25), 3);
    return [
      { label: `\u{1F4C9} 50% Reduction (~${halfSize} KB)`, value: "50%" },
      { label: `\u{1F4C9} 75% Reduction (~${quarterSize} KB)`, value: "25%" },
      { label: "\u26A1 Tiny Thumbnail (10 KB)", value: "10kb" },
      { label: "\u270F\uFE0F Custom Input (Set below)", value: "custom" }
    ];
  }
  if (sizeKB <= 600) {
    return [
      { label: `\u{1F4F1} Mobile / Fast Load (250 KB)`, value: "250kb" },
      { label: `\u26A1 Compact / Thumbnail (100 KB)`, value: "100kb" },
      { label: `\u{1F4C9} 50% of Current Size (~${Math.round(sizeKB * 0.5)} KB)`, value: "50%" },
      { label: "\u270F\uFE0F Custom Input (Set below)", value: "custom" }
    ];
  }
  const savings500 = Math.round((imageSizeBytes - 500 * 1024) / imageSizeBytes * 100);
  const savings250 = Math.round((imageSizeBytes - 250 * 1024) / imageSizeBytes * 100);
  const savings100 = Math.round((imageSizeBytes - 100 * 1024) / imageSizeBytes * 100);
  return [
    { label: `\u{1F680} Standard / Web (500 KB \u2014 ${savings500}% space saved)`, value: "500kb" },
    { label: `\u{1F4F1} Mobile / Fast Load (250 KB \u2014 ${savings250}% space saved)`, value: "250kb" },
    { label: `\u26A1 Compact / Thumbnail (100 KB \u2014 ${savings100}% space saved)`, value: "100kb" },
    { label: `\u{1F4C9} 50% of Current Size (${formatBytes(imageSizeBytes * 0.5)})`, value: "50%" },
    { label: "\u270F\uFE0F Custom Input (Set below)", value: "custom" }
  ];
}
function getSmartDimensionLimits(currentWidth = 0) {
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
  return [
    { label: `Keep Original (${currentWidth} px)`, value: "0" },
    { label: "Max 1920 px (Full HD)", value: "1920" },
    { label: "Max 1280 px (Standard HD)", value: "1280" },
    { label: "Max 800 px (Small / Inline)", value: "800" }
  ];
}
function getSmartDefaultTarget(imageSizeBytes = 0) {
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
function parseSizeInput(input, originalSizeBytes = 0) {
  if (!input) return DEFAULT_MAX_SIZE_KB * 1024;
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
  return DEFAULT_MAX_SIZE_KB * 1024;
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
async function fetchWithCorsFallback(rawUrl, primaryProxy = CORS_PROXY_URL) {
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
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`Failed to fetch image across all proxy endpoints: ${rawUrl}`);
}
async function withPreservedScroll(imageSrc, action) {
  let savedScrollTop = 0;
  let container = null;
  if (typeof document !== "undefined") {
    container = document.querySelector(".note-content-container, .note-editor-wrapper, .CodeMirror-scroll, .ProseMirror, .note-scroll-container, main") || document.documentElement || document.body;
    if (container) {
      savedScrollTop = container.scrollTop || window.scrollY || 0;
    }
  }
  const restore = () => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    try {
      if (imageSrc) {
        const filename = imageSrc.split("?")[0].split("/").pop();
        const imgEl = filename ? document.querySelector(`img[src*="${filename}"]`) : null;
        if (imgEl && typeof imgEl.scrollIntoView === "function") {
          imgEl.scrollIntoView({ block: "center", behavior: "auto" });
          return;
        }
      }
      if (container && savedScrollTop > 0) {
        container.scrollTop = savedScrollTop;
      }
    } catch {
    }
  };
  try {
    const result = await action();
    return result;
  } finally {
    if (typeof window !== "undefined") {
      restore();
      setTimeout(restore, 50);
      setTimeout(restore, 200);
      setTimeout(restore, 500);
    }
  }
}
async function fetchImageMetadata(imageUrl, proxyUrl = CORS_PROXY_URL) {
  const response = await fetchWithCorsFallback(imageUrl, proxyUrl);
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
    resolvedUrl: imageUrl,
    size: blob.size,
    formattedSize: formatBytes(blob.size),
    width,
    height,
    mimeType: blob.type || "image/jpeg",
    isGif
  };
}
function insertImageBelow(content, originalSrc, newSrc, auditInfo = "Compressed") {
  if (!content || !originalSrc || !newSrc) return content || "";
  const escapedSrc = originalSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(!\\[[^\\]]*\\]\\(${escapedSrc}\\)(?:\\r?\\n>[^\\r\\n]*)?)`, "g");
  const captionBlock = auditInfo ? `
> ${auditInfo}` : "";
  const newImageBlock = `

![Compressed](${newSrc})${captionBlock}`;
  if (regex.test(content)) {
    return content.replace(regex, `$1${newImageBlock}`);
  }
  return `${content}${newImageBlock}`;
}
async function compressImage(imageSource, targetSizeBytes, options = {}, state = null) {
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
  const isGif = blob.type && blob.type.includes("gif") || typeof imageSource === "string" && imageSource.toLowerCase().includes(".gif");
  const getSafeObjectUrl = (b) => {
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      try {
        return URL.createObjectURL(b);
      } catch {
        return typeof imageSource === "string" ? imageSource : "";
      }
    }
    return typeof imageSource === "string" ? imageSource : "";
  };
  if (isGif && options.preserveGif) {
    return {
      dataUrl: getSafeObjectUrl(blob),
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
      dataUrl: getSafeObjectUrl(blob),
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
        let step1Header = `\u{1F5BC}\uFE0F Note Images Analysis (${imageMetas.length} image${imageMetas.length === 1 ? "" : "s"}, ${formatBytes(totalNoteBytes)} total)
`;
        if (allLightweight) {
          step1Header += `\u2705 All images in this note are already lightweight and optimized (under ${LIGHTWEIGHT_THRESHOLD_KB} KB).
`;
          step1Header += `Select any images you wish to downscale further:`;
        } else {
          step1Header += `Select which images you want to optimize and choose your configuration strategy:`;
        }
        const selectorInputs = imageMetas.map((img, idx) => {
          const caption = img.caption ? ` ("${img.caption.slice(0, 25)}")` : "";
          const dim = img.width > 0 ? `${img.width}\xD7${img.height}px` : "";
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
              { label: "\u26A1 Quick Batch (Apply same settings to all selected)", value: "batch" },
              { label: "\u{1F3AF} Step-by-Step Individual (Customize settings per image)", value: "individual" }
            ],
            value: "batch"
          });
        }
        const step1Result = await app.prompt(step1Header, { inputs: selectorInputs });
        if (step1Result === null || step1Result === void 0) {
          return;
        }
        const step1Answers = Array.isArray(step1Result) ? step1Result : [step1Result];
        const strategy = imageMetas.length > 1 ? step1Answers[step1Answers.length - 1] || "batch" : "individual";
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
        if (strategy === "batch" && selectedImages.length > 1) {
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
          const batchResult = await app.prompt(`\u26A1 Quick Batch Settings (${selectedImages.length} images selected):`, {
            inputs: batchInputs
          });
          if (batchResult === null || batchResult === void 0) {
            return;
          }
          const batchAnswers = Array.isArray(batchResult) ? batchResult : [batchResult];
          const presetVal = batchAnswers[0] || "500kb";
          const customVal = batchAnswers[1] || smartDefault;
          const maxDim = Number(batchAnswers[2]) || 0;
          const formatChoice = batchAnswers[3] || "image/jpeg";
          const mode = batchAnswers[4] || COMPRESSION_MODES.REPLACE;
          const preserveGif = Boolean(batchAnswers[5] !== false);
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
                const percentSaved2 = result.savingsPercent;
                const existingCaption = img.caption ? `${img.caption} \u2022 ` : "";
                const auditCaption = `${existingCaption}Compressed: ${afterStr} (was ${beforeStr} \u2014 ${percentSaved2}% saved)`;
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
          for (let i = 0; i < selectedImages.length; i++) {
            const img = selectedImages[i];
            const imgBytes = img.size || 0;
            const smartPresets = getSmartSizePresets(imgBytes);
            const smartDefault = getSmartDefaultTarget(imgBytes);
            const smartDims = getSmartDimensionLimits(img.width || 0);
            const isPngOrWebp = img.mimeType?.includes("png") || img.mimeType?.includes("webp");
            const formatOptions = isPngOrWebp ? [
              { label: `Convert ${img.mimeType.split("/")[1]?.toUpperCase() || "PNG"} to JPEG (70-90% smaller)`, value: "image/jpeg" },
              { label: `Keep Original (${img.mimeType.split("/")[1]?.toUpperCase() || "Original"})`, value: img.mimeType }
            ] : [
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
            const dimStr = img.width > 0 ? `${img.width}\xD7${img.height}px` : "Unknown dimensions";
            const singlePrompt = await app.prompt(
              `\u{1F3AF} Configure Image ${i + 1} of ${selectedImages.length} (${img.formattedSize}, ${dimStr}):`,
              { inputs: singleInputs }
            );
            if (singlePrompt === null || singlePrompt === void 0) {
              continue;
            }
            const singleAnswers = Array.isArray(singlePrompt) ? singlePrompt : [singlePrompt];
            const presetVal = singleAnswers[0] || smartPresets[0]?.value || "500kb";
            const customVal = singleAnswers[1] || smartDefault;
            const maxDim = Number(singleAnswers[2]) || 0;
            const formatChoice = singleAnswers[3] || "image/jpeg";
            const mode = singleAnswers[4] || COMPRESSION_MODES.REPLACE;
            const preserveGif = Boolean(singleAnswers[5] !== false);
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
                const percentSaved2 = result.savingsPercent;
                const existingCaption = img.caption ? `${img.caption} \u2022 ` : "";
                const auditCaption = `${existingCaption}Compressed: ${afterStr} (was ${beforeStr} \u2014 ${percentSaved2}% saved)`;
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
        if (appendReplacements.length > 0) {
          let noteContent = await app.getNoteContent(noteHandle);
          for (const item of appendReplacements) {
            noteContent = insertImageBelow(noteContent, item.originalSrc, item.newSrc, item.auditCaption);
          }
          await app.replaceNoteContent(noteHandle, noteContent);
        }
        if (this?.constants && typeof this.constants.imageCount === "number") {
          this.constants.imageCount += processedCount;
        }
        const spaceSaved = totalOriginalBytes > totalFinalBytes ? totalOriginalBytes - totalFinalBytes : 0;
        const percentSaved = totalOriginalBytes > 0 ? Math.round(spaceSaved / totalOriginalBytes * 100) : 0;
        let report = `\u{1F389} Note Optimization Completed!

`;
        report += `\u2022 Images Optimized: ${processedCount} of ${selectedImages.length}
`;
        if (skippedCount > 0) {
          report += `\u2022 Already Under Target (Skipped): ${skippedCount}
`;
        }
        if (failedCount > 0) {
          report += `\u2022 Failed to Process: ${failedCount}
`;
        }
        report += `\u2022 Original Total: ${formatBytes(totalOriginalBytes)}
`;
        report += `\u2022 Optimized Total: ${formatBytes(totalFinalBytes)}
`;
        report += `\u2022 Total Space Saved: ${formatBytes(spaceSaved)} (${percentSaved}% reduction)
`;
        report += `\u2022 Captions: Updated with compression metrics`;
        await app.alert(report);
      } catch (error) {
        console.error("Error optimizing note images:", error);
        await app.alert("Failed to optimize note images: " + (error?.message || error));
      }
    });
  }
};

// anp-24-image-compressor/lib/optimizeImage.js
var optimizeImage = {
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
        let meta = null;
        try {
          meta = await fetchImageMetadata(image.src, CORS_PROXY_URL);
        } catch (err) {
          console.warn("Could not pre-fetch image metadata:", err);
        }
        const currentBytes = meta?.size || 0;
        const isLightweight = currentBytes > 0 && currentBytes <= LIGHTWEIGHT_THRESHOLD_KB * 1024;
        const isUnderDefault = currentBytes > 0 && currentBytes <= DEFAULT_MAX_SIZE_KB * 1024;
        let dialogHeader = "";
        if (meta) {
          const dimStr = meta.width > 0 ? `${meta.width} \xD7 ${meta.height} px` : "Unknown dimensions";
          if (isLightweight) {
            dialogHeader = `\u2705 Image is Already Optimized (${meta.formattedSize}, ${dimStr})
`;
            dialogHeader += `This image is already lightweight. If you still want to reduce it further (e.g. for a tiny thumbnail), select an aggressive target:`;
          } else if (isUnderDefault) {
            dialogHeader = `\u2139\uFE0F Image is Within Standard Limits (${meta.formattedSize}, ${dimStr})
`;
            dialogHeader += `Current size is under ${DEFAULT_MAX_SIZE_KB} KB. Choose a target below to compress further:`;
          } else {
            dialogHeader = `\u26A0\uFE0F Large Image Detected (${meta.formattedSize}, ${dimStr})
`;
            dialogHeader += `Recommended: Compress to under ${DEFAULT_MAX_SIZE_KB} KB for faster page load:`;
          }
        } else {
          dialogHeader = "\u{1F4D0} Image Compression Settings:\nConfigure target size and output mode below:";
        }
        const smartPresets = getSmartSizePresets(currentBytes);
        const smartDefaultTarget = getSmartDefaultTarget(currentBytes);
        const smartDimensions = getSmartDimensionLimits(meta?.width || 0);
        const isPngOrWebp = meta && (meta.mimeType?.includes("png") || meta.mimeType?.includes("webp"));
        const formatOptions = isPngOrWebp ? [
          { label: `Convert ${meta.mimeType.split("/")[1]?.toUpperCase() || "PNG"} to JPEG (70-90% smaller)`, value: "image/jpeg" },
          { label: `Keep Original (${meta.mimeType.split("/")[1]?.toUpperCase() || "Original"})`, value: meta.mimeType }
        ] : [
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
        if (promptResult === null || promptResult === void 0) {
          return;
        }
        const resultArray = Array.isArray(promptResult) ? promptResult : [promptResult];
        const presetVal = resultArray[0] || smartPresets[0]?.value || "500kb";
        const customInput = resultArray[1] || smartDefaultTarget;
        const maxDimension = Number(resultArray[2]) || 0;
        const formatChoice = resultArray[3] || "image/jpeg";
        const mode = resultArray[4] || COMPRESSION_MODES.REPLACE;
        const preserveGif = Boolean(resultArray[5] !== false);
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
        const existingCaption = image.caption ? `${image.caption} \u2022 ` : "";
        const auditCaption = `${existingCaption}Compressed: ${afterStr} (was ${beforeStr} \u2014 ${percentSaved}% saved)`;
        if (mode === COMPRESSION_MODES.APPEND) {
          const noteContent = await app.getNoteContent(noteHandle);
          const updatedContent = insertImageBelow(noteContent, image.src, fileURL, auditCaption);
          await app.replaceNoteContent(noteHandle, updatedContent);
        } else {
          if (app.context?.updateImage) {
            await app.context.updateImage({ src: fileURL, caption: auditCaption });
          } else if (app.updateNoteImage) {
            await app.updateNoteImage(noteHandle, image, { src: fileURL, caption: auditCaption });
          }
        }
        if (this?.constants && typeof this.constants.imageCount === "number") {
          this.constants.imageCount += 1;
        }
        const spaceSaved = compressResult.originalBytes > compressResult.finalBytes ? compressResult.originalBytes - compressResult.finalBytes : 0;
        let report = `\u{1F389} Image optimized successfully!

`;
        report += `\u2022 Before: ${beforeStr}
`;
        report += `\u2022 After: ${afterStr}
`;
        report += `\u2022 Space Saved: ${formatBytes(spaceSaved)} (${percentSaved}% reduction)
`;
        report += `\u2022 Caption Updated: "${auditCaption}"
`;
        report += `\u2022 Mode: ${mode === COMPRESSION_MODES.APPEND ? "Added below original with caption" : "Replaced in-place with caption"}`;
        await app.alert(report);
      } catch (error) {
        console.error("Error compressing single image:", error);
        await app.alert("Failed to compress image: " + (error?.message || error));
      }
    });
  }
};

// anp-24-image-compressor/image-compressor.js
var plugin = {
  constants: DEFAULT_CONSTANTS,
  noteOption: {
    "Optimize note": optimizeNote
  },
  imageOption: {
    "Optimize image": optimizeImage
  },
  compressImage
};
var image_compressor_default = plugin;


return image_compressor_default;
})()