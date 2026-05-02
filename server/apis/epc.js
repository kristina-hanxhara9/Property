// EPC integration — MHCLG "Energy Certificate Data API"
//
//   Base URL:    https://api.get-energy-performance-data.communities.gov.uk
//   Auth:        Authorization: Bearer <token>  (from your account page)
//   Rate limit:  6000 req / 5 min per application — back off on 429.
//
// Endpoints (per official docs):
//   GET /api/certificate?postcode=...      → search by postcode
//   GET /api/certificate?certificate_number=... → fetch one cert by RRN
//
// Legacy fallback: if EPC_BEARER_TOKEN isn't set but EPC_EMAIL + EPC_API_KEY
// are, use the old Basic-auth flow against epc.opendatacommunities.org.

const NEW_BASE = 'https://api.get-energy-performance-data.communities.gov.uk';
const LEGACY_BASE = 'https://epc.opendatacommunities.org/api/v1/domestic/search';

function buildBearerAuth(token) {
  return { Authorization: `Bearer ${token}` };
}

function buildBasicAuth(email, apiKey) {
  const encoded = Buffer.from(`${email}:${apiKey}`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

export async function fetchEpcByPostcode(
  { postcode, addressFragment },
  { bearerToken, email, apiKey, baseUrl } = {},
) {
  if (bearerToken) {
    return await fetchViaNewService({
      postcode,
      addressFragment,
      auth: buildBearerAuth(bearerToken),
      baseUrl: baseUrl || NEW_BASE,
      searchPath: arguments[1]?.searchPath,
      postcodeParam: arguments[1]?.postcodeParam,
    });
  }
  if (email && apiKey) {
    return await fetchViaLegacyService({
      postcode,
      addressFragment,
      auth: buildBasicAuth(email, apiKey),
      baseUrl: baseUrl || LEGACY_BASE,
    });
  }
  return {
    configured: false,
    results: [],
    note:
      'EPC API not configured. Set EPC_BEARER_TOKEN (preferred — new MHCLG service) or legacy EPC_EMAIL + EPC_API_KEY on the backend.',
  };
}

async function fetchViaNewService({ postcode, addressFragment, auth, baseUrl, searchPath, postcodeParam }) {
  const url = new URL(`${baseUrl}${searchPath || '/api/certificate'}`);
  url.searchParams.set(postcodeParam || 'postcode', postcode);

  const res = await fetch(url, { headers: { ...auth, Accept: 'application/json' } });

  if (res.status === 401 || res.status === 403) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `EPC API ${res.status} (Bearer auth, ${url.host}): ${body.slice(0, 200).replace(/\s+/g, ' ').trim() || 'Not authorized'}`,
    );
  }
  if (res.status === 429) {
    throw new Error(`EPC API rate-limited (429). Back off and retry shortly.`);
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `EPC API ${res.status} from ${url.host}: ${body.slice(0, 200).replace(/\s+/g, ' ').trim()}`,
    );
  }

  const body = await res.json();
  // The API may return either {data: [...]}, {certificates: [...]}, or just an array.
  const records = Array.isArray(body)
    ? body
    : body?.data || body?.certificates || body?.rows || body?.results || [];

  return {
    configured: true,
    authStyle: 'bearer-new',
    count: records.length,
    results: records.map((r) => normaliseNewRecord(r)),
  };
}

function normaliseNewRecord(r) {
  const addr =
    r.address ||
    [r.address1, r.address2, r.address3, r.posttown, r.postcode]
      .filter(Boolean)
      .join(', ') ||
    null;

  return {
    epcRrn: r.certificate_number || r.certificateNumber || r.rrn || r['lmk-key'] || null,
    address: addr,
    lodgementDate:
      r.lodgement_date || r.lodgementDate || r['lodgement-date'] || r.created_at || null,
    currentRating:
      r.current_energy_rating ||
      r.currentEnergyRating ||
      r['current-energy-rating'] ||
      r.energy_rating ||
      null,
    currentScore: numberOrNull(
      r.current_energy_efficiency ||
        r.currentEnergyEfficiency ||
        r['current-energy-efficiency'],
    ),
    potentialRating:
      r.potential_energy_rating ||
      r.potentialEnergyRating ||
      r['potential-energy-rating'] ||
      null,
    potentialScore: numberOrNull(
      r.potential_energy_efficiency ||
        r.potentialEnergyEfficiency ||
        r['potential-energy-efficiency'],
    ),
    propertyType: r.property_type || r.propertyType || r['property-type'] || null,
    builtForm: r.built_form || r.builtForm || r['built-form'] || null,
    tenure: r.tenure || null,
    totalFloorArea: numberOrNull(
      r.total_floor_area || r.totalFloorArea || r['total-floor-area'],
    ),
    mainHeating: r.mainheat_description || r.main_heat_description || r['mainheat-description'] || null,
  };
}

async function fetchViaLegacyService({ postcode, addressFragment, auth, baseUrl }) {
  const url = new URL(baseUrl);
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
      `EPC API ${res.status} (Basic legacy, ${url.host}): ${body.slice(0, 180).replace(/\s+/g, ' ').trim() || 'Not authorized'}`,
    );
  }
  if (!res.ok) throw new Error(`EPC API returned ${res.status} from ${url.host}`);
  const body = await res.json();
  const rows = body?.rows || [];

  return {
    configured: true,
    authStyle: 'basic-legacy',
    count: rows.length,
    results: rows.map((r) => normaliseNewRecord(r)),
  };
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

function scoreMatch(a, b) {
  let score = 0;
  const tokens = b.split(/[\s,]+/).filter(Boolean);
  for (const t of tokens) {
    if (t.length >= 2 && a.includes(t)) score += t.length;
  }
  return score;
}
