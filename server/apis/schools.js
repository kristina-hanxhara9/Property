// Schools — combines OpenStreetMap (Overpass) for school locations with
// Ofsted's public reports search for live Ofsted ratings. Both free, no key.
//
// Step 1: Overpass returns school nodes/ways within radius (gives us name +
//   coordinates + tags).
// Step 2: We scrape reports.ofsted.gov.uk/search?location=POSTCODE for the
//   matching Ofsted reports — pulling the overall rating, inspection date,
//   and direct report URL for each school. Matched to the OSM list by
//   normalised name comparison.
//
// The Ofsted scrape is best-effort: if it fails or the markup changes, we
// still return the OSM-based list with `ofstedRating: null` so the user
// gets locations even if ratings drop out.

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const OFSTED_SEARCH = 'https://reports.ofsted.gov.uk/search';

export async function fetchNearbySchools({ postcode, latitude, longitude, radiusMeters = 1500 }) {
  if (latitude == null || longitude == null) {
    throw new Error('latitude and longitude required');
  }

  const overpassPromise = fetchSchoolsFromOsm({ latitude, longitude, radiusMeters });
  const ofstedPromise = postcode
    ? fetchOfstedReports({ postcode }).catch((err) => ({ error: err.message, reports: [] }))
    : Promise.resolve({ reports: [] });

  const [osmResult, ofstedResult] = await Promise.all([overpassPromise, ofstedPromise]);

  // Merge Ofsted ratings into the OSM list by name. Use a normalised match
  // so "Persimmon Primary School" lines up with "Persimmon Primary" etc.
  const reportsByName = new Map();
  for (const r of ofstedResult.reports || []) {
    if (r.name) reportsByName.set(normaliseName(r.name), r);
  }

  const merged = osmResult.schools.map((s) => {
    const key = normaliseName(s.name);
    if (!key) return s;
    let match = reportsByName.get(key);
    if (!match) {
      // Fallback: find any Ofsted report whose normalised name CONTAINS the OSM
      // key, or vice-versa (handles "St Mary's CofE" → "St Mary's").
      for (const [k, v] of reportsByName) {
        if (k.includes(key) || key.includes(k)) {
          match = v;
          break;
        }
      }
    }
    if (!match) return s;
    return {
      ...s,
      ofstedRating: match.rating || null,
      ofstedDate: match.inspectionDate || null,
      ofstedReportUrl: match.url || null,
      ofstedUrn: match.urn || null,
    };
  });

  // Add any Ofsted-listed schools that didn't match an OSM entry — they're
  // still real schools at this postcode and useful to show.
  const matchedKeys = new Set(merged.filter((s) => s.ofstedReportUrl).map((s) => normaliseName(s.name)));
  const orphanReports = (ofstedResult.reports || [])
    .filter((r) => !matchedKeys.has(normaliseName(r.name)))
    .map((r) => ({
      name: r.name,
      type: null,
      phase: r.phase || null,
      address: r.address || null,
      postcode: null,
      distanceMiles: null,
      distanceMeters: null,
      ofstedRating: r.rating,
      ofstedDate: r.inspectionDate,
      ofstedReportUrl: r.url,
      ofstedUrn: r.urn,
      ageRange: null,
      capacity: null,
      pupils: null,
      gender: null,
      religiousCharacter: null,
      latitude: null,
      longitude: null,
      sourceOnly: 'ofsted',
    }));

  const all = [...merged, ...orphanReports]
    .filter((s) => s.name)
    .sort((a, b) => {
      // Rated schools first (any rating > no rating), then by distance.
      const ar = a.ofstedRating ? 0 : 1;
      const br = b.ofstedRating ? 0 : 1;
      if (ar !== br) return ar - br;
      return (a.distanceMiles ?? 99) - (b.distanceMiles ?? 99);
    });

  return {
    count: all.length,
    schools: all.slice(0, 15),
    ofstedSearchUrl: postcode
      ? `${OFSTED_SEARCH}?Location=${encodeURIComponent(postcode)}&radius=2&Type=schools`
      : OFSTED_SEARCH,
    ratedCount: all.filter((s) => s.ofstedRating).length,
    note: ofstedResult.error
      ? `Ofsted live lookup failed (${ofstedResult.error}); locations from OpenStreetMap only.`
      : 'Locations from OpenStreetMap; Ofsted ratings + report links live from reports.ofsted.gov.uk.',
    source: 'OpenStreetMap (Overpass API) + Ofsted Reports (live)',
  };
}

