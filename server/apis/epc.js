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
const NEW_DOMESTIC_SEARCH_PATH = '/api/domestic/search';
const NEW_NON_DOMESTIC_SEARCH_PATH = '/api/non-domestic/search';
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
      searchPath: searchPath || null, // null means try both domestic + non-domestic
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
  // Try domestic and non-domestic search endpoints in turn so commercial
  // properties (e.g. 1 Canada Square) also resolve. If `searchPath` is
  // explicitly set via env var, use only that one.
  const pathsToTry = searchPath
    ? [searchPath]
    : [NEW_DOMESTIC_SEARCH_PATH, NEW_NON_DOMESTIC_SEARCH_PATH];

  let allRecords = [];
  let firstError = null;
  let domesticHit = false;
  let nonDomesticHit = false;
  let pagination = null;
  let rawResponses = {};

  for (const path of pathsToTry) {
    const searchUrl = new URL(`${baseUrl}${path}`);
    searchUrl.searchParams.set(postcodeParam, postcode);

    let res;
    try {
      res = await fetch(searchUrl, { headers: { ...auth, Accept: 'application/json' } });
    } catch (err) {
      firstError ||= err;
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      let body = '';
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw new Error(
        `EPC API ${res.status} (Bearer auth, ${searchUrl.host}): ${body.slice(0, 200).replace(/\s+/g, ' ').trim() || 'Not authorized'}`,
      );
    }
    if (res.status === 429) throw new Error('EPC API rate-limited (429). Back off and retry.');
    if (res.status === 404) {
      // No records for this path — keep trying other paths
      continue;
    }
    if (!res.ok) {
      let body = '';
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      firstError ||= new Error(
        `EPC search ${res.status} from ${searchUrl.host}${path}: ${body.slice(0, 200).replace(/\s+/g, ' ').trim()}`,
      );
      continue;
    }

    const body = await res.json();
    const records = extractRecords(body);

    if (records.length > 0) {
      // Tag each record with which kind of certificate it came from
      const kind = path.includes('non-domestic')
        ? 'non-domestic'
        : path.includes('display')
        ? 'display'
        : 'domestic';
      if (kind === 'non-domestic') nonDomesticHit = true;
      if (kind === 'domestic') domesticHit = true;
      records.forEach((r) => (r._epcKind = kind));
      allRecords = allRecords.concat(records);
      pagination = pagination || body?.pagination || null;
      rawResponses[kind] = body;
    }
  }

  if (allRecords.length === 0 && firstError) {
    throw firstError;
  }

  // Fetch full detail for the best-matched certificate
  const bestRecord = pickBestSearchRecord(allRecords, addressFragment);
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
    count: allRecords.length,
    domesticHit,
    nonDomesticHit,
    pagination,
    results: allRecords.map(normaliseSearchRecord),
    detail,
    detailError,
    rawSearchResponses: rawResponses,
  };
}

function extractRecords(body) {
  // The docs show {"data": [...]} but published examples have a typo with
  // an extra brace. Tolerate variants.
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (body?.data && Array.isArray(body.data?.records)) return body.data.records;
  if (Array.isArray(body?.records)) return body.records;
  return [];
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
