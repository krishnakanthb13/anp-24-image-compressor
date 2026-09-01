/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { resolveImageUrl, insertImageBelow, compressImage } from '../lib/compressor.js';

describe('compressor.js', () => {
    describe('resolveImageUrl — Happy Path & Edge Cases', () => {
        const proxy = 'https://proxy.example.com/';

        it('returns empty string when url is empty or null', () => {
            expect(resolveImageUrl('', proxy)).toBe('');
            expect(resolveImageUrl(null, proxy)).toBe('');
            expect(resolveImageUrl(undefined, proxy)).toBe('');
        });

        it('leaves data URLs untouched without proxying', () => {
            const dataUrl = 'data:image/jpeg;base64,abc123';
            expect(resolveImageUrl(dataUrl, proxy)).toBe(dataUrl);
        });

        it('leaves blob URLs untouched without proxying', () => {
            const blobUrl = 'blob:http://localhost/123-456';
            expect(resolveImageUrl(blobUrl, proxy)).toBe(blobUrl);
        });

        it('prepends proxy URL to standard relative or absolute URLs', () => {
            expect(resolveImageUrl('https://example.com/pic.jpg', proxy)).toBe('https://proxy.example.com/https://example.com/pic.jpg');
        });

        it('avoids double-proxying if URL already starts with proxy base', () => {
            const alreadyProxied = 'https://proxy.example.com/https://example.com/pic.jpg';
            expect(resolveImageUrl(alreadyProxied, proxy)).toBe(alreadyProxied);
        });
    });

    describe('insertImageBelow — Happy Path & Edge Cases', () => {
        it('inserts compressed image directly below matched original markdown image', () => {
            const originalMd = '# Title\n\n![My Dog](https://example.com/dog.png)\n\nSome text';
            const updated = insertImageBelow(originalMd, 'https://example.com/dog.png', 'https://example.com/dog-small.png', 'Compressed Dog');

            expect(updated).toContain('![My Dog](https://example.com/dog.png)\n\n![Compressed Dog](https://example.com/dog-small.png)\n\nSome text');
        });

        it('handles regex special characters safely in URL', () => {
            const urlWithChars = 'https://example.com/img?id=1&name=test[1].jpg';
            const originalMd = `Check this: ![](${urlWithChars})`;
            const updated = insertImageBelow(originalMd, urlWithChars, 'https://example.com/new.jpg', 'Compressed');

            expect(updated).toContain(`![](${urlWithChars})\n\n![Compressed](https://example.com/new.jpg)`);
        });

        it('falls back to appending at end of note if original image markdown is not found', () => {
            const originalMd = '# Notes without image tag';
            const updated = insertImageBelow(originalMd, 'https://example.com/missing.png', 'https://example.com/small.png', 'Compressed');

            expect(updated).toBe('# Notes without image tag\n\n![Compressed](https://example.com/small.png)');
        });

        it('returns input safely when arguments are missing', () => {
            expect(insertImageBelow('', 'url1', 'url2')).toBe('');
            expect(insertImageBelow(null, 'url1', 'url2')).toBe('');
        });
    });

    describe('compressImage — Happy Path, Compression Loop & Fallbacks', () => {
        beforeEach(() => {
            global.URL.createObjectURL = jest.fn().mockReturnValue('blob:http://localhost/cached-blob');
            global.createImageBitmap = jest.fn().mockResolvedValue({
                width: 800,
                height: 600
            });

            // Mock HTMLCanvasElement context & toDataURL
            jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
                clearRect: jest.fn(),
                drawImage: jest.fn()
            });
            jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,compressed-output');
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('returns original blob object URL if image is already within target size limit', async () => {
            const smallBlob = new Blob(['small image data']);
            Object.defineProperty(smallBlob, 'size', { value: 100 * 1024 }); // 100 KB

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(smallBlob)
            });

            const result = await compressImage('https://example.com/small.jpg', 500);
            expect(result).toBe('blob:http://localhost/cached-blob');
            expect(global.createImageBitmap).not.toHaveBeenCalled();
        });

        it('compresses large image, performs canvas draw and increments state counter', async () => {
            const largeBlob = new Blob(['large image data']);
            Object.defineProperty(largeBlob, 'size', { value: 1200 * 1024 }); // 1.2 MB

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(largeBlob)
            });

            const state = { imageCount: 0 };
            const result = await compressImage('https://example.com/large.jpg', 500, state);

            expect(result).toBe('data:image/jpeg;base64,compressed-output');
            expect(state.imageCount).toBe(1);
        });

        it('throws error when target size is invalid or non-positive', async () => {
            await expect(compressImage('https://example.com/test.jpg', 0))
                .rejects
                .toThrow(/Invalid target size/);

            await expect(compressImage('https://example.com/test.jpg', 'invalid'))
                .rejects
                .toThrow(/Invalid target size/);
        });

        it('throws error when image fetch fails', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found'
            });

            await expect(compressImage('https://example.com/404.jpg', 500))
                .rejects
                .toThrow(/Failed to fetch image: 404 Not Found/);
        });
    });
});
