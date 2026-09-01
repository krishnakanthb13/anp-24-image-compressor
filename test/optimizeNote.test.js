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

        // Mock canvas & image bitmap for compression
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

    describe('optimizeNote.check', () => {
        it('returns true for checking capability', async () => {
            const result = await optimizeNote.check(appMock, 'test-note-uuid');
            expect(result).toBe(true);
        });
    });

    describe('optimizeNote.run — Happy Path (Replace & Append Modes)', () => {
        it('compresses and replaces image in-place when replace mode is chosen', async () => {
            const largeBlob = new Blob(['big image']);
            Object.defineProperty(largeBlob, 'size', { value: 1200 * 1024 });
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(largeBlob)
            });

            appMock.getNoteImages.mockResolvedValue([
                { src: 'https://example.com/big.jpg', caption: 'Big Pic' }
            ]);
            appMock.prompt.mockResolvedValue(['500', 'replace']);
            appMock.attachNoteMedia.mockResolvedValue('https://amplenote.com/attached.jpg');

            const pluginContext = { constants: { imageCount: 0 } };
            await optimizeNote.run.call(pluginContext, appMock, 'test-note-uuid');

            expect(appMock.attachNoteMedia).toHaveBeenCalledWith({ uuid: 'test-note-uuid' }, 'data:image/jpeg;base64,mockdata');
            expect(appMock.updateNoteImage).toHaveBeenCalledWith(
                { uuid: 'test-note-uuid' },
                { src: 'https://example.com/big.jpg', caption: 'Big Pic' },
                { src: 'https://amplenote.com/attached.jpg' }
            );
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Successfully compressed and replaced in-place for 1 image!'));
            expect(pluginContext.constants.imageCount).toBe(1);
        });

        it('appends compressed image below original when append mode is chosen', async () => {
            const largeBlob = new Blob(['photo image']);
            Object.defineProperty(largeBlob, 'size', { value: 1200 * 1024 });
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(largeBlob)
            });

            appMock.getNoteImages.mockResolvedValue([
                { src: 'https://example.com/photo.jpg', caption: 'Photo' }
            ]);
            appMock.getNoteContent.mockResolvedValue('# Note\n\n![Photo](https://example.com/photo.jpg)\n\nEnd text');
            appMock.prompt.mockResolvedValue(['500', 'append']);
            appMock.attachNoteMedia.mockResolvedValue('https://amplenote.com/compressed.jpg');

            await optimizeNote.run(appMock, 'test-note-uuid');

            expect(appMock.replaceNoteContent).toHaveBeenCalledWith(
                { uuid: 'test-note-uuid' },
                expect.stringContaining('![Compressed: Photo](https://amplenote.com/compressed.jpg)')
            );
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Successfully compressed and added below originals for 1 image!'));
        });
    });

    describe('optimizeNote.run — Edge Cases & Guards', () => {
        it('alerts and stops if no images are present in the note', async () => {
            appMock.getNoteImages.mockResolvedValue([]);

            await optimizeNote.run(appMock, 'test-note-uuid');

            expect(appMock.alert).toHaveBeenCalledWith('No images found in this note to optimize.');
            expect(appMock.prompt).not.toHaveBeenCalled();
        });

        it('exits gracefully without alert when prompt is canceled by user', async () => {
            appMock.getNoteImages.mockResolvedValue([{ src: 'https://example.com/img.jpg' }]);
            appMock.prompt.mockResolvedValue(null);

            await optimizeNote.run(appMock, 'test-note-uuid');

            expect(appMock.attachNoteMedia).not.toHaveBeenCalled();
            expect(appMock.alert).not.toHaveBeenCalled();
        });

        it('alerts invalid input if non-numeric or non-positive value entered', async () => {
            appMock.getNoteImages.mockResolvedValue([{ src: 'https://example.com/img.jpg' }]);
            appMock.prompt.mockResolvedValue(['-100', 'replace']);

            await optimizeNote.run(appMock, 'test-note-uuid');

            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Invalid input'));
            expect(appMock.attachNoteMedia).not.toHaveBeenCalled();
        });

        it('reports when all images are already under the target size', async () => {
            const smallBlob = new Blob(['small image']);
            Object.defineProperty(smallBlob, 'size', { value: 100 * 1024 }); // 100 KB
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
                blob: jest.fn().mockResolvedValue(smallBlob)
            });

            appMock.getNoteImages.mockResolvedValue([{ src: 'https://example.com/small.jpg' }]);
            appMock.prompt.mockResolvedValue(['500', 'replace']);

            await optimizeNote.run(appMock, 'test-note-uuid');

            expect(appMock.attachNoteMedia).not.toHaveBeenCalled();
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('already under 500 KB'));
        });
    });

    describe('optimizeNote.run — Error Handling', () => {
        it('handles individual image failure and reports failure count', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            appMock.getNoteImages.mockResolvedValue([
                { src: 'https://example.com/bad.jpg' }
            ]);
            appMock.prompt.mockResolvedValue(['500', 'replace']);

            await optimizeNote.run(appMock, 'test-note-uuid');

            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Failed to process 1 image'));
        });
    });
});
