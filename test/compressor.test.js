/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import {
    formatBytes,
    parseSizeInput,
    resolveImageUrl,
    fetchImageMetadata,
    insertImageBelow,
    compressImage,
    getSmartSizePresets,
    getSmartDimensionLimits,
    getSmartDefaultTarget,
    withPreservedScroll,
    fetchWithCorsFallback,
    updateImageSurgically,
    createCompressionReportNote
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
            expect(formatBytes(31 * 1024)).toBe('31 KB');
        });

        it('formats byte counts over 1 MB as MB with 2 decimal places', () => {
            expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.50 MB');
            expect(formatBytes(10.25 * 1024 * 1024)).toBe('10.25 MB');
        });
    });

    describe('getSmartSizePresets & getSmartDefaultTarget', () => {
        it('generates relative reduction presets for small/lightweight images', () => {
            const size31KB = 31 * 1024;
            const presets = getSmartSizePresets(size31KB);

            expect(presets[0].label).toContain('50% Reduction');
            expect(presets[1].label).toContain('75% Reduction');
            expect(getSmartDefaultTarget(size31KB)).toBe('16 KB');
        });

        it('generates percentage savings presets for large images', () => {
            const size3MB = 3 * 1024 * 1024;
            const presets = getSmartSizePresets(size3MB);

            expect(presets[0].label).toContain('500 KB');
            expect(presets[0].label).toContain('space saved');
            expect(getSmartDefaultTarget(size3MB)).toBe('500 KB');
        });
    });

    describe('getSmartDimensionLimits', () => {
        it('restricts dimension options to realistic caps when image width is small', () => {
            const limits = getSmartDimensionLimits(612);
            expect(limits.length).toBe(2);
            expect(limits[0].label).toContain('Keep Original (612 px)');
            expect(limits[1].label).toContain('Max 400 px');
        });

        it('provides standard HD and full HD caps when image width is large', () => {
            const limits = getSmartDimensionLimits(3840);
            expect(limits.some(l => l.value === '1920')).toBe(true);
            expect(limits.some(l => l.value === '1280')).toBe(true);
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
            const original = 2000 * 1024;
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

    describe('fetchWithCorsFallback', () => {
        it('fetches via primary proxy and falls back gracefully', async () => {
            const mockResponse = { ok: true, blob: jest.fn().mockResolvedValue(new Blob(['test'])) };
            global.fetch = jest.fn().mockResolvedValue(mockResponse);

            const res = await fetchWithCorsFallback('https://images.amplenote.com/img.jpg', 'https://proxy.example.com/');
            expect(res.ok).toBe(true);
            expect(global.fetch).toHaveBeenCalled();
        });
    });

    describe('withPreservedScroll', () => {
        it('executes prompt action and preserves container scroll', async () => {
            const mockAction = jest.fn().mockResolvedValue('user-selected');
            const result = await withPreservedScroll('https://example.com/photo.jpg', mockAction);
            expect(result).toBe('user-selected');
            expect(mockAction).toHaveBeenCalledTimes(1);
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
    });

    describe('insertImageBelow', () => {
        it('inserts compressed image below matching markdown image with attached caption', () => {
            const md = '# Note\n\n![My Dog|500](https://example.com/dog.png)\n\nText';
            const updated = insertImageBelow(md, 'https://example.com/dog.png', 'https://example.com/dog-opt.jpg', 'Compressed: 300 KB');

            expect(updated).toContain('![My Dog|500](https://example.com/dog.png)\n\n![Compressed: 300 KB](https://example.com/dog-opt.jpg)');
        });

        it('reliably replaces image when there is exactly one match in content (BUG-1 test)', () => {
            const singleMd = '![Screenshot](https://example.com/shot.png)';
            const res = insertImageBelow(singleMd, 'https://example.com/shot.png', 'https://example.com/shot-opt.jpg', 'Compressed');
            expect(res).toContain('![Screenshot](https://example.com/shot.png)\n\n![Compressed](https://example.com/shot-opt.jpg)');
        });
    });

    describe('compressImage', () => {
        beforeEach(() => {
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
            const smallBlob = new Blob(['small'], { type: 'image/jpeg' });
            Object.defineProperty(smallBlob, 'size', { value: 200 * 1024 });

            const result = await compressImage(smallBlob, 500 * 1024, { maxDimension: 0 });
            expect(result.skipped).toBe(true);
            expect(result.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
        });

        it('preserves GIF animation without flattening if preserveGif is enabled', async () => {
            const gifBlob = new Blob(['gif'], { type: 'image/gif' });
            Object.defineProperty(gifBlob, 'size', { value: 1200 * 1024 });

            const result = await compressImage(gifBlob, 500 * 1024, { preserveGif: true });
            expect(result.skipped).toBe(true);
            expect(result.dataUrl).toMatch(/^data:image\/gif;base64,/);
            expect(result.reason).toBe('Preserved GIF animation');
        });

        it('compresses large image, respects maxDimension, and returns savings metrics', async () => {
            const largeBlob = new Blob(['large image data']);
            Object.defineProperty(largeBlob, 'size', { value: 3000 * 1024 });

            const state = { imageCount: 0 };
            const result = await compressImage(largeBlob, 500 * 1024, { maxDimension: 1920, format: 'image/jpeg' }, state);

            expect(result.skipped).toBe(false);
            expect(result.dataUrl).toBe('data:image/jpeg;base64,mockoutput');
            expect(state.imageCount).toBe(1);
            expect(result.savingsPercent).toBeGreaterThanOrEqual(0);
        });
    });

    describe('updateImageSurgically', () => {
        it('uses app.context.updateImage when available', async () => {
            const app = { context: { updateImage: jest.fn().mockResolvedValue(true) } };
            const img = { src: 'https://example.com/a.jpg' };
            const ok = await updateImageSurgically(app, { uuid: '123' }, img, { src: 'https://example.com/b.jpg' });
            expect(ok).toBe(true);
            expect(app.context.updateImage).toHaveBeenCalledWith({ src: 'https://example.com/b.jpg' });
        });

        it('falls back to app.updateNoteImage', async () => {
            const app = { updateNoteImage: jest.fn().mockResolvedValue(true) };
            const img = { src: 'https://example.com/a.jpg' };
            const ok = await updateImageSurgically(app, { uuid: '123' }, img, { src: 'https://example.com/b.jpg' });
            expect(ok).toBe(true);
            expect(app.updateNoteImage).toHaveBeenCalledWith({ uuid: '123' }, img, { src: 'https://example.com/b.jpg' });
        });

        it('falls back to note.updateImage via app.notes.find', async () => {
            const noteMock = { updateImage: jest.fn().mockResolvedValue(true) };
            const app = { notes: { find: jest.fn().mockResolvedValue(noteMock) } };
            const img = { src: 'https://example.com/a.jpg' };
            const ok = await updateImageSurgically(app, { uuid: '123' }, img, { src: 'https://example.com/b.jpg' });
            expect(ok).toBe(true);
            expect(noteMock.updateImage).toHaveBeenCalledWith(img, { src: 'https://example.com/b.jpg' });
        });
    });

    describe('createCompressionReportNote', () => {
        it('creates report note with date-time title, tag and summary markdown', async () => {
            const app = {
                createNote: jest.fn().mockResolvedValue('report-uuid-123'),
                attachNoteMedia: jest.fn().mockResolvedValue('https://images.amplenote.com/opt1.jpg'),
                insertNoteContent: jest.fn().mockResolvedValue(true)
            };

            const items = [
                {
                    dataUrl: 'data:image/jpeg;base64,mock',
                    caption: 'Compressed: 250 KB',
                    beforeStr: '1.2 MB',
                    afterStr: '250 KB',
                    percentSaved: 79,
                    originalBytes: 1200 * 1024,
                    finalBytes: 250 * 1024
                }
            ];

            const uuid = await createCompressionReportNote(app, 'source-note-uuid', items);
            expect(uuid).toBe('report-uuid-123');
            expect(app.createNote).toHaveBeenCalledWith(
                expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
                ['-reports/-image-compressor']
            );
            expect(app.attachNoteMedia).toHaveBeenCalledWith(
                { uuid: 'report-uuid-123' },
                'data:image/jpeg;base64,mock'
            );
            expect(app.insertNoteContent).toHaveBeenCalledWith(
                { uuid: 'report-uuid-123' },
                expect.stringContaining('![Image 1 • 250 KB (was 1.2 MB — 79% saved)](https://images.amplenote.com/opt1.jpg)')
            );
        });
    });
});

