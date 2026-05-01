// EPC integration — supports multiple auth styles to handle the new
// MHCLG service whose exact format I don't have the spec for yet.
//
// New service base: https://api.epb.digital.communities.gov.uk/api
//   Search:  GET /assessments/domestic-epcs/search?postcode=...
//   Detail:  GET /assessments/{epcRrn}/certificate-summary
//
// We attempt three auth styles in order and use the first one that returns
// a non-401/403:
//   1. Authorization: Bearer <token>
//   2. X-Api-Key: <token>
//   3. Authorization: <token>  (no scheme prefix)
//
// Legacy fallback: if EPC_BEARER_TOKEN isn't set but EPC_EMAIL + EPC_API_KEY
// are, use the old Basic-auth flow against epc.opendatacommunities.org.

const NEW_BASE = 'https://api.epb.digital.communities.gov.uk/api';
const LEGACY_BASE = 'https://epc.opendatacommunities.org/api/v1/domestic/search';

function buildAuthVariants({ bearerToken, email, apiKey }) {
  if (bearerToken) {
    return [
      { name: 'Bearer', headers: { Authorization: `Bearer ${bearerToken}` } },
      { name: 'X-Api-Key', headers: { 'X-Api-Key': bearerToken } },
      { name: 'plain', headers: { Authorization: bearerToken } },
    ];
  }
  if (email && apiKey) {
    const encoded = Buffer.from(`${email}:${apiKey}`).toString('base64');
    return [{ name: 'Basic legacy', headers: { Authorization: `Basic ${encoded}` } }];
  }
  return [];
}

export async function fetchEpcByPostcode(
  { postcode, addressFragment },
  { bearerToken, email, apiKey, baseUrl } = {},
) {
  const variants = buildAuthVariants({ bearerToken, email, apiKey });
  if (variants.length === 0) {
    return {
      configured: false,
      results: [],
      note:
        'EPC API not configured. Set EPC_BEARER_TOKEN (preferred — new MHCLG service) or legacy EPC_EMAIL + EPC_API_KEY on the backend.',
    };
  }

  if (bearerToken) {
    return await tryNewServiceWithFallback({
      postcode,
      addressFragment,
      variants,
      baseUrl: baseUrl || NEW_BASE,
    });
  }
  return await fetchViaLegacyService({
    postcode,
    addressFragment,
    auth: variants[0].headers,
    baseUrl: baseUrl || LEGACY_BASE,
  });
}

async function tryNewServiceWithFallback({ postcode, addressFragment, variants, baseUrl }) {
  const searchPath = `${baseUrl}/assessments/domestic-epcs/search`;
  const attempts = [];

  for (const variant of variants) {
    const url = new URL(searchPath);
    url.searchParams.set('postcode', postcode);
    if (addressFragment) {
      url.searchParams.set('buildingNameOrNumber', extractBuildingPart(addressFragment));
    }

    let body = '';
    let status = 0;
    try {
      const res = await fetch(url, { headers: { ...variant.headers, Accept: 'application/json' } });
      status = res.status;
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }

      if (res.ok) {
        const parsed = body ? JSON.parse(body) : {};
        const assessments = parsed?.data?.assessments || [];
        const bestRrn = pickBestRrn(assessments, addressFragment);

        let summary = null;
        if (bestRrn) {
          try {
            summary = await fetchCertificateSummary(baseUrl, bestRrn, variant.headers);
          } catch (err) {
            summary = { _summaryError: err.message };
          }
        }

        return {
          configured: true,
          authStyle: `new-${variant.name}`,
          count: assessments.length,
          results: assessments.map((a) => ({
            epcRrn: a.epcRrn,
            address: joinNewAddress(a.address),
            ...(a.epcRrn === bestRrn && summary && !summary._summaryError
              ? extractRatingsFromSummary(summary)
              : {}),
          })),
          summaryError: summary?._summaryError || null,
          attempts: [...attempts, { variant: variant.name, status, ok: true }],
        };
      }

      attempts.push({
        variant: variant.name,
        status,
        body: body.slice(0, 180).replace(/\s+/g, ' ').trim(),
      });
    } catch (err) {
      attempts.push({ variant: variant.name, error: err.message });
    }
  }

  // All variants failed — surface them all so the user can see what each said.
  const summary = attempts
    .map((a) => `${a.variant}: ${a.status || 'err'}${a.body ? ' ' + a.body : a.error ? ' ' + a.error : ''}`)
    .join(' | ');
  throw new Error(`EPC API rejected all auth styles. Attempts: ${summary}`);
}

async function fetchCertificateSummary(base, rrn, authHeaders) {
  const url = `${base}/assessments/${encodeURIComponent(rrn)}/certificate-summary`;
  const res = await fetch(url, { headers: { ...authHeaders, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`certificate-summary returned ${res.status}`);
  return await res.json();
}

function extractRatingsFromSummary(body) {
  const d = body?.data || body;
  return {
    currentRating: d?.currentEnergyRating || d?.current_energy_rating || d?.energyRating || null,
    currentScore: numberOrNull(
      d?.currentEnergyEfficiency || d?.current_energy_efficiency || d?.energyEfficiency,
    ),
    potentialRating: d?.potentialEnergyRating || d?.potential_energy_rating || null,
    potentialScore: numberOrNull(d?.potentialEnergyEfficiency || d?.potential_energy_efficiency),
    lodgementDate: d?.lodgementDate || d?.lodgement_date || null,
    propertyType: d?.propertyType || d?.property_type || null,
    builtForm: d?.builtForm || d?.built_form || null,
    totalFloorArea: numberOrNull(d?.totalFloorArea || d?.total_floor_area),
    mainHeating: d?.mainHeatDescription || d?.main_heat_description || d?.mainHeating || null,
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
  return [r.address1, r.address2, r.address3, r.posttown, r.postcode].filter(Boolean).join(', ');
}

function extractBuildingPart(addressFragment) {
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
