import plugin from '../image-compressor.js';

describe('image-compressor.js — Plugin Definition', () => {
    describe('Entry Point Structure — Happy Path', () => {
        it('exports a valid plugin object conforming to Amplenote API spec', () => {
            expect(typeof plugin).toBe('object');
            expect(plugin).not.toBeNull();
        });

        it('contains initial constants with imageCount 0', () => {
            expect(plugin.constants).toBeDefined();
            expect(plugin.constants.imageCount).toBe(0);
        });

        it('exposes "Optimize note" under noteOption', () => {
            expect(plugin.noteOption).toBeDefined();
            expect(typeof plugin.noteOption['Optimize note']).toBe('object');
            expect(typeof plugin.noteOption['Optimize note'].check).toBe('function');
            expect(typeof plugin.noteOption['Optimize note'].run).toBe('function');
        });

        it('exposes "Compress image" under imageOption', () => {
            expect(plugin.imageOption).toBeDefined();
            expect(typeof plugin.imageOption['Compress image']).toBe('object');
            expect(typeof plugin.imageOption['Compress image'].check).toBe('function');
            expect(typeof plugin.imageOption['Compress image'].run).toBe('function');
        });

        it('exposes compressImage engine method', () => {
            expect(typeof plugin.compressImage).toBe('function');
        });
    });
});
