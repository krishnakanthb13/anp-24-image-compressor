# Security Audit — Amplenote Image Compressor

**Date**: 2026-09-01  
**Auditor**: Antigravity Agent  
**Plugin ID**: `anp-24`  
**Version**: `0.0.1`  

---

## Summary

| Severity | Count |
|---|---|
| 🔴 **Critical** | 0 |
| 🟡 **Warning**  | 0 |
| 🟢 **Passed**   | 8 |

---

## Audit Findings & Verification

### 🔴 Critical
*None found.*

### 🟡 Warning
*None found.*

### 🟢 Passed

1. **Zero Hardcoded Secrets**:
   - Comprehensive regex scanning identified zero embedded API keys, tokens, or plaintext credentials.
   - All network operations use standard HTTP/HTTPS endpoints with no confidential headers or keys needed.

2. **No Dynamic Code Execution (`eval` / `new Function`)**:
   - Source code contains zero calls to `eval()`, `new Function()`, `document.write()`, or `setTimeout(string)`.

3. **Injection & XSS Protection**:
   - The plugin does not construct or inject arbitrary raw HTML into DOM contexts.
   - Note content modifications in append mode use regex-escaped string substitutions ([`insertImageBelow`](lib/compressor.js)) to prevent injection or malformed markdown generation.

4. **Media and URL Validation**:
   - Image source resolution handles `data:` and `blob:` protocols locally without passing them unnecessarily through external networks.
   - The CORS proxy URL is pinned to standard HTTPS (`https://amplenote-plugins-cors-anywhere.onrender.com/`).

5. **Safe Data Handling & Non-destructive Modes**:
   - Supports both in-place replacement and a non-destructive `"append"` mode to preserve original image assets while offering compressed versions.

6. **Input Validation**:
   - User inputs for target image size (`maxSizeNum`) are strictly validated against `Number`, `NaN`, and `<= 0` boundaries to prevent invalid loop execution or unexpected states.

7. **Runtime Error Hardening**:
   - All `fetch()` calls, Canvas transformations, and Amplenote API invocations (`app.getNoteImages`, `app.attachNoteMedia`, `app.updateNoteImage`, `app.replaceNoteContent`) are wrapped in `try/catch` blocks with user feedback and error logging.

8. **Zero Runtime External Dependencies**:
   - The compiled production bundle ([`build/image-compressor.compiled.js`](build/image-compressor.compiled.js)) relies exclusively on standard Web Platform APIs (Canvas 2D Context, `createImageBitmap`, `fetch`, `Blob`, `URL.createObjectURL`), eliminating third-party runtime supply-chain risks.

---

## Reporting Vulnerabilities

If you discover a security vulnerability within this plugin, please submit an issue or security advisory through the repository issue tracker.
