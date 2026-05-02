// Sanctions and PEP (Politically Exposed Person) checks.
//
// Two free sources combined:
//
//   1. OpenSanctions API — fuzzy name matcher across 200+ international
//      sanctions/PEP/watchlists. Free tier doesn't require a key for low
//      usage. Endpoint: https://api.opensanctions.org/match/default
//
//   2. HM Treasury OFSI Consolidated List — official UK government CSV
//      of designated persons under UK financial sanctions.
//
// Returns a structured response with separate fields per source so the UI
// can show distinct pills (e.g. "Cleared by OpenSanctions / Cleared by OFSI").

const OPEN_SANCTIONS = 'https://api.opensanctions.org/match/default';
const OFSI_CSV =
  'https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv';

// Cache the OFSI list in memory after first fetch — it's ~6MB and updates
// daily. Refresh every hour.
let ofsiCache = null;
let ofsiCacheTime = 0;
const OFSI_TTL_MS = 60 * 60 * 1000;

export async function checkSanctions(name, { schema = 'Company' } = {}) {
  if (!name || !String(name).trim()) {
    return { name, openSanctions: null, ofsi: null };
  }

  const [openSanctionsResult, ofsiResult] = await Promise.allSettled([
    queryOpenSanctions(name, schema),
    queryOfsi(name),
  ]);

  return {
    name,
    schema,
    openSanctions:
      openSanctionsResult.status === 'fulfilled'
        ? openSanctionsResult.value
        : { error: openSanctionsResult.reason?.message || 'unknown' },
    ofsi:
      ofsiResult.status === 'fulfilled'
        ? ofsiResult.value
        : { error: ofsiResult.reason?.message || 'unknown' },
  };
}

async function queryOpenSanctions(name, schema) {
  const body = {
    queries: {
      q: {
        schema,
        properties: { name: [String(name)] },
      },
    },
  };

  const res = await fetch(OPEN_SANCTIONS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'PropertyIQ/0.1',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`OpenSanctions returned ${res.status}`);
  }
  const responseBody = await res.json();
  const queryResult = responseBody?.responses?.q || {};
  const matches = queryResult.results || [];

  // Filter to high-confidence matches — OpenSanctions returns scores 0-1.
  // 0.7+ indicates a likely match worth flagging.
  const highConfidence = matches.filter((m) => (m.score || 0) >= 0.7);

  return {
    queryName: name,
    matchesTotal: matches.length,
    highConfidenceMatches: highConfidence.length,
    matches: matches.slice(0, 10).map((m) => ({
      score: m.score,
      caption: m.caption || m.properties?.name?.[0] || null,
      schema: m.schema,
      datasets: m.datasets || [],
      countries: m.properties?.country || [],
      topics: m.properties?.topics || [],
      sanctioned: (m.properties?.topics || []).some((t) =>
        /sanction/i.test(t),
      ),
      pep: (m.properties?.topics || []).some((t) => /role.pep|pep/i.test(t)),
      url: `https://www.opensanctions.org/entities/${m.id}/`,
    })),
    // Quick verdict for the UI pill
    verdict:
      highConfidence.length === 0
        ? 'No matches'
        : highConfidence.some((m) =>
            (m.properties?.topics || []).some((t) => /sanction/i.test(t)),
          )
        ? 'Possible sanctions match'
        : 'Possible PEP / watchlist match',
    source: 'OpenSanctions — 200+ international sanctions, PEP and watchlists',
  };
}

async function queryOfsi(name) {
  const list = await loadOfsi();
  const needle = normalise(name);
  if (!needle) return { queryName: name, matches: [], verdict: 'No matches', source: 'HM Treasury OFSI' };

  const needleTokens = tokenise(needle);
  // Single-word queries (e.g. "BARRATT") would match every sanctioned
  // entity that happens to contain that token — a flood of false positives.
  // Require at least 2 significant tokens for any fuzzy matching.
  if (needleTokens.length < 2) {
    return strictMatchOnly(list, needle, name);
  }

  const matches = list.filter((row) =>
    row._allNames.some((n) => isMatch(needle, needleTokens, n)),
  );

  return {
    queryName: name,
    matches: matches.slice(0, 5).map((m) => ({
      groupId: m.groupId,
      regime: m.regime,
      designation: m.designation,
      lastUpdated: m.lastUpdated,
      names: m._allNames.filter(Boolean),
    })),
    matchesTotal: matches.length,
    verdict: matches.length === 0 ? 'No matches' : 'Possible UK sanctions match',
    source: `HM Treasury OFSI Consolidated List (${list.length} entries)`,
    listUpdated: ofsiCacheTime ? new Date(ofsiCacheTime).toISOString() : null,
  };
}

