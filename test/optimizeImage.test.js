/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { optimizeImage } from '../lib/optimizeImage.js';

describe('optimizeImage.js', () => {
    let appMock;

    beforeEach(() => {
        appMock = {
            context: {
                noteUUID: 'selected-note-uuid',
                updateImage: jest.fn()
            },
            getNoteContent: jest.fn(),
            replaceNoteContent: jest.fn(),
            updateNoteImage: jest.fn(),
            attachNoteMedia: jest.fn(),
            prompt: jest.fn(),
            alert: jest.fn()
        };

        global.URL.createObjectURL = jest.fn().mockReturnValue('blob:http://localhost/cached-blob');
        global.createImageBitmap = jest.fn().mockResolvedValue({ width: 800, height: 600 });
        jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            clearRect: jest.fn(),
            drawImage: jest.fn()
        });
        jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,mockdata');
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('optimizeImage.check', () => {
        it('returns true when valid image with src is provided', async () => {
            const valid = await optimizeImage.check(appMock, { src: 'https://example.com/pic.jpg' });
            expect(valid).toBe(true);
        });

        it('returns false when image or src is missing', async () => {
            expect(await optimizeImage.check(appMock, null)).toBe(false);
            expect(await optimizeImage.check(appMock, {})).toBe(false);
        });
    });

    describe('optimizeImage.run — Happy Path (Replace & Append Modes)', () => {
        const image = { src: 'https://example.com/single.jpg', caption: 'Single Image' };

        it('compresses and updates single image in-place in replace mode', async () => {
            const largeBlob = new Blob(['single image']);
            Object.defineProperty(largeBlob, 'size', { value: 1200 * 1024 });
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(largeBlob)
            });

            appMock.prompt.mockResolvedValue(['500', 'replace']);
            appMock.attachNoteMedia.mockResolvedValue('https://amplenote.com/new-media.jpg');

            const pluginContext = { constants: { imageCount: 0 } };
            await optimizeImage.run.call(pluginContext, appMock, image);

            expect(appMock.attachNoteMedia).toHaveBeenCalledWith({ uuid: 'selected-note-uuid' }, 'data:image/jpeg;base64,mockdata');
            expect(appMock.context.updateImage).toHaveBeenCalledWith({ src: 'https://amplenote.com/new-media.jpg' });
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Image compressed and replaced in-place'));
            expect(pluginContext.constants.imageCount).toBe(1);
        });

        it('inserts compressed image below original in append mode', async () => {
            const largeBlob = new Blob(['single image']);
            Object.defineProperty(largeBlob, 'size', { value: 1200 * 1024 });
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(largeBlob)
            });

            appMock.prompt.mockResolvedValue(['500', 'append']);
            appMock.getNoteContent.mockResolvedValue('# Note\n\n![Single Image](https://example.com/single.jpg)\n\nEnd text');
            appMock.attachNoteMedia.mockResolvedValue('https://amplenote.com/appended.jpg');

            await optimizeImage.run(appMock, image);

            expect(appMock.replaceNoteContent).toHaveBeenCalledWith(
                { uuid: 'selected-note-uuid' },
                expect.stringContaining('![Compressed: Single Image](https://amplenote.com/appended.jpg)')
            );
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Compressed image added below the original'));
        });
    });

    describe('optimizeImage.run — Edge Cases & Guards', () => {
        it('alerts and stops if image object is invalid or missing src', async () => {
            await optimizeImage.run(appMock, null);
            expect(appMock.alert).toHaveBeenCalledWith('No valid image selected.');
        });

        it('exits quietly without alert if user cancels prompt', async () => {
            appMock.prompt.mockResolvedValue(null);

            await optimizeImage.run(appMock, { src: 'https://example.com/pic.jpg' });

            expect(appMock.attachNoteMedia).not.toHaveBeenCalled();
            expect(appMock.alert).not.toHaveBeenCalled();
        });

        it('alerts if invalid size number is provided', async () => {
            appMock.prompt.mockResolvedValue(['abc', 'replace']);

            await optimizeImage.run(appMock, { src: 'https://example.com/pic.jpg' });

            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Invalid input'));
            expect(appMock.attachNoteMedia).not.toHaveBeenCalled();
        });

        it('alerts if image is already within target size limit', async () => {
            const smallBlob = new Blob(['small image']);
            Object.defineProperty(smallBlob, 'size', { value: 100 * 1024 });
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(smallBlob)
            });

            appMock.prompt.mockResolvedValue(['500', 'replace']);

            await optimizeImage.run(appMock, { src: 'https://example.com/small.jpg' });

            expect(appMock.attachNoteMedia).not.toHaveBeenCalled();
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Image is already under 500 KB'));
        });
    });

    describe('optimizeImage.run — Error Handling', () => {
        it('catches compression or attachment errors and alerts user', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Error'
            });

            appMock.prompt.mockResolvedValue(['500', 'replace']);

            await optimizeImage.run(appMock, { src: 'https://example.com/pic.jpg' });

            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Failed to compress image: Failed to fetch image: 500 Internal Error'));
        });
    });
});
