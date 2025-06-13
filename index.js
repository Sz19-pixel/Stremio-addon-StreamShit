const { addonBuilder } = require('stremio-addon-sdk');
const ScraperManager = require('./src/scrapers/ScraperManager');
const TorrentManager = require('./src/torrents/TorrentManager');
const CacheManager = require('./src/utils/CacheManager');

// Addon manifest
const manifest = {
    id: 'org.stremio.scraper.addon',
    version: '1.0.0',
    name: 'Multi-Source Scraper Addon',
    description: 'Scrapes direct streaming links from multiple websites with torrent fallback',
    logo: 'https://via.placeholder.com/128x128/000000/FFFFFF?text=MSA',
    background: 'https://via.placeholder.com/1920x1080/000000/FFFFFF?text=Multi-Source+Addon',
    resources: [
        'catalog',
        'meta', 
        'stream'
    ],
    types: ['movie', 'series'],
    catalogs: [
        {
            type: 'movie',
            id: 'scraped-movies',
            name: 'Scraped Movies',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'genre', isRequired: false, options: ['action', 'comedy', 'drama', 'horror', 'thriller', 'sci-fi'] },
                { name: 'skip', isRequired: false }
            ]
        },
        {
            type: 'series',
            id: 'scraped-series', 
            name: 'Scraped TV Series',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'genre', isRequired: false, options: ['action', 'comedy', 'drama', 'horror', 'thriller', 'sci-fi'] },
                { name: 'skip', isRequired: false }
            ]
        }
    ],
    idPrefixes: ['tt', 'scraped:']
};

// Initialize addon builder
const builder = new addonBuilder(manifest);

// Initialize managers
const scraperManager = new ScraperManager();
const torrentManager = new TorrentManager();
const cacheManager = new CacheManager();

// Catalog handler - returns list of content
builder.defineCatalogHandler(async (args) => {
    try {
        const { type, id, extra = {} } = args;
        const cacheKey = `catalog:${type}:${id}:${JSON.stringify(extra)}`;

        // Check cache first
        const cached = await cacheManager.get(cacheKey);
        if (cached) {
            return { metas: cached };
        }

        let metas = [];

        // If search query provided, search across scrapers
        if (extra.search) {
            metas = await scraperManager.search(extra.search, type);
        } else {
            // Otherwise return popular/trending content
            metas = await scraperManager.getPopular(type, extra.genre);
        }

        // Cache results for 1 hour
        await cacheManager.set(cacheKey, metas, 3600);

        return { metas: metas.slice(0, 100) }; // Limit to 100 results

    } catch (error) {
        console.error('Catalog handler error:', error);
        return { metas: [] };
    }
});

// Meta handler - returns detailed metadata for specific content
builder.defineMetaHandler(async (args) => {
    try {
        const { type, id } = args;
        const cacheKey = `meta:${type}:${id}`;

        // Check cache first
        const cached = await cacheManager.get(cacheKey);
        if (cached) {
            return { meta: cached };
        }

        // Get metadata from scrapers
        const meta = await scraperManager.getMeta(id, type);

        if (meta) {
            // Cache for 24 hours
            await cacheManager.set(cacheKey, meta, 86400);
            return { meta };
        }

        return { meta: null };

    } catch (error) {
        console.error('Meta handler error:', error);
        return { meta: null };
    }
});

// Stream handler - returns streaming links
builder.defineStreamHandler(async (args) => {
    try {
        const { type, id } = args;
        const cacheKey = `streams:${type}:${id}`;

        // Check cache first (shorter cache time for streams)
        const cached = await cacheManager.get(cacheKey);
        if (cached) {
            return { streams: cached };
        }

        let streams = [];

        // First try direct scrapers
        const directStreams = await scraperManager.getStreams(id, type);
        streams = streams.concat(directStreams);

        // If no direct streams found, try torrent sources as fallback
        if (streams.length === 0) {
            const torrentStreams = await torrentManager.getStreams(id, type);
            streams = streams.concat(torrentStreams);
        }

        // Cache results for 30 minutes
        if (streams.length > 0) {
            await cacheManager.set(cacheKey, streams, 1800);
        }

        return { streams };

    } catch (error) {
        console.error('Stream handler error:', error);
        return { streams: [] };
    }
});

// التصدير الصحيح لـ Vercel (لا يوجد أي كود لتشغيل سيرفر يدوي)
module.exports = builder.getInterface();