async function fetchSchoolsFromOsm({ latitude, longitude, radiusMeters }) {
  const query = `
    [out:json][timeout:20];
    (
      node["amenity"="school"](around:${radiusMeters},${latitude},${longitude});
      way["amenity"="school"](around:${radiusMeters},${latitude},${longitude});
      node["amenity"="college"](around:${radiusMeters},${latitude},${longitude});
      way["amenity"="college"](around:${radiusMeters},${latitude},${longitude});
      node["amenity"="kindergarten"](around:${radiusMeters},${latitude},${longitude});
      way["amenity"="kindergarten"](around:${radiusMeters},${latitude},${longitude});
    );
    out center body;
  `;

  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'PropertyIQ/0.1',
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass schools query returned ${res.status}`);
  }
  const body = await res.json();
  const elements = body?.elements || [];

  const schools = elements
    .map((el) => normaliseSchool(el, latitude, longitude))
    .filter((s) => s.name)
    .sort((a, b) => (a.distanceMiles || 99) - (b.distanceMiles || 99));

  return { schools };
}

// Live Ofsted lookup. The public reports search returns HTML cards we parse
// with regex (no DOM lib needed). Each card contains the school name, the
// overall effectiveness rating, the inspection date and a link to the
// detailed report PDF.
async function fetchOfstedReports({ postcode }) {
  const url = new URL(OFSTED_SEARCH);
  url.searchParams.set('Location', postcode);
  url.searchParams.set('radius', '2');
  url.searchParams.set('Type', 'schools');

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'PropertyIQ/0.1 (+https://github.com/propertyiq)',
    },
  });
  if (!res.ok) {
    throw new Error(`Ofsted reports returned ${res.status}`);
  }
  const html = await res.text();

  const reports = [];

  // Each result is wrapped in a card element. The exact class names change
  // periodically, so we look for the school detail-page link pattern then
  // extract the surrounding context.
  // URL pattern: /provider/<urn>/<rest>
  const linkRegex = /<a[^>]*href="(\/provider\/(\d+)[^"]*)"[^>]*>([\s\S]{0,400}?)<\/a>/g;
  let match;
  const seen = new Set();
  while ((match = linkRegex.exec(html)) !== null) {
    const path = match[1];
    const urn = match[2];
    if (seen.has(urn)) continue;
    seen.add(urn);
    const inner = stripHtml(match[3]);
    if (!inner || inner.length < 3) continue;

    // Find the rating + inspection date in the surrounding HTML — typically
    // within ~1500 chars after the link.
    const fromIdx = match.index;
    const window = html.slice(fromIdx, fromIdx + 2500);
    const rating = extractRating(window);
    const inspectionDate = extractInspectionDate(window);
    const phase = extractPhase(window);

    reports.push({
      urn,
      name: inner,
      url: `https://reports.ofsted.gov.uk${path}`,
      rating,
      inspectionDate,
      phase,
      address: null,
    });
    if (reports.length >= 25) break;
  }

  return { reports };
}

const RATING_PATTERNS = [
  { rx: /Outstanding/i, label: 'Outstanding' },
  { rx: /\bGood\b/i, label: 'Good' },
  { rx: /Requires improvement/i, label: 'Requires improvement' },
  { rx: /Inadequate/i, label: 'Inadequate' },
  { rx: /Serious weaknesses/i, label: 'Serious weaknesses' },
  { rx: /Special measures/i, label: 'Special measures' },
];

function extractRating(window) {
  for (const { rx, label } of RATING_PATTERNS) {
    if (rx.test(window)) return label;
  }
  return null;
}

function extractInspectionDate(window) {
  // GOV.UK style date e.g. "12 March 2024"
  const m = window.match(/\b(\d{1,2}\s+\w+\s+\d{4})\b/);
  return m ? m[1] : null;
}

function extractPhase(window) {
  if (/Primary/i.test(window)) return 'Primary';
  if (/Secondary/i.test(window)) return 'Secondary';
  if (/All-through/i.test(window)) return 'All-through';
  if (/Sixth form|Further education|FE college/i.test(window)) return 'Sixth form / FE';
  if (/Nursery/i.test(window)) return 'Nursery';
  if (/Special/i.test(window)) return 'Special';
  if (/PRU|Pupil referral/i.test(window)) return 'PRU';
  return null;
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/\bthe\b/g, '')
    .replace(/\b(school|primary|secondary|academy|college|c of e|cofe|catholic|community|nursery|infant|junior|comprehensive)\b/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function normaliseSchool(el, originLat, originLng) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat ?? null;
  const lng = el.lon ?? el.center?.lon ?? null;

  const name =
    pickString(tags.name, tags['name:en'], tags.official_name, tags.short_name) || null;

  // Categorise
  let phase = null;
  if (tags.amenity === 'kindergarten') phase = 'Nursery / Pre-school';
  else if (tags['isced:level']) phase = `ISCED level ${tags['isced:level']}`;
  else if (tags.amenity === 'college') phase = 'College / Sixth form';
  else if (tags.amenity === 'university') phase = 'University';
  else if (/primary/i.test(name || '')) phase = 'Primary';
  else if (/secondary|high school/i.test(name || '')) phase = 'Secondary';
  else phase = 'School';

  // Type / sector
  let type = null;
  if (tags['school:type'] === 'private' || tags.school === 'private') type = 'Independent';
  else if (tags['operator:type'] === 'religious') type = 'Faith school';
  else if (tags.operator) type = pickString(tags.operator);

  const distanceMeters = lat != null && lng != null
    ? haversineMeters(originLat, originLng, lat, lng)
    : null;

  return {
    name,
    type,
    phase,
    address:
      pickString(
        tags['addr:full'],
        [tags['addr:housenumber'], tags['addr:street'], tags['addr:postcode']].filter(Boolean).join(' '),
      ) || null,
    postcode: pickString(tags['addr:postcode']),
    distanceMiles: distanceMeters != null ? distanceMeters / 1609.34 : null,
    distanceMeters: distanceMeters != null ? Math.round(distanceMeters) : null,
    ofstedRating: null,
    ofstedDate: null,
    ofstedReportUrl: null,
    ofstedUrn: null,
    ageRange: tags['min_age'] && tags['max_age'] ? `${tags.min_age}-${tags.max_age}` : null,
    capacity: numberOrNull(tags.capacity),
    pupils: null,
    gender: pickString(tags['school:gender'], tags.gender),
    religiousCharacter: pickString(tags.religion),
    osmId: el.id,
    latitude: lat,
    longitude: lng,
  };
}

function pickString(...candidates) {
  for (const v of candidates) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'object') {
      const text = v.description || v.name || v.label || v.value || v.title;
      if (typeof text === 'string') return text;
    }
  }
  return null;
}

function numberOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
