// Food Standards Agency Food Hygiene Rating Scheme (FHRS) API.
// Free, no key. Returns establishments within a postcode radius with their
// hygiene ratings (0-5 scale).
// Docs: https://api.ratings.food.gov.uk/Help

const BASE = 'https://api.ratings.food.gov.uk';

export async function fetchFoodHygieneRatings({ postcode, latitude, longitude, radiusMiles = 1 }) {
  if (!postcode && (latitude == null || longitude == null)) {
    throw new Error('postcode or coordinates required');
  }

  const url = new URL(`${BASE}/Establishments`);
  if (latitude != null && longitude != null) {
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('maxDistanceLimit', String(radiusMiles));
  }
  if (postcode) url.searchParams.set('address', postcode);
  url.searchParams.set('pageSize', '50');
  url.searchParams.set('pageNumber', '1');

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'x-api-version': '2',
    },
  });

  if (!res.ok) throw new Error(`FSA API returned ${res.status}`);
  const body = await res.json();
  const establishments = body?.establishments || [];

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
