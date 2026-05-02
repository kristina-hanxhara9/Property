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
    const rels = body?.data?.relationships || {};
    const included = body?.included || [];

    // 1. Try direct attributes (older API shape)
    let imdDecile = pickFirstNumber(
      attr.imd2019_decile,
      attr['imd2019_decile_(la_aware)'],
      attr.imd_2019_decile,
      attr.imd_decile,
      attr.imd2015_decile,
      attr.imd_decile_2019,
      attr.imd_eng_2019_decile,
    );
    let imdRank = pickFirstNumber(
      attr.imd2019_rank,
      attr.imd_2019_rank,
      attr.imd_rank,
      attr.imd_eng_2019_rank,
    );
    let imdScore = pickFirstNumber(
      attr.imd2019_score,
      attr.imd_2019_score,
      attr.imd_score,
      attr.imd_eng_2019_score,
    );

    // 2. Try JSON:API `relationships` + `included` (newer API shape).
    // The IMD info is delivered as a related resource; find it by type.
    if (imdDecile == null) {
      const imdResource = included.find(
        (i) =>
          /imd/i.test(i.type || '') ||
          /imd/i.test(i.id || '') ||
          (i.attributes && /imd/i.test(JSON.stringify(i.attributes))),
      );
      if (imdResource) {
        const a = imdResource.attributes || {};
        imdDecile =
          imdDecile ||
          pickFirstNumber(a.decile, a.imd_decile, a.imd2019_decile, a.IMDDecil);
        imdRank = imdRank || pickFirstNumber(a.rank, a.imd_rank, a.imd2019_rank, a.IMDRank);
        imdScore = imdScore || pickFirstNumber(a.score, a.imd_score, a.imd2019_score, a.IMDScore);
      }
    }

    // 3. Last resort — scan everything for any *decile / *rank field
    if (imdDecile == null) {
      const everyField = collectAllFields(body);
      imdDecile = imdDecile || findByName(everyField, /imd.*decile|decile.*imd|^decile$/i);
      imdRank = imdRank || findByName(everyField, /imd.*rank|rank.*imd|^rank$/i);
      imdScore = imdScore || findByName(everyField, /imd.*score|score.*imd|^score$/i);
    }

    return {
      postcode: attr.pcds || cleaned,
      lsoa: attr.lsoa11 || attr.lsoa21 || null,
      msoa: attr.msoa11 || attr.msoa21 || null,
      imdDecile,
      imdRank,
      imdScore,
      ruralUrban: attr.ru11ind || attr.ruc21ind || null,
      adminCounty: attr.admin_county || null,
      adminDistrict: attr.admin_district || null,
      adminWard: attr.admin_ward || null,
      parishOrCommunity: attr.parish || null,
      parliamentaryConstituency: attr.parliamentary_constituency || null,
      ccg: attr.ccg || null,
      nuts: attr.nuts || null,
      raw: body,
      _availableKeys: [
        ...Object.keys(attr).filter((k) => /imd|deprivation|decile|rank/i.test(k)),
        ...included.map((i) => `included:${i.type || i.id}`),
      ],
    };
  } catch {
    return null;
  }
}

function collectAllFields(obj, fields = {}, prefix = '') {
  if (!obj || typeof obj !== 'object') return fields;
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      collectAllFields(v, fields, fullKey);
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => collectAllFields(item, fields, `${fullKey}[${i}]`));
    } else {
      fields[fullKey] = v;
    }
  }
  return fields;
}

function findByName(fields, pattern) {
  for (const [name, value] of Object.entries(fields)) {
    if (pattern.test(name)) {
      const n = numberOrNull(value);
      if (n != null) return n;
    }
  }
  return null;
}

function pickFirstNumber(...values) {
  for (const v of values) {
    const n = numberOrNull(v);
    if (n != null) return n;
  }
  return null;
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
