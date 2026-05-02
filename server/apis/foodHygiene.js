// Food Standards Agency Food Hygiene Rating Scheme (FHRS) API.
// Free, no key. Returns establishments within a postcode radius with their
// hygiene ratings (0-5 scale).
// Docs: https://api.ratings.food.gov.uk/Help

const BASE = 'https://api.ratings.food.gov.uk';

export async function fetchFoodHygieneRatings({ postcode, latitude, longitude, radiusMiles = 1 }) {
  if (!postcode && (latitude == null || longitude == null)) {
    throw new Error('postcode or coordinates required');
  }

  // FSA does not accept BOTH address and lat/lng — choose one. lat/lng
  // is more accurate so prefer that.
  const buildUrl = ({ useCoords }) => {
    const u = new URL(`${BASE}/Establishments`);
    if (useCoords && latitude != null && longitude != null) {
      u.searchParams.set('latitude', String(latitude));
      u.searchParams.set('longitude', String(longitude));
      u.searchParams.set('maxDistanceLimit', String(radiusMiles));
    } else if (postcode) {
      u.searchParams.set('address', postcode);
    }
    u.searchParams.set('pageSize', '50');
    u.searchParams.set('pageNumber', '1');
    return u;
  };

  const tryFetch = async (apiVersion, url) => {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'x-api-version': apiVersion,
        'User-Agent':
          'Mozilla/5.0 (compatible; PropertyIQ/0.1; +https://github.com/kristina-hanxhara9/Property)',
      },
    });
    if (!res.ok) throw new Error(`FSA API v${apiVersion} returned ${res.status}`);
    return await res.json();
  };

  // Try, in order: v2+coords, v2+postcode, v1+coords, v1+postcode.
  const attempts = [
    { version: '2', useCoords: true },
    { version: '2', useCoords: false },
    { version: '1', useCoords: true },
    { version: '1', useCoords: false },
  ];

  let body = null;
  let lastError = null;
  let lastUrl = null;
  for (const a of attempts) {
    const url = buildUrl({ useCoords: a.useCoords });
    lastUrl = url.toString();
    try {
      body = await tryFetch(a.version, url);
      if ((body?.establishments || []).length > 0) break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!body && lastError) {
    throw new Error(`${lastError.message} (last URL: ${lastUrl})`);
  }
  const establishments = (body?.establishments) || [];

  const ratingCounts = {};
  for (const e of establishments) {
    const r = e.RatingValue || 'Unknown';
    ratingCounts[r] = (ratingCounts[r] || 0) + 1;
  }

  return {
    count: establishments.length,
    ratingBreakdown: Object.entries(ratingCounts)
      .map(([rating, count]) => ({ rating, count }))
      .sort((a, b) => b.count - a.count),
    establishments: establishments.slice(0, 12).map((e) => ({
      name: e.BusinessName,
      type: e.BusinessType,
      address: [e.AddressLine1, e.AddressLine2, e.AddressLine3, e.AddressLine4, e.PostCode]
        .filter(Boolean)
        .join(', '),
      rating: e.RatingValue,
      ratingDate: e.RatingDate,
      newRatingPending: e.NewRatingPending,
      distanceMiles: numberOrNull(e.Distance),
    })),
    source: 'Food Standards Agency — Food Hygiene Rating Scheme',
  };
}

function numberOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