function strictMatchOnly(list, needle, originalName) {
  // Only exact (post-normalisation) match — used for single-token queries.
  const matches = list.filter((row) =>
    row._allNames.some((n) => normalise(n) === needle),
  );
  return {
    queryName: originalName,
    matches: matches.slice(0, 5).map((m) => ({
      groupId: m.groupId,
      regime: m.regime,
      designation: m.designation,
      lastUpdated: m.lastUpdated,
      names: m._allNames.filter(Boolean),
    })),
    matchesTotal: matches.length,
    verdict: matches.length === 0 ? 'No matches' : 'Possible UK sanctions match (exact name)',
    source: `HM Treasury OFSI Consolidated List (${list.length} entries) — strict exact-match`,
    listUpdated: ofsiCacheTime ? new Date(ofsiCacheTime).toISOString() : null,
  };
}

// Match logic:
//   1. Exact match after normalisation → match.
//   2. Otherwise: every needle token must be present as a whole word in
//      the haystack, AND the haystack must not have too many extra
//      significant tokens beyond the needle (suggests it's a different
//      entity that just happens to share some words).
function isMatch(needle, needleTokens, haystackName) {
  if (!haystackName) return false;
  const haystack = normalise(haystackName);
  if (haystack === needle) return true;
  // Don't match if either side is significantly longer than the other —
  // "Barratt Developments Limited" (3 tokens) vs a sanctioned
  // "Barratt Africa Conservation Initiative" (4 tokens) is NOT a match.
  const haystackTokens = tokenise(haystack);
  if (needleTokens.length === 0 || haystackTokens.length === 0) return false;

  // Every needle token must appear as a whole word in haystack
  const allTokensPresent = needleTokens.every((t) => haystackTokens.includes(t));
  if (!allTokensPresent) return false;

  // Reject if haystack has many extra significant tokens
  const extras = haystackTokens.filter((t) => !needleTokens.includes(t)).length;
  return extras <= 1;
}

function tokenise(s) {
  return String(s)
    .split(/\s+/)
    .filter((t) => t.length >= 3); // Drop trivial tokens like "OF", "THE"
}

async function loadOfsi() {
  if (ofsiCache && Date.now() - ofsiCacheTime < OFSI_TTL_MS) {
    return ofsiCache;
  }
  try {
    const res = await fetch(OFSI_CSV, { headers: { 'User-Agent': 'PropertyIQ/0.1' } });
    if (!res.ok) throw new Error(`OFSI CSV returned ${res.status}`);
    const text = await res.text();
    ofsiCache = parseOfsiCsv(text);
    ofsiCacheTime = Date.now();
    return ofsiCache;
  } catch (err) {
    // If we can't reach OFSI, keep returning the last known list rather
    // than silently failing.
    if (ofsiCache) return ofsiCache;
    throw err;
  }
}

function parseOfsiCsv(csv) {
  // Minimal CSV parser tolerant of quoted commas. The OFSI consolidated
  // list has many columns including: Name 1..6, Group ID, Regime,
  // Designation, etc.
  const lines = csv.split(/\r?\n/);
  // Find the header row — skip metadata rows that come first
  let headerIdx = -1;
  let headers = [];
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (/Name 1/i.test(lines[i]) && /Group/i.test(lines[i])) {
      headerIdx = i;
      headers = parseCsvLine(lines[i]);
      break;
    }
  }
  if (headerIdx === -1) return [];

  const out = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseCsvLine(lines[i]);
    const record = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = cells[j] || '';
    }
    const name1 = record['Name 1'] || record['Name1'];
    const name2 = record['Name 2'] || record['Name2'];
    const name3 = record['Name 3'] || record['Name3'];
    const name4 = record['Name 4'] || record['Name4'];
    const name5 = record['Name 5'] || record['Name5'];
    const name6 = record['Name 6'] || record['Name6'];
    const aliases = record['Alias'] || '';

    out.push({
      groupId: record['Group ID'] || record['GroupID'],
      regime: record['Regime'] || record['Regime Name'],
      designation: record['Designation'] || record['Date Designated'],
      lastUpdated: record['Last Updated'] || record['Listed On'],
      _allNames: [name1, name2, name3, name4, name5, name6, aliases].filter(Boolean),
    });
  }
  return out;
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function normalise(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/\b(LTD|LIMITED|PLC|LLP|INC|GMBH|SA|AG)\b\.?/g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
