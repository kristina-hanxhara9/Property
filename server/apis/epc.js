const BASE_URL = 'https://epc.opendatacommunities.org/api/v1/domestic/search';

// EPC API auth: HTTP Basic with email:api-key.
// Sign up free at https://epc.opendatacommunities.org/ to get a key.
function authHeader({ email, apiKey }) {
  if (!email || !apiKey) {
    throw new Error('EPC_EMAIL and EPC_API_KEY must be configured');
  }
  const encoded = Buffer.from(`${email}:${apiKey}`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

export async function fetchEpcByPostcode({ postcode, addressFragment }, { email, apiKey } = {}) {
  if (!email || !apiKey) {
    return { configured: false, results: [], note: 'EPC API key not configured on the server.' };
  }

  const url = new URL(BASE_URL);
  url.searchParams.set('postcode', postcode);
  url.searchParams.set('size', '20');
  if (addressFragment) {
    url.searchParams.set('address', addressFragment);
  }

  const res = await fetch(url, {
    headers: { ...authHeader({ email, apiKey }), Accept: 'application/json' },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('EPC API authentication failed — verify EPC_EMAIL and EPC_API_KEY.');
  }
  if (!res.ok) {
    throw new Error(`EPC API returned ${res.status}`);
  }
  const body = await res.json();
  const rows = body?.rows || [];

  return {
    configured: true,
    count: rows.length,
    results: rows.map((r) => ({
      address: r.address,
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
