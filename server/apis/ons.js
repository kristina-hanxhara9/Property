// ONS / deprivation / rental data integrations.
//
//   IMD (deprivation) — primary lookup via findthatpostcode.uk which
//   wraps multiple ONS datasets and returns IMD2019 decile + score by
//   postcode in a single clean JSON call. Free, no key.
//   Fallback: opendatacommunities SPARQL (often returns HTML; treated
//   as a soft failure).
//
//   ONS Index of Private Housing Rental Prices — UK headline value via
//   the ONS Beta API.

const FTP_BASE = 'https://findthatpostcode.uk';
const SPARQL_ENDPOINT = 'https://opendatacommunities.org/sparql';
const ONS_BASE = 'https://api.beta.ons.gov.uk/v1';

// Primary IMD lookup — postcode-keyed, returns rich demographic metadata
// including IMD2019 decile, deprivation score, area code, parliamentary
// constituency, and a bundle of ONS classifications.
export async function fetchPostcodeDemographics(postcode) {
  if (!postcode) return null;
  const cleaned = String(postcode).trim().replace(/\s+/g, '');
  const url = `${FTP_BASE}/postcodes/${encodeURIComponent(cleaned)}.json`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim().startsWith('{')) return null;
    const body = JSON.parse(text);
    const attr = body?.data?.attributes || {};

    return {
      postcode: attr.pcds || cleaned,
      lsoa: attr.lsoa11 || null,
      msoa: attr.msoa11 || null,
      imdDecile:
        numberOrNull(attr.imd2019_decile) ||
        numberOrNull(attr.imd_decile) ||
        numberOrNull(attr.imd2015_decile),
      imdRank: numberOrNull(attr.imd2019_rank) || numberOrNull(attr.imd_rank),
      imdScore: numberOrNull(attr.imd2019_score) || numberOrNull(attr.imd_score),
      ruralUrban: attr.ru11ind || null,
      adminCounty: attr.admin_county || null,
      adminDistrict: attr.admin_district || null,
      adminWard: attr.admin_ward || null,
      parishOrCommunity: attr.parish || null,
      parliamentaryConstituency: attr.parliamentary_constituency || null,
      ccg: attr.ccg || null,
      nuts: attr.nuts || null,
      raw: body,
    };
  } catch {
    return null;
  }
}

// Legacy IMD-only lookup via SPARQL — kept as a fallback when
// findthatpostcode is unavailable.
export async function fetchImdDecile(lsoaCode) {
  if (!lsoaCode) return null;

  const query = `
    PREFIX imd: <http://opendatacommunities.org/def/IMD>
    SELECT ?decile ?score WHERE {
      ?obs <http://opendatacommunities.org/def/ontology/geography/refArea>
           <http://opendatacommunities.org/id/geography/lsoa/${lsoaCode}> .
      ?obs <http://opendatacommunities.org/def/IMD#imdDecile> ?decile .
      OPTIONAL {
        ?obs <http://opendatacommunities.org/def/IMD#imdScore> ?score .
      }
    }
    LIMIT 1
  `;
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&output=json`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim().startsWith('{')) return null;
    const body = JSON.parse(text);
    const row = body?.results?.bindings?.[0];
    if (!row) return null;
    return {
      decile: numberOrNull(row.decile?.value),
      score: numberOrNull(row.score?.value),
    };
  } catch {
    return null;
  }
}

export async function fetchOnsRentalGrowth() {
  const url = `${ONS_BASE}/datasets/index-private-housing-rental-prices/editions/time-series/versions/latest/observations?time=*&geography=K02000001&time_record_count=1`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`ONS API returned ${res.status}`);
    const body = await res.json();
    const obs = body?.observations?.[0];
    if (!obs) return null;
    return {
      time: obs?.dimensions?.Time?.label || obs?.dimensions?.Time?.id || null,
      indexValue: numberOrNull(obs?.observation),
      area: 'United Kingdom',
      sourceUrl:
        'https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/indexofprivatehousingrentalprices',
    };
  } catch {
    return null;
  }
}

export async function fetchOnsRegionalRentalGrowth(regionCode) {
  if (!regionCode) return null;
  const url = `${ONS_BASE}/datasets/index-private-housing-rental-prices/editions/time-series/versions/latest/observations?time=*&geography=${regionCode}&time_record_count=1`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const body = await res.json();
    const obs = body?.observations?.[0];
    if (!obs) return null;
    return {
      time: obs?.dimensions?.Time?.label || null,
      indexValue: numberOrNull(obs?.observation),
      regionCode,
    };
  } catch {
    return null;
  }
}

function numberOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
