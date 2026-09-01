/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { optimizeImage } from '../lib/optimizeImage.js';
import { COMPRESSION_MODES } from '../lib/constants.js';

describe('optimizeImage.js', () => {
    let appMock;

    beforeEach(() => {
        appMock = {
            alert: jest.fn().mockResolvedValue(undefined),
            prompt: jest.fn(),
            attachNoteMedia: jest.fn().mockResolvedValue('https://example.com/compressed.jpg'),
            getNoteContent: jest.fn().mockResolvedValue('# Note\n\n![Screenshot](https://example.com/shot.png)\n\nSome text'),
            replaceNoteContent: jest.fn().mockResolvedValue(true),
            updateNoteImage: jest.fn().mockResolvedValue(true),
            context: {
                noteUUID: 'note-123',
                updateImage: jest.fn().mockResolvedValue(true)
            }
        };

        const mockBlob = new Blob(['png data'], { type: 'image/png' });
        Object.defineProperty(mockBlob, 'size', { value: 2000 * 1024 });

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            blob: jest.fn().mockResolvedValue(mockBlob)
        });

        global.createImageBitmap = jest.fn().mockResolvedValue({ width: 1920, height: 1080 });

        jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            clearRect: jest.fn(),
            drawImage: jest.fn()
        });
        jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,mockoutput');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('optimizeImage.check', () => {
        it('returns true when valid image with src is provided', async () => {
            expect(await optimizeImage.check(appMock, { src: 'https://example.com/shot.png' })).toBe(true);
        });

        it('returns false when image or src is missing', async () => {
            expect(await optimizeImage.check(appMock, null)).toBe(false);
            expect(await optimizeImage.check(appMock, {})).toBe(false);
        });
    });

    describe('optimizeImage.run — Inspection & Optimization Modes', () => {
        it('inspects PNG image, offers JPEG conversion, and updates in-place with caption', async () => {
            appMock.prompt.mockResolvedValue(['500kb', '500 KB', '0', 'image/jpeg', COMPRESSION_MODES.REPLACE, true]);

            const pluginContext = { constants: { imageCount: 0 } };
            await optimizeImage.run.call(pluginContext, appMock, { src: 'https://example.com/shot.png', caption: 'My Pic' });

            expect(appMock.prompt).toHaveBeenCalledTimes(1);
            expect(appMock.attachNoteMedia).toHaveBeenCalledTimes(1);
            expect(appMock.context.updateImage).toHaveBeenCalledWith({
                src: 'https://example.com/compressed.jpg',
                caption: expect.stringContaining('Compressed:')
            });
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Image optimized successfully!'));
            expect(pluginContext.constants.imageCount).toBe(1);
        });

        it('appends compressed image below original when append mode is selected', async () => {
            appMock.prompt.mockResolvedValue(['250kb', '250 KB', '0', 'image/jpeg', COMPRESSION_MODES.APPEND, true]);

            await optimizeImage.run(appMock, { src: 'https://example.com/shot.png', caption: 'Existing' });

            expect(appMock.replaceNoteContent).toHaveBeenCalledWith(
                { uuid: 'note-123' },
                expect.stringContaining('![Compressed](https://example.com/compressed.jpg)')
            );
        });
    });

    describe('optimizeImage.run — Edge Cases & Guards', () => {
        it('alerts if no image object is provided', async () => {
            await optimizeImage.run(appMock, null);
            expect(appMock.alert).toHaveBeenCalledWith('No valid image selected.');
            expect(appMock.prompt).not.toHaveBeenCalled();
        });

        it('exits quietly when user cancels the prompt', async () => {
            appMock.prompt.mockResolvedValue(null);
            await optimizeImage.run(appMock, { src: 'https://example.com/shot.png' });
            expect(appMock.attachNoteMedia).not.toHaveBeenCalled();
        });

        it('alerts when image is already under target threshold', async () => {
            const smallBlob = new Blob(['small']);
            Object.defineProperty(smallBlob, 'size', { value: 300 * 1024 });
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(smallBlob)
            });

            appMock.prompt.mockResolvedValue(['500kb', '500 KB', '0', 'auto', COMPRESSION_MODES.REPLACE, true]);

            await optimizeImage.run(appMock, { src: 'https://example.com/small.jpg' });

            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Image already complies with your target settings'));
            expect(appMock.attachNoteMedia).not.toHaveBeenCalled();
        });
    });
});
