// ONS open data integrations.
// 1. Index of Multiple Deprivation (IMD) decile per LSOA via the
//    opendatacommunities SPARQL endpoint (free, no key).
// 2. Index of Private Housing Rental Prices (IPHRP) — UK headline growth
//    rate via the ONS beta API.

const SPARQL_ENDPOINT = 'https://opendatacommunities.org/sparql';

export async function fetchImdDecile(lsoaCode) {
  if (!lsoaCode) return null;

  const query = `
    PREFIX imd: <http://opendatacommunities.org/def/IMD>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
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
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } });

  if (!res.ok) {
    throw new Error(`IMD SPARQL query returned ${res.status}`);
  }
  const body = await res.json();
  const row = body?.results?.bindings?.[0];
  if (!row) return null;

  return {
    decile: numberOrNull(row.decile?.value),
    score: numberOrNull(row.score?.value),
  };
}

// ONS rental data — UK headline IPHRP growth rate (% YoY).
// Beta API: https://api.beta.ons.gov.uk/v1
const ONS_BASE = 'https://api.beta.ons.gov.uk/v1';

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
  } catch (err) {
    return null;
  }
}

// ONS regional rental growth — uses region code (e.g. London E12000007).
// Useful to give context against the local authority.
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
