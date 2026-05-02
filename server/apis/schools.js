// Schools — uses OpenStreetMap Overpass API to find tagged schools near a
// coordinate. Free, no key. Adds a link to GOV.UK Compare School Performance
// for Ofsted ratings (which require either the bulk DfE CSV download or a
// commercial subscription to access programmatically).
//
// Why not the DfE API? compare-school-performance.service.gov.uk doesn't
// expose a public JSON API for radius search; it returns 403 to anonymous
// requests. The bulk data download is a 17MB CSV that doesn't fit a
// per-request workflow, and the API endpoints under that domain aren't
// documented for third-party use.

const OVERPASS = 'https://overpass-api.de/api/interpreter';

export async function fetchNearbySchools({ postcode, latitude, longitude, radiusMeters = 1500 }) {
  if (latitude == null || longitude == null) {
    throw new Error('latitude and longitude required');
  }

  // Overpass QL — find schools and colleges within radius. Tag values:
  //   amenity=school          — primary, secondary, all-through
  //   amenity=college         — sixth form, FE
  //   amenity=university      — HE
  //   amenity=kindergarten    — nursery / pre-school
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

  return {
    count: schools.length,
    schools: schools.slice(0, 12),
    ofstedSearchUrl: postcode
      ? `https://www.gov.uk/school-performance-tables?Search=${encodeURIComponent(postcode)}`
      : 'https://www.gov.uk/school-performance-tables',
    note: 'Names and locations from OpenStreetMap. For Ofsted ratings, click the search link for each school.',
    source: 'OpenStreetMap (Overpass API) + GOV.UK Compare School Performance',
  };
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
    ofstedRating: null, // Not available from OSM
    ofstedDate: null,
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
