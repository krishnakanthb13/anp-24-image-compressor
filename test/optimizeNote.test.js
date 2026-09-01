/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { optimizeNote } from '../lib/optimizeNote.js';

describe('optimizeNote.js', () => {
    let appMock;

    beforeEach(() => {
        appMock = {
            context: { noteUUID: 'test-note-uuid' },
            getNoteImages: jest.fn(),
            getNoteContent: jest.fn(),
            replaceNoteContent: jest.fn(),
            updateNoteImage: jest.fn(),
            attachNoteMedia: jest.fn(),
            prompt: jest.fn(),
            alert: jest.fn(),
            notes: {
                find: jest.fn().mockResolvedValue({
                    updateImage: jest.fn(),
                    replaceContent: jest.fn()
                })
            }
        };

        global.URL.createObjectURL = jest.fn().mockReturnValue('blob:http://localhost/cached-blob');
        global.createImageBitmap = jest.fn().mockResolvedValue({ width: 1920, height: 1080 });
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

    describe('optimizeNote.check', () => {
        it('returns true for checking capability', async () => {
            const result = await optimizeNote.check(appMock, 'test-note-uuid');
            expect(result).toBe(true);
        });
    });

    describe('optimizeNote.run — Multi-Image Selection & Modes', () => {
        it('processes selected image in replace mode and presents savings report', async () => {
            const largeBlob = new Blob(['large image data']);
            Object.defineProperty(largeBlob, 'size', { value: 2000 * 1024 }); // 2 MB

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(largeBlob)
            });

            appMock.getNoteImages.mockResolvedValue([
                { src: 'https://example.com/big.jpg', caption: 'Big Picture' }
            ]);

            // Dialog returns: [image1_selected, preset, customSize, maxDim, format, mode, preserveGif]
            appMock.prompt.mockResolvedValue([true, '500kb', '500 KB', '0', 'image/jpeg', 'replace', true]);
            appMock.attachNoteMedia.mockResolvedValue('https://amplenote.com/attached.jpg');

            const pluginContext = { constants: { imageCount: 0 } };
            await optimizeNote.run.call(pluginContext, appMock, 'test-note-uuid');

            expect(appMock.attachNoteMedia).toHaveBeenCalledWith({ uuid: 'test-note-uuid' }, 'data:image/jpeg;base64,mockdata');
            expect(appMock.updateNoteImage).toHaveBeenCalledWith(
                { uuid: 'test-note-uuid' },
                expect.objectContaining({ src: 'https://example.com/big.jpg' }),
                { src: 'https://amplenote.com/attached.jpg' }
            );
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Successfully optimized 1 image'));
            expect(pluginContext.constants.imageCount).toBe(1);
        });

        it('appends compressed image with audit size tag in append mode', async () => {
            const largeBlob = new Blob(['large image data']);
            Object.defineProperty(largeBlob, 'size', { value: 2000 * 1024 });

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(largeBlob)
            });

            appMock.getNoteImages.mockResolvedValue([
                { src: 'https://example.com/photo.jpg', caption: 'Scenic' }
            ]);
            appMock.getNoteContent.mockResolvedValue('# Note\n\n![Scenic](https://example.com/photo.jpg)\n\nEnd text');
            appMock.prompt.mockResolvedValue([true, '500kb', '500 KB', '0', 'image/jpeg', 'append', true]);
            appMock.attachNoteMedia.mockResolvedValue('https://amplenote.com/compressed.jpg');

            await optimizeNote.run(appMock, 'test-note-uuid');

            expect(appMock.replaceNoteContent).toHaveBeenCalledWith(
                { uuid: 'test-note-uuid' },
                expect.stringContaining('![Compressed')
            );
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('added below originals'));
        });
    });

    describe('optimizeNote.run — Edge Cases & Guards', () => {
        it('alerts and stops if no images exist in note', async () => {
            appMock.getNoteImages.mockResolvedValue([]);
            await optimizeNote.run(appMock, 'test-note-uuid');

            expect(appMock.alert).toHaveBeenCalledWith('No images found in this note to optimize.');
            expect(appMock.prompt).not.toHaveBeenCalled();
        });

        it('exits quietly if user cancels the prompt', async () => {
            const blob = new Blob(['data']);
            global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: jest.fn().mockResolvedValue(blob) });

            appMock.getNoteImages.mockResolvedValue([{ src: 'https://example.com/img.jpg' }]);
            appMock.prompt.mockResolvedValue(null);

            await optimizeNote.run(appMock, 'test-note-uuid');
            expect(appMock.attachNoteMedia).not.toHaveBeenCalled();
        });

        it('alerts if user unchecks all images in the checklist', async () => {
            const blob = new Blob(['data']);
            global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: jest.fn().mockResolvedValue(blob) });

            appMock.getNoteImages.mockResolvedValue([{ src: 'https://example.com/img.jpg' }]);
            // Image unchecked: [false, '500kb', ...]
            appMock.prompt.mockResolvedValue([false, '500kb', '500 KB', '0', 'image/jpeg', 'replace', true]);

            await optimizeNote.run(appMock, 'test-note-uuid');
            expect(appMock.alert).toHaveBeenCalledWith('No images were selected for optimization.');
        });
    });
});
