/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import {
    formatBytes,
    parseSizeInput,
    resolveImageUrl,
    fetchImageMetadata,
    insertImageBelow,
    compressImage
} from '../lib/compressor.js';

describe('compressor.js', () => {
    describe('formatBytes', () => {
        it('formats 0 or negative bytes to 0 KB', () => {
            expect(formatBytes(0)).toBe('0 KB');
            expect(formatBytes(-100)).toBe('0 KB');
            expect(formatBytes(NaN)).toBe('0 KB');
        });

        it('formats byte counts under 1 MB as KB', () => {
            expect(formatBytes(500 * 1024)).toBe('500 KB');
            expect(formatBytes(100 * 1024)).toBe('100 KB');
        });

        it('formats byte counts over 1 MB as MB with 2 decimal places', () => {
            expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.50 MB');
            expect(formatBytes(10.25 * 1024 * 1024)).toBe('10.25 MB');
        });
    });

    describe('parseSizeInput', () => {
        it('parses numeric and KB inputs', () => {
            expect(parseSizeInput('500')).toBe(500 * 1024);
            expect(parseSizeInput('500kb')).toBe(500 * 1024);
            expect(parseSizeInput('250k')).toBe(250 * 1024);
        });

        it('parses MB inputs', () => {
            expect(parseSizeInput('1.5mb')).toBe(Math.round(1.5 * 1024 * 1024));
            expect(parseSizeInput('2m')).toBe(2 * 1024 * 1024);
        });

        it('parses percentage inputs relative to original size', () => {
            const original = 2000 * 1024; // 2000 KB
            expect(parseSizeInput('50%', original)).toBe(1000 * 1024);
            expect(parseSizeInput('25%', original)).toBe(500 * 1024);
        });

        it('falls back to default 500 KB on invalid or empty input', () => {
            expect(parseSizeInput('')).toBe(500 * 1024);
            expect(parseSizeInput('invalid')).toBe(500 * 1024);
        });
    });

    describe('resolveImageUrl', () => {
        const proxy = 'https://proxy.example.com/';

        it('returns empty string when url is empty or null', () => {
            expect(resolveImageUrl('', proxy)).toBe('');
            expect(resolveImageUrl(null, proxy)).toBe('');
        });

        it('leaves data and blob URLs untouched', () => {
            expect(resolveImageUrl('data:image/jpeg;base64,123', proxy)).toBe('data:image/jpeg;base64,123');
            expect(resolveImageUrl('blob:http://localhost/123', proxy)).toBe('blob:http://localhost/123');
        });

        it('prepends proxy URL and avoids double-proxying', () => {
            expect(resolveImageUrl('https://example.com/pic.jpg', proxy)).toBe('https://proxy.example.com/https://example.com/pic.jpg');
            expect(resolveImageUrl('https://proxy.example.com/https://example.com/pic.jpg', proxy)).toBe('https://proxy.example.com/https://example.com/pic.jpg');
        });
    });

    describe('fetchImageMetadata', () => {
        beforeEach(() => {
            global.createImageBitmap = jest.fn().mockResolvedValue({ width: 1920, height: 1080 });
        });

        it('fetches image and returns detailed metadata', async () => {
            const mockBlob = new Blob(['sample data'], { type: 'image/png' });
            Object.defineProperty(mockBlob, 'size', { value: 1500 * 1024 });

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(mockBlob)
            });

            const meta = await fetchImageMetadata('https://example.com/shot.png', 'https://proxy.com/');
            expect(meta.size).toBe(1500 * 1024);
            expect(meta.formattedSize).toBe('1.46 MB');
            expect(meta.width).toBe(1920);
            expect(meta.height).toBe(1080);
            expect(meta.mimeType).toBe('image/png');
            expect(meta.isGif).toBe(false);
        });

        it('identifies GIF images accurately', async () => {
            const gifBlob = new Blob(['gif data'], { type: 'image/gif' });
            Object.defineProperty(gifBlob, 'size', { value: 500 * 1024 });

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(gifBlob)
            });

            const meta = await fetchImageMetadata('https://example.com/anim.gif', 'https://proxy.com/');
            expect(meta.isGif).toBe(true);
        });

        it('throws error when image fetch fails', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found'
            });

            await expect(fetchImageMetadata('https://example.com/404.jpg', 'https://proxy.com/'))
                .rejects
                .toThrow(/Failed to fetch image: 404 Not Found/);
        });
    });

    describe('insertImageBelow', () => {
        it('inserts compressed image below matching markdown image', () => {
            const md = '# Note\n\n![My Dog](https://example.com/dog.png)\n\nText';
            const updated = insertImageBelow(md, 'https://example.com/dog.png', 'https://example.com/dog-opt.jpg', 'Compressed (300 KB)');

            expect(updated).toContain('![My Dog](https://example.com/dog.png)\n\n![Compressed (300 KB)](https://example.com/dog-opt.jpg)');
        });

        it('falls back to appending at end when pattern is not found', () => {
            const md = '# Note text only';
            const updated = insertImageBelow(md, 'https://example.com/missing.png', 'https://example.com/new.jpg', 'Compressed');
            expect(updated).toBe('# Note text only\n\n![Compressed](https://example.com/new.jpg)');
        });
    });

    describe('compressImage', () => {
        beforeEach(() => {
            global.URL.createObjectURL = jest.fn().mockReturnValue('blob:http://localhost/cached-blob');
            global.createImageBitmap = jest.fn().mockResolvedValue({ width: 3840, height: 2160 });

            jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
                clearRect: jest.fn(),
                drawImage: jest.fn()
            });
            jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,mockoutput');
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('skips compression if image is already within target bytes and no dimension limit', async () => {
            const smallBlob = new Blob(['small']);
            Object.defineProperty(smallBlob, 'size', { value: 200 * 1024 });

            const result = await compressImage(smallBlob, 500 * 1024, { maxDimension: 0 });
            expect(result.skipped).toBe(true);
            expect(result.dataUrl).toBe('blob:http://localhost/cached-blob');
        });

        it('preserves GIF animation without flattening if preserveGif is enabled', async () => {
            const gifBlob = new Blob(['gif'], { type: 'image/gif' });
            Object.defineProperty(gifBlob, 'size', { value: 1200 * 1024 });

            const result = await compressImage(gifBlob, 500 * 1024, { preserveGif: true });
            expect(result.skipped).toBe(true);
            expect(result.reason).toBe('Preserved GIF animation');
        });

        it('compresses large image, respects maxDimension, and returns savings metrics', async () => {
            const largeBlob = new Blob(['large image data']);
            Object.defineProperty(largeBlob, 'size', { value: 3000 * 1024 }); // 3 MB

            const state = { imageCount: 0 };
            const result = await compressImage(largeBlob, 500 * 1024, { maxDimension: 1920, format: 'image/jpeg' }, state);

            expect(result.skipped).toBe(false);
            expect(result.dataUrl).toBe('data:image/jpeg;base64,mockoutput');
            expect(state.imageCount).toBe(1);
            expect(result.savingsPercent).toBeGreaterThanOrEqual(0);
        });

        it('throws error when target size is invalid', async () => {
            await expect(compressImage('https://example.com/test.jpg', 0))
                .rejects
                .toThrow(/Invalid target size/);
        });
    });
});
