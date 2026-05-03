// PlanIt UK — free public JSON API that aggregates planning applications
// across UK Local Planning Authorities. Most reliable free source for real
// planning application records by postcode.
//
// Docs: https://www.planit.org.uk/api/
// Endpoint: GET /api/applics/json?postcode=XX1+1XX&pg_sz=20

const BASE_URL = 'https://www.planit.org.uk/api/applics/json';

export async function fetchPlanningApplications({ postcode, latitude, longitude, limit = 15 }) {
  if (!postcode && (latitude == null || longitude == null)) {
    throw new Error('postcode or coordinates required');
  }

  const url = new URL(BASE_URL);
  url.searchParams.set('pg_sz', String(limit));
  // PlanIt's default sort with a spatial query is by proximity (closest
  // first) — exactly what we want so the property's own applications and
  // its immediate neighbours rank highest. We don't override `sort` here.
  if (latitude != null && longitude != null) {
    // Lat/lng + radius gives more precise proximity ranking than postcode.
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lng', String(longitude));
    url.searchParams.set('krad', '0.4');
  } else if (postcode) {
    url.searchParams.set('pcode', postcode);
    url.searchParams.set('krad', '0.4');
  }

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`PlanIt API returned ${res.status}`);
  }
  const body = await res.json();
  const records = body?.records || body?.applics || [];

  return {
    count: records.length,
    total: body?.total || records.length,
    applications: records.map(normalisePlanitRecord),
  };
}

// Address-level history: pulls every planning application PlanIt has on
// record for the exact street/property text. Used to surface a property's
// own application history (extensions, conversions, refusals) — distinct
// from the proximity-sorted "what's happening nearby" list.
export async function fetchPlanningApplicationsForAddress({
  postcode,
  addressFragment,
  limit = 25,
}) {
  if (!postcode && !addressFragment) return { count: 0, total: 0, applications: [] };

  const url = new URL(BASE_URL);
  url.searchParams.set('pg_sz', String(limit));
  url.searchParams.set('sort', '-start_date');
  if (postcode) url.searchParams.set('pcode', postcode);
  // PlanIt supports a free-text `search` param that scans description +
  // address fields. We use the most distinctive part of the address (the
  // street + house number) to filter the postcode list down to one property.
  if (addressFragment) {
    const fragment = extractStreetFragment(addressFragment);
    if (fragment) url.searchParams.set('search', fragment);
  }

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`PlanIt address-level returned ${res.status}`);
  }
  const body = await res.json();
  const records = body?.records || body?.applics || [];
  const applications = records.map(normalisePlanitRecord);

  // Group by status for the UI traffic-light summary.
  const summary = summariseApplications(applications);

  return {
    count: records.length,
    total: body?.total || records.length,
    applications,
    summary,
    fragment: addressFragment ? extractStreetFragment(addressFragment) : null,
  };
}

function normalisePlanitRecord(r) {
  return {
    reference: r.reference || r.altref || r.uid || null,
    description: r.description || r.proposal || null,
    address: r.address || r.location || null,
    authority: r.area_name || r.authority_name || r.name || null,
    status: r.app_state || r.decision || r.status || null,
    decision: r.decision || null,
    decisionDate: r.decided_date || r.decision_date || null,
    receivedDate: r.start_date || r.received_date || null,
    consultationEndDate: r.consultation_end_date || null,
    url: r.url || r.app_url || null,
    latitude: r.lat || null,
    longitude: r.lng || null,
    type: r.app_type || null,
  };
}

function summariseApplications(apps) {
  const totals = { approved: 0, refused: 0, withdrawn: 0, pending: 0, other: 0 };
  for (const a of apps) {
    const s = String(a.decision || a.status || '').toLowerCase();
    if (/approve|grant|permit|consent/.test(s)) totals.approved += 1;
    else if (/refus|reject/.test(s)) totals.refused += 1;
    else if (/withdraw/.test(s)) totals.withdrawn += 1;
    else if (/pending|undecided|received|registered|consult/.test(s)) totals.pending += 1;
    else totals.other += 1;
  }
  // Refusal rate is a useful signal for hostile LPAs / problem properties.
  const decided = totals.approved + totals.refused;
  const refusalRate = decided > 0 ? Math.round((totals.refused / decided) * 100) : null;
  return { ...totals, decided, refusalRate };
}

// Extract the most distinctive part of an address for full-text search.
// Drops the postcode (already used as a separate filter) and city/county
// noise; keeps the house number + street so PlanIt's search lands cleanly.
function extractStreetFragment(addressText) {
  if (!addressText) return null;
  const cleaned = String(addressText)
    .replace(/\b([A-Z]{1,2}\d[A-Z\d]?)\s?(\d[A-Z]{2})\b/i, '') // strip postcode
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Take the first comma-separated chunk if it's substantive enough,
  // otherwise the whole cleaned string.
  const firstChunk = cleaned.split(',')[0]?.trim();
  if (firstChunk && firstChunk.length >= 4) return firstChunk;
  return cleaned || null;
}
