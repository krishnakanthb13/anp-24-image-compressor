import {
    CORS_PROXY_URL,
    DEFAULT_MAX_SIZE_KB,
    COMPRESSION_MODES,
    COMPRESSION_CONFIG,
    DEFAULT_CONSTANTS
} from '../lib/constants.js';

describe('constants.js', () => {
    describe('Constants — Happy Path & Defaults', () => {
        it('exports correct CORS_PROXY_URL', () => {
            expect(CORS_PROXY_URL).toBe('https://amplenote-plugins-cors-anywhere.onrender.com/');
        });

        it('exports default max size of 500 KB per ds.md specification', () => {
            expect(DEFAULT_MAX_SIZE_KB).toBe(500);
        });

        it('defines replace and append compression modes', () => {
            expect(COMPRESSION_MODES.REPLACE).toBe('replace');
            expect(COMPRESSION_MODES.APPEND).toBe('append');
        });

        it('provides valid compression step configuration', () => {
            expect(COMPRESSION_CONFIG.initialQuality).toBe(0.9);
            expect(COMPRESSION_CONFIG.minQuality).toBe(0.1);
            expect(COMPRESSION_CONFIG.qualityStep).toBe(0.1);
            expect(COMPRESSION_CONFIG.scaleStep).toBe(0.8);
            expect(COMPRESSION_CONFIG.minDimension).toBe(100);
        });

        it('initializes default image count state to 0', () => {
            expect(DEFAULT_CONSTANTS.imageCount).toBe(0);
        });
    });
});
