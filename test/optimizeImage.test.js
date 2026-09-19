/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { optimizeImage, downloadImageOption } from '../lib/optimizeImage.js';
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
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Image optimized surgically in-place!'));
            expect(pluginContext.constants.imageCount).toBe(1);
        });

        it('exports compressed image to new report note when new_note mode is selected', async () => {
            appMock.createNote = jest.fn().mockResolvedValue('new-report-uuid');
            appMock.insertNoteContent = jest.fn().mockResolvedValue(true);
            appMock.prompt.mockResolvedValue(['250kb', '250 KB', '0', 'image/jpeg', COMPRESSION_MODES.NEW_NOTE, true]);

            await optimizeImage.run(appMock, { src: 'https://example.com/shot.png', caption: 'Existing' });

            expect(appMock.createNote).toHaveBeenCalledWith(
                expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
                ['-reports/-image-compressor']
            );
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('exported to new note'));
            expect(appMock.replaceNoteContent).not.toHaveBeenCalled();
        });

        it('downloads compressed image directly to device and leaves note untouched in download mode', async () => {
            const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
            appMock.prompt.mockResolvedValue(['500kb', '500 KB', '0', 'image/jpeg', COMPRESSION_MODES.DOWNLOAD, true]);

            await optimizeImage.run(appMock, { src: 'https://example.com/my-photo.png' });

            expect(appMock.attachNoteMedia).not.toHaveBeenCalled();
            expect(appMock.context.updateImage).not.toHaveBeenCalled();
            expect(clickSpy).toHaveBeenCalled();
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Image compressed & downloaded!'));

            clickSpy.mockRestore();
        });

        it('both replaces image in-place and downloads copy when replace_and_download is selected', async () => {
            const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
            appMock.prompt.mockResolvedValue(['500kb', '500 KB', '0', 'image/jpeg', COMPRESSION_MODES.REPLACE_AND_DOWNLOAD, true]);

            await optimizeImage.run(appMock, { src: 'https://example.com/my-photo.png' });

            expect(appMock.attachNoteMedia).toHaveBeenCalledTimes(1);
            expect(appMock.context.updateImage).toHaveBeenCalledTimes(1);
            expect(clickSpy).toHaveBeenCalled();
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('optimized surgically in-place & downloaded!'));

            clickSpy.mockRestore();
        });

        it('supports dedicated downloadImageOption shortcut', async () => {
            expect(await downloadImageOption.check(appMock, { src: 'https://example.com/img.png' })).toBe(true);
            expect(await downloadImageOption.check(appMock, null)).toBe(false);

            const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
            appMock.prompt.mockResolvedValue(['500kb', '500 KB', '0', 'image/jpeg', COMPRESSION_MODES.DOWNLOAD, true]);

            await downloadImageOption.run(appMock, { src: 'https://example.com/img.png' });
            expect(clickSpy).toHaveBeenCalled();
            clickSpy.mockRestore();
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
