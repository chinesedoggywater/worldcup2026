/**
 * match-result.js — fetch match result + scorers from varzesh3
 * Usage: node match-result.js <url>
 */

const axios = require('axios');

const url = process.argv[2];
if (!url) {
    console.error('Usage: node match-result.js <varzesh3-match-url>');
    process.exit(1);
}

function clean(str) {
    return str
        .replace(/<[^>]+>/g, ' ')
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/\u202b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function fetchMatch(url) {
    const { data: html } = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36' },
        timeout: 10000
    });

    // ── teams & score ─────────────────────────────────────────────────────────
    const titleRaw = clean((html.match(/<title[^>]*>([\s\S]+?)<\/title>/) || ['',''])[1]);
    const titleClean = titleRaw.replace(/بازی امروز\s*/, '').replace(/\s*[-–|].*$/, '').trim();
    const vs = titleClean.split(' مقابل ');
    const homeTeam = vs[0]?.trim() || 'میزبان';
    const awayTeam = vs[1]?.trim() || 'مهمان';

    let homeScore = '?', awayScore = '?';
    const summarySlug = html.match(/خلاصه-بازی-[\u0600-\u06FF\w%-]+-(\d+)-[\u0600-\u06FF\w%-]+-(\d+)/);
    if (summarySlug) { homeScore = summarySlug[1]; awayScore = summarySlug[2]; }

    // ── parse goal events ─────────────────────────────────────────────────────
    // Split HTML on each goal.svg img closing tag (src attr is always the last one)
    const SPLIT = 'goal.svg&amp;w=48&amp;q=75"/>';
    const parts = html.split(SPLIT);

    const goals = [];
    const ownGoals = [];

    for (let i = 1; i < parts.length; i++) {
        // detect own goal: the img that just closed had alt="گل به خودی"
        const prevTail = parts[i - 1].slice(-700);
        const isOwnGoal = prevTail.includes('alt="\u06AF\u0644 \u0628\u0647 \u062E\u0648\u062F\u06CC"');

        const text = clean(parts[i]).substring(0, 250);

        // stop at player-ratings section
        if (/^\d+\s*\.\s*[\u0600-\u06FF]/.test(text)) break;

        const scoreM = text.match(/^(\d+)\s*-\s*(\d+)/);
        if (!scoreM) continue;
        const score = scoreM[1] + '-' + scoreM[2];

        const afterScore = text.slice(text.indexOf(scoreM[0]) + scoreM[0].length).trim();

        if (isOwnGoal) {
            const nameM = afterScore.match(/^([\u0600-\u06FF][^\d'،]{2,35}?)(?:\s+-|\s*\d|$)/);
            const scorer = nameM ? nameM[1].trim() : afterScore.split(/\s+/).slice(0, 3).join(' ');
            ownGoals.push({ score, scorer });
        } else {
            const segs = afterScore.split(/\s+-\s+/);
            const scorer = (segs[0] || '').replace(/\s*\d.*$/, '').trim();
            let assist = (segs[1] || '').replace(/\s*\d.*$/, '').trim() || null;
            if (assist && !/[\u0600-\u06FF]/.test(assist)) assist = null;
            if (scorer && /[\u0600-\u06FF]/.test(scorer)) {
                goals.push({ score, scorer, assist });
            }
        }
    }

    return { homeTeam, awayTeam, homeScore, awayScore, goals, ownGoals };
}

(async () => {
    try {
        const r = await fetchMatch(url);

        console.log('\n' + '═'.repeat(48));
        console.log('  ' + r.homeTeam + '  ' + r.homeScore + ' - ' + r.awayScore + '  ' + r.awayTeam);
        console.log('═'.repeat(48));

        if (r.goals.length > 0) {
            console.log('\n⚽  گل‌ها:\n');
            r.goals.forEach(g => {
                const assist = g.assist ? '  (پاس: ' + g.assist + ')' : '';
                console.log('  [' + g.score + ']  ' + g.scorer + assist);
            });
        }

        if (r.ownGoals.length > 0) {
            console.log('\n🥅  گل به خودی:\n');
            r.ownGoals.forEach(g => {
                console.log('  [' + g.score + ']  ' + g.scorer);
            });
        }

        if (r.goals.length === 0 && r.ownGoals.length === 0) {
            console.log('\n  هنوز گلی ثبت نشده یا بازی شروع نشده.');
        }

        console.log('');
    } catch (err) {
        console.error('خطا:', err.message);
        process.exit(1);
    }
})();
