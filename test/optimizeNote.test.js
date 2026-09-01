/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { optimizeNote } from '../lib/optimizeNote.js';
import { COMPRESSION_MODES } from '../lib/constants.js';

describe('optimizeNote.js', () => {
    let appMock;

    beforeEach(() => {
        appMock = {
            alert: jest.fn().mockResolvedValue(undefined),
            prompt: jest.fn(),
            getNoteImages: jest.fn().mockResolvedValue([
                { src: 'https://example.com/photo1.jpg', caption: 'First Photo' },
                { src: 'https://example.com/photo2.png', caption: 'Second Photo' }
            ]),
            attachNoteMedia: jest.fn().mockResolvedValue('https://example.com/optimized.jpg'),
            getNoteContent: jest.fn().mockResolvedValue(
                '# Vacation\n\n![First Photo](https://example.com/photo1.jpg)\n\n![Second Photo](https://example.com/photo2.png)'
            ),
            replaceNoteContent: jest.fn().mockResolvedValue(true),
            updateNoteImage: jest.fn().mockResolvedValue(true)
        };

        const mockBlob = new Blob(['sample-data'], { type: 'image/jpeg' });
        Object.defineProperty(mockBlob, 'size', { value: 1800 * 1024 });

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            blob: jest.fn().mockResolvedValue(mockBlob)
        });

        global.createImageBitmap = jest.fn().mockResolvedValue({ width: 2400, height: 1600 });

        jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            clearRect: jest.fn(),
            drawImage: jest.fn()
        });
        jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,mockoutput');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('optimizeNote.check', () => {
        it('returns true for checking capability', async () => {
            expect(await optimizeNote.check(appMock)).toBe(true);
        });
    });

    describe('optimizeNote.run — Guided Workflows', () => {
        it('executes Quick Batch workflow across multiple selected images', async () => {
            // Step 1: Select both images + strategy 'batch'
            // Step 2: Batch settings: 500kb, 500 KB, maxDim 1920, jpeg, replace, true
            appMock.prompt
                .mockResolvedValueOnce([true, true, 'batch'])
                .mockResolvedValueOnce(['500kb', '500 KB', '1920', 'image/jpeg', COMPRESSION_MODES.REPLACE, true]);

            const pluginContext = { constants: { imageCount: 0 } };
            await optimizeNote.run.call(pluginContext, appMock, 'test-note-uuid');

            expect(appMock.prompt).toHaveBeenCalledTimes(2);
            expect(appMock.attachNoteMedia).toHaveBeenCalledTimes(2);
            expect(appMock.updateNoteImage).toHaveBeenCalledTimes(2);
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Note Optimization Completed!'));
            expect(pluginContext.constants.imageCount).toBe(2);
        });

        it('executes Step-by-Step Individual workflow allowing custom settings per image', async () => {
            appMock.createNote = jest.fn().mockResolvedValue('test-report-uuid');
            appMock.insertNoteContent = jest.fn().mockResolvedValue(true);

            // Step 1: Select both images + strategy 'individual'
            // Step 2: Prompt for Image 1 (Replace), Prompt for Image 2 (New Note)
            appMock.prompt
                .mockResolvedValueOnce([true, true, 'individual'])
                .mockResolvedValueOnce(['500kb', '500 KB', '0', 'image/jpeg', COMPRESSION_MODES.REPLACE, true])
                .mockResolvedValueOnce(['250kb', '250 KB', '0', 'image/jpeg', COMPRESSION_MODES.NEW_NOTE, true]);

            await optimizeNote.run(appMock, 'test-note-uuid');

            expect(appMock.prompt).toHaveBeenCalledTimes(3);
            expect(appMock.createNote).toHaveBeenCalledWith(
                expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
                ['-reports/-image-compressor']
            );
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Note Optimization Completed!'));
        });

        it('fast-tracks single selected image directly into single configuration', async () => {
            // Step 1: Select only 1 image out of 2 + strategy 'batch'
            // Step 2: Directly prompts for that single image
            appMock.prompt
                .mockResolvedValueOnce([true, false, 'batch'])
                .mockResolvedValueOnce(['500kb', '500 KB', '0', 'image/jpeg', COMPRESSION_MODES.REPLACE, true]);

            await optimizeNote.run(appMock, 'test-note-uuid');

            expect(appMock.prompt).toHaveBeenCalledTimes(2);
            expect(appMock.attachNoteMedia).toHaveBeenCalledTimes(1);
            expect(appMock.alert).toHaveBeenCalledWith(expect.stringContaining('Note Optimization Completed!'));
        });
    });

    describe('optimizeNote.run — Edge Cases & Guards', () => {
        it('alerts and stops if no images exist in note', async () => {
            appMock.getNoteImages.mockResolvedValue([]);

            await optimizeNote.run(appMock, 'test-note-uuid');

            expect(appMock.alert).toHaveBeenCalledWith('No images found in this note to optimize.');
            expect(appMock.prompt).not.toHaveBeenCalled();
        });

        it('exits quietly if user cancels the selector dialog', async () => {
            appMock.prompt.mockResolvedValue(null);

            await optimizeNote.run(appMock, 'test-note-uuid');

            expect(appMock.attachNoteMedia).not.toHaveBeenCalled();
        });

        it('alerts if user unchecks all images in the selector', async () => {
            appMock.prompt.mockResolvedValue([false, false, 'batch']);

            await optimizeNote.run(appMock, 'test-note-uuid');

            expect(appMock.alert).toHaveBeenCalledWith('No images were selected for optimization.');
            expect(appMock.attachNoteMedia).not.toHaveBeenCalled();
        });
    });
});
