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
        global.createImageBitmap = jest.fn().mockResolvedValue({ width: 2560, height: 1440 });
        jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            clearRect: jest.fn(),
            drawImage: jest.fn()
        });
        jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,mockdata');
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
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

    describe('optimizeImage.run — Inspection & Optimization Modes', () => {
        const image = { src: 'https://example.com/single.png', caption: 'Single Picture' };

        it('inspects PNG image, offers JPEG conversion, and updates in-place', async () => {
            const pngBlob = new Blob(['png data'], { type: 'image/png' });
            Object.defineProperty(pngBlob, 'size', { value: 3000 * 1024 }); // 3 MB

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(pngBlob)
            });

            // Dialog returns: [preset, customSize, maxDim, format, mode, preserveGif]
            appMock.prompt.mockResolvedValue(['500kb', '500 KB', '1920', 'image/jpeg', 'replace', false]);
            appMock.attachNoteMedia.mockResolvedValue('https://amplenote.com/opt.jpg');

            const pluginContext = { constants: { imageCount: 0 } };
            await optimizeImage.run.call(pluginContext, appMock, image);

            expect(appMock.attachNoteMedia).toHaveBeenCalledWith({ uuid: 'selected-note-uuid' }, 'data:image/jpeg;base64,mockdata');
            expect(appMock.context.updateImage).toHaveBeenCalledWith({ src: 'https://amplenote.com/opt.jpg' });
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Image optimized successfully!'));
            expect(pluginContext.constants.imageCount).toBe(1);
        });

        it('appends compressed image below original when append mode is selected', async () => {
            const jpegBlob = new Blob(['jpeg data'], { type: 'image/jpeg' });
            Object.defineProperty(jpegBlob, 'size', { value: 1800 * 1024 });

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(jpegBlob)
            });

            appMock.prompt.mockResolvedValue(['500kb', '500 KB', '0', 'image/jpeg', 'append', false]);
            appMock.getNoteContent.mockResolvedValue('# Note\n\n![Single Picture](https://example.com/single.png)\n\nEnd text');
            appMock.attachNoteMedia.mockResolvedValue('https://amplenote.com/appended.jpg');

            await optimizeImage.run(appMock, image);

            expect(appMock.replaceNoteContent).toHaveBeenCalledWith(
                { uuid: 'selected-note-uuid' },
                expect.stringContaining('![Compressed')
            );
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Added below original'));
        });
    });

    describe('optimizeImage.run — Edge Cases & Guards', () => {
        it('alerts if no image object is provided', async () => {
            await optimizeImage.run(appMock, null);
            expect(appMock.alert).toHaveBeenCalledWith('No valid image selected.');
        });

        it('exits quietly when user cancels the prompt', async () => {
            const blob = new Blob(['data']);
            global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: jest.fn().mockResolvedValue(blob) });

            appMock.prompt.mockResolvedValue(null);
            await optimizeImage.run(appMock, { src: 'https://example.com/pic.jpg' });

            expect(appMock.attachNoteMedia).not.toHaveBeenCalled();
        });

        it('alerts when image is already under target threshold', async () => {
            const smallBlob = new Blob(['small'], { type: 'image/jpeg' });
            Object.defineProperty(smallBlob, 'size', { value: 100 * 1024 });

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(smallBlob)
            });

            appMock.prompt.mockResolvedValue(['500kb', '500 KB', '0', 'image/jpeg', 'replace', false]);
            await optimizeImage.run(appMock, { src: 'https://example.com/small.jpg' });

            expect(appMock.attachNoteMedia).not.toHaveBeenCalled();
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('already under'));
        });
    });
});
