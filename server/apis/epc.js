// EPC integration.
//
// The MHCLG service that issues bearer tokens lives at:
//   https://api.epb.digital.communities.gov.uk/api
// (NEW — replaces epc.opendatacommunities.org which retires 30 May 2026)
//
// Flow:
//   1. GET /assessments/domestic-epcs/search?postcode=...&buildingNameOrNumber=...
//      → returns { data: { assessments: [{ epcRrn, address }, ...] } }
//   2. GET /assessments/{epcRrn}/certificate-summary
//      → returns full ratings, lodgement date, recommendations
//
// Auth: Authorization: Bearer <token>
//
// Legacy fallback: if a bearer token is NOT set but EPC_EMAIL + EPC_API_KEY
// are, fall back to the old opendatacommunities Basic-auth flow (same
// hostname, single-step search returns ratings inline).

const NEW_BASE = 'https://api.epb.digital.communities.gov.uk/api';
const LEGACY_BASE = 'https://epc.opendatacommunities.org/api/v1/domestic/search';

function buildAuthHeader({ bearerToken, email, apiKey }) {
  if (bearerToken) return { Authorization: `Bearer ${bearerToken}` };
  if (email && apiKey) {
    const encoded = Buffer.from(`${email}:${apiKey}`).toString('base64');
    return { Authorization: `Basic ${encoded}` };
  }
  return null;
}

export async function fetchEpcByPostcode(
  { postcode, addressFragment },
  { bearerToken, email, apiKey, baseUrl } = {},
) {
  const auth = buildAuthHeader({ bearerToken, email, apiKey });
  if (!auth) {
    return {
      configured: false,
      results: [],
      note:
        'EPC API not configured. Set EPC_BEARER_TOKEN (preferred — new MHCLG service) or legacy EPC_EMAIL + EPC_API_KEY on the backend.',
    };
  }

  if (bearerToken) {
    return await fetchViaNewService({ postcode, addressFragment, auth, baseUrl });
  }
  return await fetchViaLegacyService({ postcode, addressFragment, auth, baseUrl });
}

async function fetchViaNewService({ postcode, addressFragment, auth, baseUrl }) {
  const base = baseUrl || NEW_BASE;

  // 1. Search by postcode
  const searchUrl = new URL(`${base}/assessments/domestic-epcs/search`);
  searchUrl.searchParams.set('postcode', postcode);
  if (addressFragment) {
    searchUrl.searchParams.set('buildingNameOrNumber', extractBuildingPart(addressFragment));
  }

  const searchRes = await fetch(searchUrl, {
    headers: { ...auth, Accept: 'application/json' },
  });

  if (searchRes.status === 401 || searchRes.status === 403) {
    let body = '';
    try {
      body = await searchRes.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `EPC API ${searchRes.status} (Bearer auth, ${searchUrl.host}): ${body.slice(0, 180).replace(/\s+/g, ' ').trim() || 'Not authorized'}`,
    );
  }
  if (!searchRes.ok) {
    throw new Error(`EPC search returned ${searchRes.status} from ${searchUrl.host}`);
  }

  const searchBody = await searchRes.json();
  const assessments = searchBody?.data?.assessments || [];

  // 2. Pick best match by address, then fetch certificate-summary
  const bestRrn = pickBestRrn(assessments, addressFragment);
  let summary = null;
  if (bestRrn) {
    try {
      summary = await fetchCertificateSummary(base, bestRrn, auth);
    } catch (err) {
      // search worked but summary failed (different scope?) — keep going with search-only data
      summary = { _summaryError: err.message };
    }
  }

  return {
    configured: true,
    authStyle: 'bearer-new',
    count: assessments.length,
    results: assessments.map((a) => ({
      epcRrn: a.epcRrn,
      address: joinNewAddress(a.address),
      // Ratings only present if this RRN matched and we fetched the summary
      ...(a.epcRrn === bestRrn && summary && !summary._summaryError
        ? extractRatingsFromSummary(summary)
        : {}),
    })),
    summaryError: summary?._summaryError || null,
  };
}

