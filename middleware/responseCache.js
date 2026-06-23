function createResponseCache(options = {}) {
    const ttlMs = options.ttlMs || 30000;
    const maxItems = options.maxItems || 1000;
    const shouldCache = options.shouldCache || ((req) => req.method === 'GET');
    const cache = new Map();

    function getCacheKey(req) {
        return `${req.method}:${req.originalUrl}`;
    }

    function setCacheHeaders(res, ttlSeconds) {
        res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}, stale-while-revalidate=${ttlSeconds}`);
        res.setHeader('Vary', 'Accept-Encoding');
    }

    return function responseCache(req, res, next) {
        if (!shouldCache(req)) {
            return next();
        }

        const now = Date.now();
        const key = getCacheKey(req);
        const cached = cache.get(key);
        const ttlSeconds = Math.max(1, Math.floor(ttlMs / 1000));

        if (cached && cached.expiresAt > now) {
            res.status(cached.statusCode);
            Object.entries(cached.headers).forEach(([name, value]) => {
                if (value !== undefined) res.setHeader(name, value);
            });
            setCacheHeaders(res, ttlSeconds);
            res.setHeader('X-Cache', 'HIT');
            return res.send(cached.body);
        }

        if (cached) {
            cache.delete(key);
        }

        const originalSend = res.send.bind(res);
        res.send = (body) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                if (cache.size >= maxItems) {
                    const oldestKey = cache.keys().next().value;
                    cache.delete(oldestKey);
                }

                const contentType = res.getHeader('Content-Type');
                cache.set(key, {
                    body,
                    statusCode: res.statusCode,
                    headers: {
                        'Content-Type': contentType
                    },
                    expiresAt: Date.now() + ttlMs
                });

                setCacheHeaders(res, ttlSeconds);
                res.setHeader('X-Cache', 'MISS');
            }

            return originalSend(body);
        };

        return next();
    };
}

module.exports = createResponseCache;
