// EPC integration — MHCLG "Energy Certificate Data API"
// Docs the user provided:
//   Base URL:    https://api.get-energy-performance-data.communities.gov.uk
//   Auth:        Authorization: Bearer <token>
//   Rate limit:  6000 req / 5 min per application — back off on 429.
//
// Two-step lookup:
//   1. GET /api/domestic/search?postcode=...   → list of matching certs
//   2. GET /api/certificate?certificate_number=X → full schema-specific
//      details for the best-matched certificate (RdSAP / SAP / CEPC etc).
//
// Search response fields (documented, camelCase):
//   certificateNumber, addressLine1-4, postcode, postTown, council,
//   constituency, currentEnergyEfficiencyBand, registrationDate, uprn
//
// Detail response wraps everything under `data` and uses snake_case fields
// that vary by certificate type. We pass the whole detail object through
// to the raw data section so every field is visible.
//
// Legacy fallback: if EPC_BEARER_TOKEN isn't set but EPC_EMAIL + EPC_API_KEY
// are, use the old Basic-auth flow against epc.opendatacommunities.org.

const NEW_BASE = 'https://api.get-energy-performance-data.communities.gov.uk';
const NEW_SEARCH_PATH = '/api/domestic/search';
const NEW_CERT_PATH = '/api/certificate';
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
  { bearerToken, email, apiKey, baseUrl, searchPath, postcodeParam } = {},
) {
  if (bearerToken) {
    return await fetchViaNewService({
      postcode,
      addressFragment,
      auth: buildBearerAuth(bearerToken),
      baseUrl: baseUrl || NEW_BASE,
      searchPath: searchPath || NEW_SEARCH_PATH,
      postcodeParam: postcodeParam || 'postcode',
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

async function fetchViaNewService({
  postcode,
  addressFragment,
  auth,
  baseUrl,
  searchPath,
  postcodeParam,
}) {
  // Step 1: search by postcode
  const searchUrl = new URL(`${baseUrl}${searchPath}`);
  searchUrl.searchParams.set(postcodeParam, postcode);

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
      `EPC API ${searchRes.status} (Bearer auth, ${searchUrl.host}): ${body.slice(0, 200).replace(/\s+/g, ' ').trim() || 'Not authorized'}`,
    );
  }
  if (searchRes.status === 404) {
    // 404 from the search endpoint means no matches for this postcode
    return { configured: true, authStyle: 'bearer-new', count: 0, results: [], detail: null };
  }
  if (searchRes.status === 429) {
    throw new Error('EPC API rate-limited (429). Back off and retry.');
  }
  if (!searchRes.ok) {
    let body = '';
    try {
      body = await searchRes.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `EPC search ${searchRes.status} from ${searchUrl.host}: ${body.slice(0, 200).replace(/\s+/g, ' ').trim()}`,
    );
  }

  const searchBody = await searchRes.json();
  // Per docs the shape is { data: [...], pagination: {...} } but the published
  // example has a stray brace. Tolerate both.
  const records = Array.isArray(searchBody?.data)
    ? searchBody.data
    : searchBody?.data?.[0] && Array.isArray(searchBody.data)
    ? searchBody.data
    : Array.isArray(searchBody)
    ? searchBody
    : Array.isArray(searchBody?.records)
    ? searchBody.records
    : [];

  // Step 2: fetch full detail for the best-matched certificate
  const bestRecord = pickBestSearchRecord(records, addressFragment);
  let detail = null;
  let detailError = null;
  if (bestRecord?.certificateNumber) {
    try {
      detail = await fetchCertificateDetail(baseUrl, bestRecord.certificateNumber, auth);
    } catch (err) {
      detailError = err.message;
    }
  }

  return {
    configured: true,
    authStyle: 'bearer-new',
    count: records.length,
    pagination: searchBody?.pagination || null,
    results: records.map(normaliseSearchRecord),
    detail, // full object from /api/certificate, schema-dependent
    detailError,
    rawSearchResponse: searchBody, // pass through for raw data section
  };
}

async function fetchCertificateDetail(baseUrl, certificateNumber, auth) {
  const url = new URL(`${baseUrl}${NEW_CERT_PATH}`);
  url.searchParams.set('certificate_number', certificateNumber);
  const res = await fetch(url, { headers: { ...auth, Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`/api/certificate returned ${res.status}`);
  }
  const body = await res.json();
  return body?.data || body;
}

function normaliseSearchRecord(r) {
  // The search endpoint returns camelCase; the legacy endpoint returns kebab-case.
  // Map both to the shape the rest of the app expects.
  const addr = [r.addressLine1, r.addressLine2, r.addressLine3, r.addressLine4, r.postTown, r.postcode]
    .filter(Boolean)
    .map((s) => String(s).replace(/\+/g, ' '))
    .join(', ');

  return {
    epcRrn: r.certificateNumber || r.certificate_number || r.rrn || r['lmk-key'] || null,
    address: addr || r.address || null,
    addressLine1: r.addressLine1 || null,
    addressLine2: r.addressLine2 || null,
    addressLine3: r.addressLine3 || null,
    addressLine4: r.addressLine4 || null,
    postTown: r.postTown || null,
    postcode: r.postcode ? String(r.postcode).replace(/\+/g, ' ') : null,
    council: r.council || null,
    constituency: r.constituency || null,
    uprn: r.uprn || null,
    currentRating:
      r.currentEnergyEfficiencyBand ||
      r.current_energy_efficiency_band ||
      r['current-energy-rating'] ||
      null,
    currentScore: numberOrNull(
      r.currentEnergyEfficiency ||
        r.current_energy_efficiency ||
        r['current-energy-efficiency'],
    ),
    potentialRating:
      r.potentialEnergyEfficiencyBand ||
      r.potential_energy_efficiency_band ||
      r['potential-energy-rating'] ||
      null,
    potentialScore: numberOrNull(
      r.potentialEnergyEfficiency ||
        r.potential_energy_efficiency ||
        r['potential-energy-efficiency'],
    ),
    lodgementDate:
      r.registrationDate ||
      r.registration_date ||
      r.lodgement_date ||
      r.lodgementDate ||
      r['lodgement-date'] ||
      null,
    propertyType: r.propertyType || r.property_type || r['property-type'] || null,
    builtForm: r.builtForm || r.built_form || r['built-form'] || null,
    tenure: r.tenure || null,
    totalFloorArea: numberOrNull(
      r.totalFloorArea || r.total_floor_area || r['total-floor-area'],
    ),
    mainHeating:
      r.mainHeatDescription ||
      r.mainheat_description ||
      r['mainheat-description'] ||
      r.main_heat_description ||
      null,
    assessmentType: r.assessmentType || r.assessment_type || null,
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
    results: rows.map(normaliseSearchRecord),
  };
}

function numberOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function pickBestEpc(epcResult, addressHint) {
  if (!epcResult?.results || epcResult.results.length === 0) return null;

  // If we have a detail fetched from /api/certificate, fold its fields into
  // the matched search record so the EPC card has the richest data possible.
  const baseMatch = pickBestRecord(epcResult.results, addressHint);
  if (!baseMatch) return null;
  if (epcResult.detail) {
    return mergeDetailIntoMatch(baseMatch, epcResult.detail);
  }
  return baseMatch;
}

function pickBestRecord(results, addressHint) {
  if (results.length === 1) return results[0];
  if (!addressHint) return results[0];
  const hint = String(addressHint).toUpperCase();
  const ranked = [...results].map((r) => ({
    r,
    score: scoreMatch(String(r.address || '').toUpperCase(), hint),
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0].r;
}

function pickBestSearchRecord(records, addressHint) {
  if (!records || records.length === 0) return null;
  if (records.length === 1) return records[0];
  if (!addressHint) return records[0];
  const hint = String(addressHint).toUpperCase();
  const ranked = [...records].map((r) => ({
    r,
    score: scoreMatch(
      [r.addressLine1, r.addressLine2, r.postTown].filter(Boolean).join(' ').toUpperCase(),
      hint,
    ),
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0].r;
}

function mergeDetailIntoMatch(base, detail) {
  const merged = { ...base };
  // The detail payload has snake_case schema-specific fields. Map a few
  // common ones into the existing slots so the EPC card lights up.
  if (detail.current_energy_efficiency_band)
    merged.currentRating = detail.current_energy_efficiency_band;
  if (detail.current_energy_efficiency != null)
    merged.currentScore = numberOrNull(detail.current_energy_efficiency);
  if (detail.potential_energy_efficiency_band)
    merged.potentialRating = detail.potential_energy_efficiency_band;
  if (detail.potential_energy_efficiency != null)
    merged.potentialScore = numberOrNull(detail.potential_energy_efficiency);
  if (detail.registration_date) merged.lodgementDate = detail.registration_date;
  if (detail.property_type) merged.propertyType = detail.property_type;
  if (detail.built_form) merged.builtForm = detail.built_form;
  if (detail.tenure) merged.tenure = detail.tenure;
  if (detail.total_floor_area != null)
    merged.totalFloorArea = numberOrNull(detail.total_floor_area);
  if (detail.mainheat_description || detail.main_heat_description)
    merged.mainHeating = detail.mainheat_description || detail.main_heat_description;
  if (detail.uprn != null) merged.uprn = detail.uprn;
  if (detail.assessment_type) merged.assessmentType = detail.assessment_type;
  // Stash the full detail so the raw data section can show every field.
  merged._fullCertificate = detail;
  return merged;
}

function scoreMatch(a, b) {
  let score = 0;
  const tokens = b.split(/[\s,]+/).filter(Boolean);
  for (const t of tokens) {
    if (t.length >= 2 && a.includes(t)) score += t.length;
  }
  return score;
}
