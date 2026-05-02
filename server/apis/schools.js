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
    name: r.name || r.SchoolName || r.schoolName || null,
    type: r.schoolType || r.school_type || r.type || r.OfstedRating || null,
    phase: r.phase || r.PhaseOfEducation || r.phaseOfEducation || null,
    address: r.address || r.fullAddress || null,
    postcode: r.postcode || null,
    distanceMiles: numberOrNull(r.distance) || numberOrNull(r.distanceFromPostcode),
    ofstedRating: r.ofstedRating || r.OfstedRating || r.ofsted?.rating || null,
    ofstedDate: r.ofstedDate || r.dateOfLastInspection || null,
    ageRange: r.ageRange || r.statutoryLowAge && `${r.statutoryLowAge}-${r.statutoryHighAge}` || null,
    capacity: numberOrNull(r.capacity || r.schoolCapacity),
    pupils: numberOrNull(r.numberOfPupils || r.pupilCount),
    gender: r.gender || null,
    religiousCharacter: r.religiousCharacter || null,
  };
}

function numberOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
