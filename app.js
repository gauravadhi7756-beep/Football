'use strict';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const LEAGUES = [
  { id: 'uefa.champions', name: 'UEFA Champions League', short: 'UCL', logo: 2 },
  { id: 'uefa.nations', name: 'UEFA Nations League', short: 'Nations League', logo: 2395 },
  { id: 'uefa.europa', name: 'UEFA Europa League', short: 'Europa League', logo: 2310 },
  { id: 'uefa.europa.conf', name: 'UEFA Conference League', short: 'Conference League', logo: 20296 },
  { id: 'eng.1', name: 'English Premier League', short: 'Premier League', logo: 23 },
  { id: 'esp.1', name: 'LaLiga', short: 'LaLiga', logo: 15 },
  { id: 'ita.1', name: 'Serie A', short: 'Serie A', logo: 12 },
  { id: 'fra.1', name: 'Ligue 1', short: 'Ligue 1', logo: 9 },
  { id: 'usa.1', name: 'Major League Soccer', short: 'MLS', logo: 19 },
  { id: 'ksa.1', name: 'Saudi Pro League', short: 'Saudi Pro League', logo: 2488 },
  { id: 'ger.1', name: 'Bundesliga', short: 'Bundesliga', logo: 10 },
  { id: 'ned.1', name: 'Eredivisie', short: 'Eredivisie', logo: 11 },
];
const leagueLogo = (l) => `https://a.espncdn.com/i/leaguelogos/soccer/500/${l.logo}.png`;

// Browsers can read ESPN's site.web.api host cross-origin; site.api.espn.com
// fails in the browser even though it sends CORS headers, so it's only a fallback.
// On localhost, server.js also offers a same-origin proxy.
const API_BASES = ['https://site.web.api.espn.com', 'https://site.api.espn.com'];
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) API_BASES.push('/espn');
const REFRESH_MS = 30_000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  view: 'matches',
  league: 'all',
  date: todayISO(),
  range: 'day',
  status: 'all',
  season: '',
  openEvent: null, // { league, id }
  lastEvents: [],
};
let baseIdx = 0;
const cache = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localDayKey = (dateStr) => isoOf(new Date(dateStr));
const fmtTime = (dateStr) => new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) =>
  parseISO(iso).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateTime = (dateStr) =>
  new Date(dateStr).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const leagueById = (id) => LEAGUES.find((l) => l.id === id);

