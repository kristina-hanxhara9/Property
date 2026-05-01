// EPC Register integration.
// Supports both auth methods during the migration window:
//   1. NEW: Bearer token (post-May-2026, "Get energy performance of buildings data service")
//      Set EPC_BEARER_TOKEN.
//   2. LEGACY: HTTP Basic with email:api-key (epc.opendatacommunities.org, retires 30 May 2026)
//      Set EPC_EMAIL + EPC_API_KEY.
// If both are configured, Bearer takes precedence.
//
// The endpoint URL itself is configurable via EPC_BASE_URL since the service
// is migrating. Default points at the long-standing opendatacommunities path
// which still serves both auth styles during the transition.

const DEFAULT_BASE_URL = 'https://epc.opendatacommunities.org/api/v1/domestic/search';

function buildAuthHeader({ bearerToken, email, apiKey }) {
  if (bearerToken) {
    return { Authorization: `Bearer ${bearerToken}` };
  }
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
        'EPC API not configured. Set EPC_BEARER_TOKEN (preferred — new service) or EPC_EMAIL + EPC_API_KEY (legacy, retires 30 May 2026).',
    };
  }

  const url = new URL(baseUrl || DEFAULT_BASE_URL);
  url.searchParams.set('postcode', postcode);
  url.searchParams.set('size', '20');
  if (addressFragment) {
    url.searchParams.set('address', addressFragment);
  }

  const res = await fetch(url, {
    headers: { ...auth, Accept: 'application/json' },
  });

  if (res.status === 401 || res.status === 403) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      // ignore
    }
    const detail = bodyText.slice(0, 200).replace(/\s+/g, ' ').trim();
    throw new Error(
      `EPC API ${res.status} (${bearerToken ? 'Bearer' : 'Basic'} auth, URL: ${url.host}). ${
        detail || 'Token may be wrong, expired, or for a different service.'
      }`,
    );
  }
  if (!res.ok) {
    throw new Error(`EPC API returned ${res.status} from ${url.host}`);
  }
  const body = await res.json();
  const rows = body?.rows || body?.data || [];

  return {
    configured: true,
    authStyle: bearerToken ? 'bearer' : 'basic',
    count: rows.length,
    results: rows.map((r) => ({
      address: r.address || joinAddress(r),
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

function joinAddress(r) {
  return [r.address1, r.address2, r.address3, r.posttown, r.postcode]
    .filter(Boolean)
    .join(', ');
}

function numberOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Choose the best EPC match for a given address — exact match preferred.
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
