// VOA (Valuation Office Agency) Non-Domestic Rating List integration.
//
// VOA does NOT publish a clean public REST API for live lookups. The closest
// free options are:
//   1. The public Find a Business Rates Valuation site, which exposes its
//      results as queryable HTML — fragile to scrape.
//   2. The full non-domestic rating list bulk download (CSV), which is ~1GB
//      uncompressed and would need to be indexed in a search engine.
//
// What this module does is the high-leverage middle ground: build correctly-
// formed deep-link URLs into the public site so the user can jump straight
// to a pre-filtered search for a company's registered address. No scraping,
// no quota, no approval needed — and the user lands on official VOA data
// in one click.
//
// If you later want live data, point this module at:
//   https://api.tax.service.gov.uk/non-domestic-rating-find/properties
// and inject a server-side rate limit; this is the same JSON endpoint the
// live page hits behind the scenes.

const VOA_SEARCH_BASE = 'https://www.tax.service.gov.uk/business-rates-find/search';
const VOA_LIST_BASE = 'https://www.gov.uk/government/publications/non-domestic-rating-business-rates-rating-list';

// Build VOA links for a UK company's registered + trading addresses.
// Returns up to a few candidate addresses to check (CH often has both a
// registered and a service address — both are worth searching).
export function buildVoaLinksForCompany(profile) {
  if (!profile) return null;

  const candidates = [];
  const reg = profile.registered_office_address;
  if (reg) candidates.push({ label: 'Registered office', address: reg });

  // Some Companies House records list previous trading names whose addresses
  // also surface in CH /addresses, but the API doesn't expose them on the
  // basic profile call. Stick to the registered office for now.

  const links = candidates
    .map(({ label, address }) => {
      const postcode = (address?.postal_code || '').trim();
      const street = [
        address?.premises,
        address?.address_line_1,
        address?.address_line_2,
      ]
        .filter(Boolean)
        .join(' ');
      if (!postcode) return null;
      const u = new URL(VOA_SEARCH_BASE);
      // The VOA Find page accepts these query keys per the live form names.
      u.searchParams.set('postcode', postcode);
      if (street) u.searchParams.set('street', street);
      return {
        label,
        address: formatAddress(address),
        postcode,
        url: u.toString(),
      };
    })
    .filter(Boolean);

  if (links.length === 0) return null;

  return {
    links,
    note:
      'VOA Find lists every commercial property with a rateable value at the searched address — useful for surfacing offices, shops, warehouses, restaurants, and industrial units the company occupies as ratepayer.',
    bulkDownload: {
      name: 'Full non-domestic rating list (CSV bulk download)',
      url: VOA_LIST_BASE,
      note:
        'For a fuzzy company-name match across all rateable properties in England & Wales, download the full list and grep for the company name. Free, ~1GB.',
    },
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