async function api(path, { fresh = false } = {}) {
  if (!fresh && cache.has(path)) return cache.get(path);
  const p = (async () => {
    let lastErr;
    for (let i = baseIdx; i < API_BASES.length; i++) {
      let res;
      try {
        res = await fetch(API_BASES[i] + path);
      } catch (e) {
        lastErr = e; // network / CORS failure -> try next base
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      baseIdx = i;
      return res.json();
    }
    throw lastErr || new Error('Network error');
  })();
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}

function setUpdated() {
  $('#updated').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function selectedLeagues() {
  return state.league === 'all' ? LEAGUES : LEAGUES.filter((l) => l.id === state.league);
}

function logoImg(src, alt = '') {
  return src
    ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" onerror="this.style.visibility='hidden'">`
    : '<span class="logo-gap" aria-hidden="true"></span>';
}
const teamLogo = (team) => team?.logo || team?.logos?.[0]?.href || '';

// ---------------------------------------------------------------------------
// League chips
// ---------------------------------------------------------------------------
function renderLeagueChips() {
  const chips = [`<button class="chip ${state.league === 'all' ? 'active' : ''}" data-league="all">🌍 All competitions</button>`];
  for (const l of LEAGUES) {
    chips.push(
      `<button class="chip ${state.league === l.id ? 'active' : ''}" data-league="${l.id}">${logoImg(leagueLogo(l))}${esc(l.short)}</button>`
    );
  }
  $('#leagues').innerHTML = chips.join('');
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------
function dateWindow() {
  const start = parseISO(state.date);
  const days = state.range === 'week' ? 7 : 1;
  const wanted = new Set();
  for (let i = 0; i < days; i++) wanted.add(isoOf(addDays(start, i)));
  // Pad a day each side: ESPN buckets by US time, we filter by the viewer's local day.
  // ESPN rejects date ranges (HTTP 400), so request each day separately.
  const fetchDays = [];
  for (let i = -1; i <= days; i++) fetchDays.push(ymd(addDays(start, i)));
  return { fetchDays, wanted };
}

async function loadMatches({ fresh = false } = {}) {
  const box = $('#matches');
  if (!fresh) box.innerHTML = '<div class="loading">Loading matches…</div>';
  const { fetchDays, wanted } = dateWindow();
  const leagues = selectedLeagues();

  const results = await Promise.all(
    leagues.map(async (l) => {
      const days = await Promise.allSettled(
        fetchDays.map((d) => api(`/apis/site/v2/sports/soccer/${l.id}/scoreboard?dates=${d}`, { fresh }))
      );
      const ok = days.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      if (!ok.length) return { league: l, error: days[0].reason };
      // Merge the per-day responses, dropping events that appear on two days.
      const byId = new Map();
      for (const d of ok) for (const e of d.events || []) byId.set(e.id, e);
      return { league: l, data: { leagues: ok[0].leagues, events: [...byId.values()] } };
    })
  );

  const allEvents = [];
  const blocks = [];
  const failed = [];
  const emptyLeagues = [];

  for (const { league, data, error } of results) {
    if (error) {
      failed.push(league);
      continue;
    }
    const apiLogo = data.leagues?.[0]?.logos?.[0]?.href;
    let events = (data.events || []).filter((e) => wanted.has(localDayKey(e.date)));
    events.forEach((e) => allEvents.push(e));
    if (state.status !== 'all') events = events.filter((e) => e.status?.type?.state === state.status);
    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!events.length) {
      emptyLeagues.push(league);
      continue;
    }
    blocks.push(renderLeagueMatches(league, apiLogo, events));
  }

  state.lastEvents = allEvents;
  const liveNow = allEvents.filter((e) => e.status?.type?.state === 'in').length;
  $('[data-view="matches"]').innerHTML = `Matches${liveNow ? ` <span class="live-badge">${liveNow} live</span>` : ''}`;
  renderSummaryStrip(allEvents);

  let html = '';
  if (failed.length === leagues.length) {
    const why = results.find((r) => r.error)?.error?.message || 'unknown error';
    html = `<div class="error">Couldn't load match data (${esc(why)}). Check your internet connection and try ⟳ Refresh.</div>`;
  } else {
    html = blocks.join('');
    if (!blocks.length) {
      const what = state.status === 'all' ? 'matches' : { in: 'live matches', pre: 'upcoming matches', post: 'finished matches' }[state.status];
      html = `<div class="empty">No ${what} ${state.range === 'week' ? 'this week' : 'on ' + esc(fmtDay(state.date))} for the selected competition${
        leagues.length > 1 ? 's' : ''
      }.<br><span class="small">Try another date, or switch to Week view.</span></div>`;
    } else if (emptyLeagues.length && leagues.length > 1) {
      html += `<p class="muted small">No ${state.status === 'all' ? '' : 'matching '}fixtures in: ${emptyLeagues.map((l) => esc(l.short)).join(', ')}.</p>`;
    }
    if (failed.length) html += `<p class="error small">Failed to load: ${failed.map((l) => esc(l.short)).join(', ')}.</p>`;
  }
  box.innerHTML = html;
  setUpdated();
}

function renderSummaryStrip(events) {
  const live = events.filter((e) => e.status?.type?.state === 'in').length;
  const post = events.filter((e) => e.status?.type?.state === 'post').length;
  const pre = events.filter((e) => e.status?.type?.state === 'pre').length;
  let goals = 0;
  for (const e of events) {
    if (e.status?.type?.state === 'pre') continue;
    for (const c of e.competitions?.[0]?.competitors || []) goals += Number(c.score) || 0;
  }
  const tile = (v, l, cls = '') => `<div class="stat-tile ${cls}"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  $('#summary-strip').innerHTML =
    tile(events.length, 'Matches') + tile(live, 'Live now', live ? 'live' : '') + tile(pre, 'Upcoming') + tile(post, 'Finished') + tile(goals, 'Goals scored');
}

function renderLeagueMatches(league, apiLogo, events) {
  let rows = '';
  let lastDay = null;
  for (const e of events) {
    const day = localDayKey(e.date);
    if (state.range === 'week' && day !== lastDay) {
      rows += `<div class="day-label">${esc(fmtDay(day))}</div>`;
      lastDay = day;
    }
    rows += renderMatchRow(league, e);
  }
  return `<div class="league-block">
    <div class="league-head">${logoImg(apiLogo || leagueLogo(league))}<h2>${esc(league.name)}</h2>
      <span class="count muted small">${events.length} match${events.length === 1 ? '' : 'es'}</span></div>
    ${rows}
  </div>`;
}

function statusLabel(e) {
  const t = e.status?.type || {};
  if (t.state === 'pre') {
    if (/POSTPONED|CANCELED|SUSPENDED|DELAYED/.test(t.name || '')) return { text: t.shortDetail || t.description, cls: '' };
    return { text: fmtTime(e.date), cls: '' };
  }
  if (t.state === 'in') return { text: t.shortDetail || e.status.displayClock || 'Live', cls: 'live' };
  return { text: t.shortDetail || 'FT', cls: '' };
}

function renderMatchRow(league, e) {
  const comp = e.competitions?.[0] || {};
  const home = comp.competitors?.find((c) => c.homeAway === 'home') || comp.competitors?.[0] || {};
  const away = comp.competitors?.find((c) => c.homeAway === 'away') || comp.competitors?.[1] || {};
  const st = statusLabel(e);
  const state_ = e.status?.type?.state;
  let score;
  if (state_ === 'pre') {
    score = `<div class="score pre">vs</div>`;
  } else {
    const pens =
      home.shootoutScore != null && away.shootoutScore != null ? `<span class="pens">(${home.shootoutScore}–${away.shootoutScore} pens)</span>` : '';
    score = `<div class="score">${esc(home.score ?? '-')} – ${esc(away.score ?? '-')}${pens}</div>`;
  }
  const notes = [comp.notes?.[0]?.headline || comp.altGameNote, comp.venue?.fullName].filter(Boolean).map(esc).join(' · ');
  const team = (c, side) =>
    `<div class="team ${side} ${c.winner ? 'winner' : ''}">${side === 'away' ? logoImg(teamLogo(c.team)) : ''}<span class="name" title="${esc(
      c.team?.displayName
    )}">${esc(c.team?.displayName || c.team?.shortDisplayName || 'TBD')}</span>${side === 'home' ? logoImg(teamLogo(c.team)) : ''}</div>`;

  return `<div class="match" data-league="${league.id}" data-event="${esc(e.id)}">
    <div class="m-status ${st.cls}">${esc(st.text)}</div>
    ${team(home, 'home')}
    ${score}
    ${team(away, 'away')}
    <div class="chev">›</div>
    ${notes ? `<div class="m-meta">${notes}</div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------------
// Match detail modal
// ---------------------------------------------------------------------------
async function openMatch(leagueId, eventId, { fresh = false } = {}) {
  state.openEvent = { league: leagueId, id: eventId };
  const modal = $('#match-modal');
  const body = $('#modal-body');
  if (!modal.open) {
    body.innerHTML = '<div class="loading">Loading match details…</div>';
    modal.showModal();
  }
  try {
    const s = await api(`/apis/site/v2/sports/soccer/${leagueId}/summary?event=${eventId}`, { fresh });
    if (state.openEvent?.id !== eventId) return;
    body.innerHTML = renderMatchDetail(leagueById(leagueId), s);
  } catch (err) {
    body.innerHTML = `<div class="error">Couldn't load match details (${esc(err.message)}).</div>`;
  }
}

// Where to watch in India. Based on news reports of 2026-27 deals (verify before kick-off):
// Premier League and Ligue 1: JioHotstar / Star Sports; Serie A and Bundesliga: ZEE5 / Unite8;
// Champions League: SonyLIV (Sony deal runs to the end of 2026-27).
// Other competitions: no reliable report found, so they're shown as not confirmed.
const OTT = {
  jiohotstar: { name: 'JioHotstar', url: 'https://www.hotstar.com' },
  sonyliv: { name: 'SonyLIV', url: 'https://www.sonyliv.com' },
  zee5: { name: 'ZEE5', url: 'https://www.zee5.com' },
  fancode: { name: 'FanCode', url: 'https://www.fancode.com' },
};
const INDIA_WATCH = {
  'uefa.champions': { status: 'Reported', platforms: [OTT.sonyliv], note: 'Also on Sony Sports Network TV channels.' },
  'eng.1': { status: 'Reported', platforms: [OTT.jiohotstar], note: 'All 380 matches, also on Star Sports TV.' },
  'fra.1': { status: 'Reported', platforms: [OTT.jiohotstar], note: 'At least four matches each matchday, also on Star Sports for selected games.' },
  'ita.1': { status: 'Reported', platforms: [OTT.zee5], note: 'Also on Unite8 Sports TV channels.' },
  'ger.1': { status: 'Reported', platforms: [OTT.zee5], note: 'Five-year deal from 2026-27, also on Unite8 Sports TV channels.' },
  'esp.1': { status: 'Not confirmed', platforms: [], note: 'The previous rights holder ended its deal. FanCode has been reported as the next holder, but this is not confirmed.' },
};
const INDIA_UNKNOWN = { status: 'Not confirmed', platforms: [], note: '' };

function renderWhereToWatch(league, comp) {
  const india = INDIA_WATCH[league?.id] || INDIA_UNKNOWN;
  const listing = [...new Set((comp.broadcasts || []).flatMap((b) => b.names || [b.media?.shortName || b.media?.name]).filter(Boolean))];
  const apps = india.platforms.length
    ? india.platforms.map((p) => `<a class="ott" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>`).join('')
    : '<span class="muted">No confirmed platform yet. Check the league\'s official app or a sports listing site.</span>';
  return `<div class="section"><h3>Where to watch</h3>
    <div class="watch-row"><b>India</b><div><span class="badge">${esc(india.status)}</span><div class="ott-list">${apps}</div>${
      india.note ? `<p class="muted small">${esc(india.note)}</p>` : ''
    }</div></div>
    <div class="watch-row"><b>Listing (ESPN)</b><div>${listing.length ? esc(listing.join(', ')) : '<span class="muted">Not listed</span>'}</div></div>
    <p class="muted small">Broadcast rights change between seasons, so check the app before kick-off.</p>
  </div>`;
}

function renderMatchDetail(league, s) {
  const comp = s.header?.competitions?.[0] || {};
  const home = comp.competitors?.find((c) => c.homeAway === 'home') || {};
  const away = comp.competitors?.find((c) => c.homeAway === 'away') || {};
  const t = comp.status?.type || {};
  const isPre = t.state === 'pre';
  const homeId = home.team?.id ?? home.id;

  const team = (c) => `<div class="mh-team">${logoImg(teamLogo(c.team) || c.team?.logos?.[0]?.href)}<div class="name">${esc(
    c.team?.displayName
  )}</div>${c.record?.[0]?.summary ? `<div class="muted small">${esc(c.record[0].summary)}</div>` : ''}</div>`;
  const pens = home.shootoutScore != null ? `<div class="muted small">Pens ${esc(home.shootoutScore)}–${esc(away.shootoutScore)}</div>` : '';
  let html = `<div class="mh-score">
      ${team(home)}
      <div><div class="big">${isPre ? 'vs' : `${esc(home.score ?? 0)} – ${esc(away.score ?? 0)}`}</div>${pens}
        <div class="${t.state === 'in' ? 'm-status live' : 'muted'}">${esc(isPre ? fmtDateTime(comp.date) : t.detail || t.shortDetail || '')}</div></div>
      ${team(away)}
    </div>
    <div class="mh-sub">${esc(league?.name || s.header?.league?.name || '')}${
    s.header?.season?.name ? ' · ' + esc(s.header.season.name) : ''
  }${comp.notes?.[0]?.headline ? ' · ' + esc(comp.notes[0].headline) : ''}</div>`;

  // Timeline (goals, cards, subs)
  // Keep goals, cards and substitutions; ESPN also lists kick-off, delays, etc.
  const events = (s.keyEvents || []).filter(
    (k) => k.team && k.clock?.displayValue && (k.scoringPlay || /goal|card|substitution|penalty/i.test(`${k.type?.type} ${k.type?.text}`))
  );
  if (events.length) {
    const icon = (k) => {
      const txt = `${k.type?.text || ''} ${k.type?.type || ''}`.toLowerCase();
      if (txt.includes('own goal')) return '⚽ (OG)';
      if (txt.includes('penalty') && txt.includes('miss')) return '❌ (pen)';
      if (txt.includes('goal') || k.scoringPlay) return txt.includes('penalty') ? '⚽ (pen)' : '⚽';
      if (txt.includes('red')) return '🟥';
      if (txt.includes('yellow')) return '🟨';
      if (txt.includes('substitution')) return '🔁';
      return '•';
    };
    const who = (k) => {
      const names = (k.participants || []).map((p) => p.athlete?.displayName).filter(Boolean);
      if ((k.type?.text || '').toLowerCase().includes('substitution') && names.length >= 2) return `${names[0]} ↔ ${names[1]}`;
      return names.join(', ') || k.shortText || k.type?.text || '';
    };
    html += `<div class="section"><h3>Match events</h3><ul class="timeline">${events
      .map((k) => {
        const isHome = String(k.team.id) === String(homeId);
        const cell = `${icon(k)} ${esc(who(k))}`;
        return `<li><div class="home-ev">${isHome ? cell : ''}</div><div class="min">${esc(k.clock.displayValue)}</div><div>${isHome ? '' : cell}</div></li>`;
      })
      .join('')}</ul></div>`;
  }

  // Team stats
  const bt = s.boxscore?.teams || [];
  const hStats = bt.find((x) => String(x.team?.id) === String(homeId)) || bt[0];
  const aStats = bt.find((x) => x !== hStats);
  if (hStats?.statistics?.length && aStats?.statistics?.length) {
    const rows = hStats.statistics
      .map((hs) => {
        const as = aStats.statistics.find((x) => x.name === hs.name);
        if (!as) return '';
        const hv = parseFloat(hs.displayValue) || 0;
        const av = parseFloat(as.displayValue) || 0;
        // ESPN sends most percentages as fractions (0.9) but possession as 62.
        const fmt = (st, v) =>
          /Pct$/.test(st.name) ? `${Math.round(v <= 1 && st.name !== 'possessionPct' ? v * 100 : v)}%` : st.displayValue;
        const total = hv + av || 1;
        const raw = hs.label || hs.name.replace(/([A-Z])/g, ' $1');
        const label = raw === raw.toUpperCase() ? raw.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : raw.replace(/^./, (c) => c.toUpperCase());
        return `<div class="stat-row"><div class="labels"><span>${esc(fmt(hs, hv))}</span><span>${esc(label)}</span><span>${esc(
          fmt(as, av)
        )}</span></div><div class="bars"><div class="h" style="flex:${hv / total}"></div><div class="a" style="flex:${av / total}"></div></div></div>`;
      })
      .join('');
    if (rows) html += `<div class="section"><h3>Team stats</h3>${rows}</div>`;
  }

  // Lineups
  const rosters = s.rosters || [];
  if (rosters.some((r) => r.roster?.length)) {
    const side = (r) => {
      if (!r) return '<div></div>';
      const list = (players) =>
        players
          .map(
            (p) =>
              `<li><span class="no">${esc(p.jersey ?? '')}</span><span>${esc(p.athlete?.displayName)}${p.subbedOut ? ' <span class="muted">↓</span>' : ''}${
                p.subbedIn ? ' <span class="muted">↑</span>' : ''
              }</span><span class="pos">${esc(p.position?.abbreviation ?? '')}</span></li>`
          )
          .join('');
      const starters = (r.roster || []).filter((p) => p.starter);
      const subs = (r.roster || []).filter((p) => !p.starter);
      return `<div><b>${esc(r.team?.displayName)}</b>${r.formation ? ` <span class="muted small">(${esc(r.formation)})</span>` : ''}
        <ul>${list(starters)}</ul>${subs.length ? `<p class="muted small" style="margin:8px 0 4px">Substitutes</p><ul>${list(subs)}</ul>` : ''}</div>`;
    };
    const rh = rosters.find((r) => r.homeAway === 'home') || rosters[0];
    const ra = rosters.find((r) => r !== rh);
    html += `<div class="section"><h3>Lineups</h3><div class="lineups">${side(rh)}${side(ra)}</div></div>`;
  }

  // Head to head
  // Head to head (from the perspective of the team ESPN lists first)
  const h2hGroup = (s.headToHeadGames || [])[0];
  const h2h = (h2hGroup?.events || []).slice(0, 5);
  if (h2h.length) {
    const me = h2hGroup.team?.displayName || '';
    html += `<div class="section"><h3>Recent head-to-head</h3><ul class="timeline">${h2h
      .map(
        (g) =>
          `<li style="grid-template-columns: 100px 1fr"><span class="muted small">${esc(
            g.gameDate ? new Date(g.gameDate).toLocaleDateString() : ''
          )}</span><span>${esc(me)} ${esc(g.atVs || 'vs')} ${esc(g.opponent?.displayName || '')} <b>${esc(g.score || '')}</b>${
            g.gameResult ? ` (${esc(g.gameResult)})` : ''
          } <span class="muted small">${esc(g.leagueName || '')}</span></span></li>`
      )
      .join('')}</ul></div>`;
  }

  html += renderWhereToWatch(league, comp);

  // Info
  const gi = s.gameInfo || {};
  const info = [
    ['Kick-off', comp.date ? fmtDateTime(comp.date) : ''],
    ['Venue', [gi.venue?.fullName, gi.venue?.address?.city, gi.venue?.address?.country].filter(Boolean).join(', ')],
    ['Attendance', gi.attendance ? Number(gi.attendance).toLocaleString() : ''],
    ['Referee', (gi.officials || []).map((o) => o.displayName || o.fullName).filter(Boolean).join(', ')],
  ].filter(([, v]) => v);
  if (info.length) {
    html += `<div class="section"><h3>Match info</h3><div class="info-grid">${info
      .map(([k, v]) => `<div><b>${esc(k)}</b>${esc(v)}</div>`)
      .join('')}</div></div>`;
  }

  if (isPre && !events.length && !rosters.length) {
    html += `<p class="muted small" style="text-align:center;margin-top:20px">Lineups, stats and live events appear here once the match starts.</p>`;
  }
  return html;
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------
function collectGroups(node, out = []) {
  if (node?.standings?.entries?.length) out.push({ name: node.name || node.abbreviation || '', entries: node.standings.entries });
  for (const c of node?.children || []) collectGroups(c, out);
  return out;
}

function stat(entry, ...names) {
  for (const n of names) {
    const s = (entry.stats || []).find((x) => x.name === n || x.type === n || x.abbreviation === n);
    if (s) return s;
  }
  return null;
}
const statVal = (entry, ...names) => {
  const s = stat(entry, ...names);
  return s ? s.displayValue ?? s.value : '–';
};
const statNum = (entry, ...names) => {
  const s = stat(entry, ...names);
  return s ? Number(s.value ?? s.displayValue) : NaN;
};

async function loadStandings({ fresh = false } = {}) {
  const box = $('#standings');
  if (!fresh) box.innerHTML = '<div class="loading">Loading tables…</div>';
  const leagues = selectedLeagues();
  const qs = state.season ? `?season=${state.season}` : '';
  const results = await Promise.all(
    leagues.map((l) =>
      api(`/apis/v2/sports/soccer/${l.id}/standings${qs}`, { fresh })
        .then((data) => ({ league: l, data }))
        .catch((error) => ({ league: l, error }))
    )
  );

  const legend = new Map();
  const html = results
    .map(({ league, data, error }) => {
      const head = `<div class="league-head">${logoImg(leagueLogo(league))}<h2>${esc(league.name)}</h2><span class="count muted small">${esc(
        data?.seasons?.find?.((s) => s.year == state.season)?.displayName || data?.children?.[0]?.standings?.seasonDisplayName || ''
      )}</span></div>`;
      if (error) return `<div class="league-block">${head}<div class="error" style="border:none">Couldn't load table.</div></div>`;
      const groups = collectGroups(data);
      if (!groups.length)
        return `<div class="league-block">${head}<div class="empty" style="border:none">No table available for this season yet.</div></div>`;
      return `<div class="league-block">${head}${groups
        .map((g) => (groups.length > 1 ? `<div class="group-title">${esc(g.name)}</div>` : '') + renderTable(g.entries, legend))
        .join('')}</div>`;
    })
    .join('');

  box.innerHTML = html;
  $('#standings-legend').innerHTML = [...legend.entries()]
    .map(([desc, color]) => `<span><i style="background:${esc(color)}"></i>${esc(desc)}</span>`)
    .join('');
  setUpdated();
}

function renderTable(entries, legend) {
  const sorted = [...entries].sort((a, b) => {
    const ra = statNum(a, 'rank') || a.note?.rank || 999;
    const rb = statNum(b, 'rank') || b.note?.rank || 999;
    if (ra !== rb) return ra - rb;
    return statNum(b, 'points', 'P') - statNum(a, 'points', 'P');
  });
  const rows = sorted
    .map((e, i) => {
      const rank = statNum(e, 'rank') || i + 1;
      const color = e.note?.color ? (e.note.color.startsWith('#') ? e.note.color : '#' + e.note.color) : '';
      if (color && e.note?.description) legend.set(e.note.description, color);
      const gd = statNum(e, 'pointDifferential', 'GD');
      const gdCls = gd > 0 ? 'gd-pos' : gd < 0 ? 'gd-neg' : '';
      return `<tr title="${esc(e.note?.description || '')}">
        <td class="pos">${color ? `<span class="bar" style="background:${esc(color)}"></span>` : ''}${rank}</td>
        <td class="team-cell"><div>${logoImg(teamLogo(e.team))}<span>${esc(e.team?.displayName || e.team?.name)}</span></div></td>
        <td>${esc(statVal(e, 'gamesPlayed', 'GP'))}</td>
        <td>${esc(statVal(e, 'wins', 'W'))}</td>
        <td>${esc(statVal(e, 'ties', 'D'))}</td>
        <td>${esc(statVal(e, 'losses', 'L'))}</td>
        <td>${esc(statVal(e, 'pointsFor', 'F'))}</td>
        <td>${esc(statVal(e, 'pointsAgainst', 'A'))}</td>
        <td class="${gdCls}">${esc(statVal(e, 'pointDifferential', 'GD'))}</td>
        <td class="pts">${esc(statVal(e, 'points', 'P'))}</td>
      </tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table class="standings">
    <thead><tr><th>#</th><th style="text-align:left">Team</th><th title="Played">P</th><th title="Won">W</th><th title="Drawn">D</th><th title="Lost">L</th>
    <th title="Goals for">GF</th><th title="Goals against">GA</th><th title="Goal difference">GD</th><th title="Points">Pts</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function populateSeasons() {
  const now = new Date();
  // European seasons start in summer; ESPN labels a season by its starting year.
  const current = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const opts = ['<option value="">Current season</option>'];
  for (let y = current; y >= current - 6; y--) opts.push(`<option value="${y}">${y}/${String(y + 1).slice(2)} (MLS ${y})</option>`);
  document.querySelectorAll('.season-select').forEach((sel) => (sel.innerHTML = opts.join('')));
}

// ---------------------------------------------------------------------------
// Top scorers / assists
// ---------------------------------------------------------------------------
// ESPN's league "statistics" feed returns leader categories, e.g.
// { stats: [{ name: 'goalsLeaders', leaders: [{ value, displayValue: 'Matches: 8, Goals: 10', athlete }] }] }
function leaderCategories(data) {
  const cats = data?.stats || data?.leaders || data?.categories || [];
  return Array.isArray(cats) ? cats : [];
}

function findCategory(cats, re) {
  return cats.find((c) => re.test(`${c.name || ''} ${c.displayName || ''} ${c.abbreviation || ''}`));
}

// Pull "Matches: 8, Goals: 10" style pairs out of a leader's displayValue.
function leaderFields(leader) {
  const out = {};
  for (const m of String(leader.displayValue || '').matchAll(/([A-Za-z ]+):\s*([\d.]+)/g)) out[m[1].trim().toLowerCase()] = m[2];
  return out;
}

async function loadScorerData(league, fresh) {
  const qs = state.season ? `?season=${state.season}` : '';
  try {
    const data = await api(`/apis/site/v2/sports/soccer/${league.id}/statistics${qs}`, { fresh });
    if (leaderCategories(data).length) return data;
  } catch {}
  return api(`/apis/site/v2/sports/soccer/${league.id}/leaders${qs}`, { fresh });
}

async function loadScorers({ fresh = false } = {}) {
  const box = $('#scorers');
  if (!fresh) box.innerHTML = '<div class="loading">Loading top scorers…</div>';
  const leagues = selectedLeagues();
  const results = await Promise.all(
    leagues.map((l) =>
      loadScorerData(l, fresh)
        .then((data) => ({ league: l, data }))
        .catch((error) => ({ league: l, error }))
    )
  );

  box.innerHTML = results
    .map(({ league, data, error }) => {
      const head = `<div class="league-head">${logoImg(leagueLogo(league))}<h2>${esc(league.name)}</h2></div>`;
      const cats = error ? [] : leaderCategories(data);
      const goals = findCategory(cats, /goal/i);
      const assists = findCategory(cats, /assist/i);
      if (!goals?.leaders?.length && !assists?.leaders?.length) {
        return `<div class="league-block">${head}<div class="empty" style="border:none">${
          error ? "Couldn't load scorers." : 'No scorer data available for this season yet.'
        }</div></div>`;
      }
      return `<div class="league-block">${head}<div class="leaders-grid">
        ${goals?.leaders?.length ? renderLeaders('Top scorers', goals.leaders, 'goals', 'Goals') : ''}
        ${assists?.leaders?.length ? renderLeaders('Top assists', assists.leaders, 'assists', 'Assists') : ''}
      </div></div>`;
    })
    .join('');
  setUpdated();
}

function renderLeaders(title, leaders, key, label) {
  let prevVal = null;
  let rank = 0;
  const rows = leaders
    .slice(0, 20)
    .map((ld, i) => {
      const f = leaderFields(ld);
      const val = ld.value ?? f[key] ?? '';
      if (String(val) !== String(prevVal)) rank = i + 1;
      prevVal = val;
      const a = ld.athlete || {};
      const team = a.team || ld.team || {};
      const photo = a.headshot?.href || a.headshot || '';
      return `<tr>
        <td class="pos">${rank}</td>
        <td class="team-cell"><div>${photo ? logoImg(photo) : logoImg(teamLogo(team))}<span><b>${esc(a.displayName || a.fullName || '')}</b>${
        team.displayName || team.name ? `<br><span class="muted small">${esc(team.displayName || team.name)}</span>` : ''
      }</span></div></td>
        <td>${esc(f.matches ?? f.appearances ?? '–')}</td>
        <td class="pts">${esc(Number.isFinite(Number(val)) ? Math.round(Number(val)) : val)}</td>
      </tr>`;
    })
    .join('');
  return `<div><div class="group-title">${esc(title)}</div><div class="table-wrap"><table class="standings">
    <thead><tr><th>#</th><th style="text-align:left">Player</th><th title="Matches played">MP</th><th>${esc(label)}</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------
async function loadNews({ fresh = false } = {}) {
  const box = $('#news');
  if (!fresh) box.innerHTML = '<div class="loading">Loading news…</div>';
  const leagues = selectedLeagues();
  const results = await Promise.all(
    leagues.map((l) =>
      api(`/apis/site/v2/sports/soccer/${l.id}/news?limit=15`, { fresh })
        .then((d) => (d.articles || []).map((a) => ({ ...a, _league: l })))
        .catch(() => [])
    )
  );
  const seen = new Set();
  const articles = results
    .flat()
    .filter((a) => a.headline && !seen.has(a.headline) && seen.add(a.headline))
    .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0))
    .slice(0, 60);

  if (!articles.length) {
    box.innerHTML = '<div class="empty">No news available right now.</div>';
    return;
  }
  box.innerHTML = articles
    .map((a) => {
      const href = a.links?.web?.href || '#';
      const img = a.images?.[0]?.url;
      return `<a class="news-card" href="${esc(href)}" target="_blank" rel="noopener">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        <div class="body"><h3>${esc(a.headline)}</h3>${a.description ? `<p>${esc(a.description)}</p>` : ''}
        <span class="tag">${esc(a._league.short)}</span>
        <span class="muted small">${a.published ? esc(new Date(a.published).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : ''}</span></div>
      </a>`;
    })
    .join('');
  setUpdated();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
// Keep the current view in the URL hash so it survives reloads and can be shared,
// e.g. #view=standings&league=eng.1
const HASH_KEYS = { view: 'matches', league: 'all', date: '', range: 'day', status: 'all', season: '' };

function saveHash() {
  const p = new URLSearchParams();
  for (const [k, def] of Object.entries(HASH_KEYS)) {
    const v = k === 'date' && state.date === todayISO() ? '' : state[k];
    if (v && v !== def) p.set(k, v);
  }
  const hash = p.toString();
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const views = ['matches', 'standings', 'scorers', 'news'];
  if (views.includes(p.get('view'))) state.view = p.get('view');
  if (p.get('league') === 'all' || leagueById(p.get('league'))) state.league = p.get('league');
  if (/^\d{4}-\d{2}-\d{2}$/.test(p.get('date') || '')) state.date = p.get('date');
  if (['day', 'week'].includes(p.get('range'))) state.range = p.get('range');
  if (['all', 'in', 'pre', 'post'].includes(p.get('status'))) state.status = p.get('status');
  if (/^\d{4}$/.test(p.get('season') || '')) state.season = p.get('season');
}

function showView(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
}

function loadCurrent(opts) {
  saveHash();
  if (state.view === 'matches') return loadMatches(opts);
  if (state.view === 'standings') return loadStandings(opts);
  if (state.view === 'scorers') return loadScorers(opts);
  return loadNews(opts);
}

function setActive(container, attr, value) {
  container.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset[attr] === value));
}

function init() {
  try {
    const t = localStorage.getItem('theme');
    if (t) document.documentElement.dataset.theme = t;
  } catch {}

  readHash();
  $('#date').value = state.date;
  populateSeasons();
  document.querySelectorAll('.season-select').forEach((s) => (s.value = state.season));
  setActive($('#range'), 'range', state.range);
  setActive($('#status-filter'), 'status', state.status);
  showView(state.view);
  renderLeagueChips();

  $('#leagues').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-league]');
    if (!b) return;
    state.league = b.dataset.league;
    renderLeagueChips();
    loadCurrent();
  });

  document.querySelectorAll('.tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      showView(tab.dataset.view);
      loadCurrent();
    })
  );

  const setDate = (iso) => {
    state.date = iso;
    $('#date').value = iso;
    loadCurrent();
  };
  $('#date').addEventListener('change', (e) => e.target.value && setDate(e.target.value));
  $('#prev-day').addEventListener('click', () => setDate(isoOf(addDays(parseISO(state.date), state.range === 'week' ? -7 : -1))));
  $('#next-day').addEventListener('click', () => setDate(isoOf(addDays(parseISO(state.date), state.range === 'week' ? 7 : 1))));
  $('#today').addEventListener('click', () => setDate(todayISO()));

  $('#range').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.range = b.dataset.range;
    setActive($('#range'), 'range', state.range);
    loadCurrent();
  });
  $('#status-filter').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.status = b.dataset.status;
    setActive($('#status-filter'), 'status', state.status);
    loadCurrent();
  });

  // Tables and Top Scorers share one season choice.
  document.querySelectorAll('.season-select').forEach((sel) =>
    sel.addEventListener('change', (e) => {
      state.season = e.target.value;
      document.querySelectorAll('.season-select').forEach((s) => (s.value = state.season));
      loadCurrent();
    })
  );

  $('#matches').addEventListener('click', (e) => {
    const row = e.target.closest('.match');
    if (row) openMatch(row.dataset.league, row.dataset.event);
  });
  const modal = $('#match-modal');
  $('#modal-close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => e.target === modal && modal.close());
  modal.addEventListener('close', () => (state.openEvent = null));

  $('#refresh').addEventListener('click', () => {
    cache.clear();
    loadCurrent({ fresh: true });
  });
  $('#theme').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try {
      localStorage.setItem('theme', root.dataset.theme);
    } catch {}
  });

  // Auto-refresh live data
  setInterval(() => {
    if (document.hidden) return;
    const anyLive = state.lastEvents.some((e) => e.status?.type?.state === 'in');
    if (state.view === 'matches' && anyLive) loadMatches({ fresh: true });
    if (state.openEvent) {
      const ev = state.lastEvents.find((e) => e.id === state.openEvent.id);
      if (ev?.status?.type?.state === 'in') openMatch(state.openEvent.league, state.openEvent.id, { fresh: true });
    }
  }, REFRESH_MS);

  loadCurrent();
}

init();
