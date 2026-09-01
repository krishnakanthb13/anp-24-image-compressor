import plugin from '../image-compressor.js';

describe('image-compressor.js — Plugin Definition', () => {
    describe('Entry Point Structure — Happy Path', () => {
        it('exports a valid plugin object conforming to Amplenote API spec', () => {
            expect(plugin).toBeDefined();
            expect(typeof plugin).toBe('object');
        });

        it('contains initial constants with imageCount 0', () => {
            expect(plugin.constants).toBeDefined();
            expect(plugin.constants.imageCount).toBe(0);
        });

        it('exposes "Optimize note" under noteOption', () => {
            expect(plugin.noteOption).toBeDefined();
            expect(plugin.noteOption['Optimize note']).toBeDefined();
            expect(typeof plugin.noteOption['Optimize note'].run).toBe('function');
            expect(typeof plugin.noteOption['Optimize note'].check).toBe('function');
        });

        it('exposes "Optimize image" under imageOption', () => {
            expect(plugin.imageOption).toBeDefined();
            expect(plugin.imageOption['Optimize image']).toBeDefined();
            expect(typeof plugin.imageOption['Optimize image'].run).toBe('function');
            expect(typeof plugin.imageOption['Optimize image'].check).toBe('function');
        });

        it('exposes compressImage engine method', () => {
            expect(typeof plugin.compressImage).toBe('function');
        });
    });
});
