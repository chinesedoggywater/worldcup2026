/**
 * Cache Benchmark — simulates DB latency to measure cache impact
 * Usage: node benchmark-cache.js
 */

const REQUESTS = 500;
const CONCURRENCY = 50;
const DB_LATENCY_MS = 15;   // realistic MongoDB query time
const CACHE_TTL = 30 * 1000;

// ── helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// simulate a DB query for a single game
async function fetchGameFromDB(id) {
    await sleep(DB_LATENCY_MS);
    return { id, home_score: 1, away_score: 0, finished: false };
}

async function runBatch(fn, total, concurrency) {
    let completed = 0;
    const times = [];

    while (completed < total) {
        const batch = Math.min(concurrency, total - completed);
        const ids = Array.from({ length: batch }, (_, i) => ((completed + i) % 104) + 1);
        const results = await Promise.all(ids.map(async id => {
            const t0 = Date.now();
            await fn(id);
            return Date.now() - t0;
        }));
        times.push(...results);
        completed += batch;
    }
    return times;
}

function stats(times, label, wallMs) {
    const sorted = [...times].sort((a, b) => a - b);
    const avg = times.reduce((s, t) => s + t, 0) / times.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const rps  = Math.round(times.length / (wallMs / 1000));

    console.log(`\n${label}`);
    console.log('─'.repeat(42));
    console.log(`  Total requests : ${times.length}`);
    console.log(`  Wall time      : ${wallMs} ms`);
    console.log(`  Throughput     : ${rps} req/s`);
    console.log(`  Avg latency    : ${avg.toFixed(1)} ms`);
    console.log(`  p95 latency    : ${p95} ms`);
    console.log(`  p99 latency    : ${p99} ms`);
    return { rps, avg, p95 };
}

// ── scenario A: NO cache ──────────────────────────────────────────────────────

async function scenarioNoCache() {
    const t0 = Date.now();
    const times = await runBatch(
        (id) => fetchGameFromDB(id),
        REQUESTS,
        CONCURRENCY
    );
    return stats(times, '❌  WITHOUT cache (every request hits DB)', Date.now() - t0);
}

// ── scenario B: WITH cache (same logic as getController.js) ──────────────────

const gameCache = new Map();

async function getGameCached(id) {
    const now = Date.now();
    const cached = gameCache.get(id);
    if (cached && (now - cached.time) < CACHE_TTL) {
        return cached.data;
    }
    const data = await fetchGameFromDB(id);
    gameCache.set(id, { data, time: now });
    return data;
}

async function scenarioWithCache() {
    gameCache.clear();
    // warm up: first pass fills the cache
    for (let id = 1; id <= 104; id++) {
        await getGameCached(id);
    }

    const t0 = Date.now();
    const times = await runBatch(getGameCached, REQUESTS, CONCURRENCY);
    return stats(times, '✅  WITH cache (30s TTL, Map)', Date.now() - t0);
}

// ── main ──────────────────────────────────────────────────────────────────────

(async () => {
    console.log('\n🏆  World Cup 2026 API — Cache Benchmark');
    console.log('═'.repeat(42));
    console.log(`  Requests    : ${REQUESTS}`);
    console.log(`  Concurrency : ${CONCURRENCY}`);
    console.log(`  Simulated DB latency : ${DB_LATENCY_MS} ms`);

    const a = await scenarioNoCache();
    const b = await scenarioWithCache();

    const speedup = (a.avg / b.avg).toFixed(1);
    const rpsDiff = b.rps - a.rps;

    console.log('\n📊  Summary');
    console.log('═'.repeat(42));
    console.log(`  Throughput gain : +${rpsDiff} req/s  (${(b.rps/a.rps).toFixed(1)}x)`);
    console.log(`  Latency speedup : ${speedup}x faster per request`);
    console.log(`  p95 improvement : ${a.p95} ms → ${b.p95} ms\n`);
})();