async function fetchCertificateSummary(base, rrn, auth) {
  const url = `${base}/assessments/${encodeURIComponent(rrn)}/certificate-summary`;
  const res = await fetch(url, { headers: { ...auth, Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`certificate-summary returned ${res.status}`);
  }
  return await res.json();
}

function extractRatingsFromSummary(body) {
  // The summary response is a discriminated union; field names live in nested
  // `data` objects. Try several plausible paths so we tolerate schema drift.
  const d = body?.data || body;
  return {
    currentRating:
      d?.currentEnergyRating || d?.current_energy_rating || d?.energyRating || null,
    currentScore: numberOrNull(
      d?.currentEnergyEfficiency || d?.current_energy_efficiency || d?.energyEfficiency,
    ),
    potentialRating:
      d?.potentialEnergyRating || d?.potential_energy_rating || null,
    potentialScore: numberOrNull(
      d?.potentialEnergyEfficiency || d?.potential_energy_efficiency,
    ),
    lodgementDate: d?.lodgementDate || d?.lodgement_date || null,
    propertyType: d?.propertyType || d?.property_type || null,
    builtForm: d?.builtForm || d?.built_form || null,
    totalFloorArea: numberOrNull(d?.totalFloorArea || d?.total_floor_area),
    mainHeating: d?.mainHeatDescription || d?.main_heat_description || d?.mainHeating || null,
  };
}

async function fetchViaLegacyService({ postcode, addressFragment, auth, baseUrl }) {
  const url = new URL(baseUrl || LEGACY_BASE);
  url.searchParams.set('postcode', postcode);
  url.searchParams.set('size', '20');
  if (addressFragment) url.searchParams.set('address', addressFragment);

  const res = await fetch(url, { headers: { ...auth, Accept: 'application/json' } });

  if (res.status === 401 || res.status === 403) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `EPC API ${res.status} (Basic auth, ${url.host}): ${body.slice(0, 180).replace(/\s+/g, ' ').trim() || 'Not authorized'}`,
    );
  }
  if (!res.ok) throw new Error(`EPC API returned ${res.status} from ${url.host}`);
  const body = await res.json();
  const rows = body?.rows || [];

  return {
    configured: true,
    authStyle: 'basic-legacy',
    count: rows.length,
    results: rows.map((r) => ({
      address: r.address || joinLegacyAddress(r),
      lodgementDate: r['lodgement-date'] || r.lodgement_date || null,
      currentRating: r['current-energy-rating'] || r.current_energy_rating || null,
      currentScore: numberOrNull(r['current-energy-efficiency'] || r.current_energy_efficiency),
      potentialRating: r['potential-energy-rating'] || r.potential_energy_rating || null,
      potentialScore: numberOrNull(
        r['potential-energy-efficiency'] || r.potential_energy_efficiency,
      ),
      propertyType: r['property-type'] || r.property_type || null,
      builtForm: r['built-form'] || r.built_form || null,
      tenure: r.tenure || null,
      totalFloorArea: numberOrNull(r['total-floor-area'] || r.total_floor_area),
      mainHeating: r['mainheat-description'] || null,
      lmkKey: r['lmk-key'] || null,
    })),
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function joinNewAddress(addr) {
  if (!addr) return null;
  return [addr.addressLine1, addr.addressLine2, addr.addressLine3, addr.addressLine4, addr.town, addr.postcode]
    .filter(Boolean)
    .join(', ');
}

function joinLegacyAddress(r) {
  return [r.address1, r.address2, r.address3, r.posttown, r.postcode]
    .filter(Boolean)
    .join(', ');
}

function extractBuildingPart(addressFragment) {
  // Pull the leading number/name token from "10 Downing Street, ..." → "10"
  const m = String(addressFragment).match(/^(\d+\w?|[A-Z][\w'-]+)/);
  return m ? m[1] : '';
}

function numberOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function pickBestEpc(epcResult, addressHint) {
  if (!epcResult?.results || epcResult.results.length === 0) return null;
  if (epcResult.results.length === 1) return epcResult.results[0];
  if (!addressHint) return epcResult.results[0];

  const hint = String(addressHint).toUpperCase();
  const ranked = [...epcResult.results].map((r) => ({
    r,
    score: scoreMatch(String(r.address || '').toUpperCase(), hint),
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0].r;
}

function pickBestRrn(assessments, addressFragment) {
  if (!assessments || assessments.length === 0) return null;
  if (assessments.length === 1) return assessments[0].epcRrn;
  if (!addressFragment) return assessments[0].epcRrn;
  const hint = String(addressFragment).toUpperCase();
  const ranked = [...assessments].map((a) => ({
    a,
    score: scoreMatch(joinNewAddress(a.address)?.toUpperCase() || '', hint),
  }));
  ranked.sort((x, y) => y.score - x.score);
  return ranked[0].a.epcRrn;
}

function scoreMatch(a, b) {
  let score = 0;
  const tokens = b.split(/[\s,]+/).filter(Boolean);
  for (const t of tokens) {
    if (t.length >= 2 && a.includes(t)) score += t.length;
  }
  return score;
}
