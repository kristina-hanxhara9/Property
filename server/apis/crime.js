// Crime data via police.uk — free public API. Returns all street-level
// crimes within 1 mile of a coordinate for a given month.
// Docs: https://data.police.uk/docs/method/crimes-street/
//
// Coverage: England, Wales, Northern Ireland. Scotland is not in police.uk
// (separate service). Updated monthly with ~6-week lag.

const BASE = 'https://data.police.uk/api';

// Known crime category labels for human-readable output
const CATEGORY_LABELS = {
  'all-crime': 'All crime',
  'anti-social-behaviour': 'Anti-social behaviour',
  'bicycle-theft': 'Bicycle theft',
  burglary: 'Burglary',
  'criminal-damage-arson': 'Criminal damage / arson',
  drugs: 'Drugs',
  'other-theft': 'Other theft',
  'possession-of-weapons': 'Weapons possession',
  'public-order': 'Public order',
  robbery: 'Robbery',
  shoplifting: 'Shoplifting',
  'theft-from-the-person': 'Theft from the person',
  'vehicle-crime': 'Vehicle crime',
  'violent-crime': 'Violence and sexual offences',
  'other-crime': 'Other crime',
};

export async function fetchCrimeData({ latitude, longitude }) {
  if (latitude == null || longitude == null) {
    throw new Error('latitude and longitude required');
  }

  // Determine the most recent available month. police.uk publishes monthly
  // data ~6 weeks after the period closes, so we step back from "now".
  const months = lastNMonths(13); // try up to 13 months back

  // Find the most recent month that returns data.
  let latestMonth = null;
  let latestData = null;
  for (const month of months) {
    const data = await tryFetchMonth(latitude, longitude, month);
    if (data && data.length > 0) {
      latestMonth = month;
      latestData = data;
      break;
    }
  }

  if (!latestData) {
    return {
      latestMonth: null,
      latestCount: 0,
      categoryBreakdown: [],
      twelveMonthTrend: [],
      sample: [],
      note: 'No crime data returned for this location. Scotland is not covered by police.uk.',
    };
  }

  // Pull a 12-month trend in parallel (best-effort)
  const trendMonths = lastNMonths(12, latestMonth);
  const trendResults = await Promise.allSettled(
    trendMonths.map((m) => tryFetchMonth(latitude, longitude, m)),
  );
  const twelveMonthTrend = trendResults.map((r, i) => ({
    month: trendMonths[i],
    count: r.status === 'fulfilled' && Array.isArray(r.value) ? r.value.length : null,
  }));

  // Aggregate latest-month breakdown by category
  const categoryCounts = {};
  for (const c of latestData) {
    categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
  }
  const categoryBreakdown = Object.entries(categoryCounts)
    .map(([cat, count]) => ({
      category: cat,
      label: CATEGORY_LABELS[cat] || cat,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    latestMonth,
    latestCount: latestData.length,
    categoryBreakdown,
    twelveMonthTrend,
    sample: latestData.slice(0, 8).map((c) => ({
      category: CATEGORY_LABELS[c.category] || c.category,
      streetName: c.location?.street?.name || null,
      latitude: c.location?.latitude || null,
      longitude: c.location?.longitude || null,
      outcome: c.outcome_status?.category || 'No outcome reported',
      monthOccurred: c.month,
    })),
    source: 'data.police.uk — Street-level crimes within 1 mile',
  };
}

async function tryFetchMonth(lat, lng, month) {
  const url = `${BASE}/crimes-street/all-crime?lat=${lat}&lng=${lng}&date=${month}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function lastNMonths(n, startFrom = null) {
  const months = [];
  const d = startFrom ? new Date(`${startFrom}-15`) : new Date();
  d.setDate(15); // mid-month to avoid TZ edge cases
  for (let i = 0; i < n; i++) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${yyyy}-${mm}`);
    d.setMonth(d.getMonth() - 1);
  }
  return months;
}
