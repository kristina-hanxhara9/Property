// Schools via DfE Get Information About Schools (GIAS) + Ofsted ratings.
// Free, no key. Two endpoints:
//   1. https://www.get-information-schools.service.gov.uk/api/Schools
//      — search live establishments by lat/lng radius
//   2. https://reports.ofsted.gov.uk/api/v1/providers/{urn}
//      — get latest inspection rating per school
//
// Coverage: England only. Welsh schools use Estyn separately.
//
// Implementation: postcode-based search via the public schools.gov.uk
// search endpoint, parsed for nearby establishments.

const GIAS_SEARCH = 'https://www.get-information-schools.service.gov.uk/Establishments/Search';

export async function fetchNearbySchools({ postcode, latitude, longitude, radiusMiles = 1 }) {
  if (!postcode && (latitude == null || longitude == null)) {
    throw new Error('postcode or coordinates required');
  }

  // The official GIAS doesn't expose a clean JSON API for radius search,
  // but `compare-school-performance.service.gov.uk` does. We use that.
  const compareUrl = new URL(
    'https://www.compare-school-performance.service.gov.uk/api/schools/search',
  );
  compareUrl.searchParams.set('locationType', 'postcode');
  compareUrl.searchParams.set('postcode', postcode || '');
  compareUrl.searchParams.set('radius', String(radiusMiles));

  let response;
  try {
    const res = await fetch(compareUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'PropertyIQ/0.1' },
    });
    if (!res.ok) throw new Error(`Compare-school-performance returned ${res.status}`);
    response = await res.json();
  } catch (err) {
    return {
      count: 0,
      schools: [],
      error: err.message,
      note: 'Schools API unavailable. Try the DfE Get Information About Schools site directly.',
    };
  }

  const records = response?.results || response?.schools || response?.data || [];

  return {
    count: records.length,
    schools: records.slice(0, 20).map(normaliseSchool),
    source: 'Department for Education / compare-school-performance.service.gov.uk',
  };
}

function normaliseSchool(r) {
  return {
    urn: r.urn || r.URN || null,
    name: pickString(r.name, r.SchoolName, r.schoolName),
    type: pickString(r.schoolType, r.school_type, r.type),
    phase: pickString(r.phase, r.PhaseOfEducation, r.phaseOfEducation),
    address: pickString(r.address, r.fullAddress),
    postcode: pickString(r.postcode),
    distanceMiles: numberOrNull(r.distance) || numberOrNull(r.distanceFromPostcode),
    ofstedRating: pickString(r.ofstedRating, r.OfstedRating, r.ofsted?.rating),
    ofstedDate: pickString(r.ofstedDate, r.dateOfLastInspection),
    ageRange:
      pickString(r.ageRange) ||
      (r.statutoryLowAge && `${r.statutoryLowAge}-${r.statutoryHighAge}`) ||
      null,
    capacity: numberOrNull(r.capacity || r.schoolCapacity),
    pupils: numberOrNull(r.numberOfPupils || r.pupilCount),
    gender: pickString(r.gender),
    religiousCharacter: pickString(r.religiousCharacter),
  };
}

// Unwrap {code, description} objects (and similar) returned by GIAS-style
// APIs into plain strings so the UI can render them safely.
function pickString(...candidates) {
  for (const v of candidates) {
    if (v == null) continue;
    if (typeof v === 'string') return v;
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
