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
  url.searchParams.set('sort', '-start_date');
  if (postcode) {
    url.searchParams.set('postcode', postcode);
  } else {
    // PlanIt accepts a "near" parameter as "lat,lng,radius_km"
    url.searchParams.set('near', `${latitude},${longitude},0.5`);
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
    applications: records.map((r) => ({
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
    })),
  };
}
