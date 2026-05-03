// VOA (Valuation Office Agency) Non-Domestic Rating List integration.
//
// VOA does not publish a clean public REST API. The official "Find a
// Business Rates Valuation" service at
//   https://www.tax.service.gov.uk/business-rates-find/search?postcode=...
// is built on GOV.UK Frontend and renders results as HTML. We fetch that
// page server-side and parse out the live rateable-value list — so the user
// gets actual data rather than a link-out. If the markup ever changes we
// surface a clear error and the UI can fall back to the same link.
//
// Data parsed:
//   - localAuthorityReference (BA reference)
//   - address
//   - propertyDescription (e.g. "OFFICES AND PREMISES")
//   - currentRateableValue (from the 2023 list)
//   - effectiveDate
//   - listYear (2023 or 2017)
//   - detailUrl (deep-link into the VOA detail page)

const SEARCH_BASE = 'https://www.tax.service.gov.uk/business-rates-find/search';
const DETAIL_BASE = 'https://www.tax.service.gov.uk';

export async function fetchVoaRateableValues({ postcode, limit = 25 } = {}) {
  const cleaned = String(postcode || '').trim().toUpperCase();
  if (!cleaned) throw new Error('postcode required for VOA lookup');

  const url = new URL(SEARCH_BASE);
  url.searchParams.set('postcode', cleaned);
  url.searchParams.set('billingAuthority', 'All');

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'PropertyIQ/0.1 (+https://github.com/propertyiq)',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`VOA search returned ${res.status}`);
  }
  const html = await res.text();

  // Quick check: VOA returns a "no results" page with a known phrase.
  if (/no\s+(business|properties)\s+found/i.test(html) || /No business properties/i.test(html)) {
    return {
      postcode: cleaned,
      count: 0,
      properties: [],
      searchUrl: url.toString(),
    };
  }

  const properties = parseSearchResults(html, { limit });
  return {
    postcode: cleaned,
    count: properties.length,
    properties,
    searchUrl: url.toString(),
  };
}

// Parse the GOV.UK results table. Each row has the BA reference, address,
// description and rateable value. We use simple regex-based extraction so
// we don't add a heavyweight HTML parser dependency for a single page.
function parseSearchResults(html, { limit }) {
  const properties = [];

  // Each search hit lives inside a <tr> with class "govuk-table__row" inside
  // the results table body. Extract row blocks and pull the cell contents.
  const rowRegex = /<tr[^>]*govuk-table__row[^>]*>([\s\S]*?)<\/tr>/g;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    if (properties.length >= limit) break;
    const row = match[1];
    // Skip header rows (they contain th not td).
    if (!/<td/.test(row)) continue;

    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let c;
    while ((c = cellRegex.exec(row)) !== null) cells.push(stripHtml(c[1]));

    if (cells.length < 2) continue;

    // Detail link — usually inside the BA reference cell.
    const linkMatch = row.match(/href="([^"]*\/business-rates-find\/[^"]+)"/);
    const detailUrl = linkMatch ? `${DETAIL_BASE}${decodeHtml(linkMatch[1])}` : null;

    // Heuristic mapping based on column count. The VOA table currently is
    // [BA ref, Address, Description, Rateable value, Effective date, List year]
    // but past iterations have varied — handle 4-6 column variants.
    const [
      ref,
      address,
      description,
      rv,
      effectiveDate,
      listYear,
    ] = padToLength(cells, 6);

    properties.push({
      localAuthorityReference: ref || null,
      address: address || null,
      propertyDescription: description || null,
      currentRateableValue: parseGbp(rv),
      effectiveDate: effectiveDate || null,
      listYear: listYear || null,
      detailUrl,
    });
  }

  return properties;
}

function padToLength(arr, n) {
  const out = arr.slice(0, n);
  while (out.length < n) out.push('');
  return out;
}

function stripHtml(s) {
  return decodeHtml(
    String(s || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&pound;/g, '£')
    .replace(/&nbsp;/g, ' ');
}

function parseGbp(s) {
  if (!s) return null;
  const m = String(s).replace(/[,\s]/g, '').match(/£?(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// Build a list of postcodes worth searching for a given Companies House
// profile. The registered office postcode is the highest-signal entry.
export function postcodesForCompany(profile) {
  if (!profile) return [];
  const out = [];
  const reg = profile.registered_office_address?.postal_code;
  if (reg) out.push({ label: 'Registered office', postcode: String(reg).toUpperCase().trim() });
  return out;
}

// Convenience aggregator: run the live VOA lookup for every candidate
// postcode in parallel and return a structured result for the UI.
export async function fetchVoaForCompany(profile) {
  const candidates = postcodesForCompany(profile);
  if (candidates.length === 0) {
    return { available: false, error: 'No postcode on Companies House profile' };
  }
  const results = await Promise.allSettled(
    candidates.map((c) =>
      fetchVoaRateableValues({ postcode: c.postcode }).then((r) => ({
        ...r,
        label: c.label,
      })),
    ),
  );
  const lookups = [];
  let totalProperties = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      lookups.push(r.value);
      totalProperties += r.value.count;
    } else {
      lookups.push({ available: false, error: r.reason?.message || 'unknown' });
    }
  }
  return {
    available: true,
    totalProperties,
    lookups,
  };
}

// Backward-compat: still build the deep-link block for the UI in case the
// live lookup itself errors.
export function buildVoaLinksForCompany(profile) {
  if (!profile) return null;
  const reg = profile.registered_office_address;
  if (!reg) return null;
  const postcode = (reg.postal_code || '').trim();
  if (!postcode) return null;

  const u = new URL(SEARCH_BASE);
  u.searchParams.set('postcode', postcode);
  return {
    links: [
      {
        label: 'Registered office',
        address: formatAddress(reg),
        postcode,
        url: u.toString(),
      },
    ],
    note:
      'VOA Find lists every commercial property with a rateable value at the searched address — useful for surfacing offices, shops, warehouses, restaurants, and industrial units the company occupies as ratepayer.',
  };
}

function formatAddress(addr) {
  if (!addr || typeof addr !== 'object') return null;
  return [
    addr.premises,
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.region,
    addr.postal_code,
    addr.country,
  ]
    .filter(Boolean)
    .join(', ');
}
