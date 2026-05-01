// Authoritative open links to source agencies. We surface the link rather
// than fabricating a value because none of these agencies expose a free
// postcode-keyed JSON API for the data points we'd want to display.

export function buildRadonLink(postcode) {
  return {
    name: 'UKHSA — UK Radon Indicative Atlas',
    agency: 'UK Health Security Agency (UKHSA)',
    url: 'https://www.ukradon.org/information/ukmaps',
    note: postcode
      ? `Open the official UKHSA radon atlas. Search ${postcode} to read the indicative band (1 = lowest risk, 5 = highest).`
      : 'Open the official UKHSA radon atlas to read the indicative band for the property.',
  };
}

export function buildGroundStabilityLink(postcode) {
  return {
    name: 'British Geological Survey — GeoIndex Map',
    agency: 'British Geological Survey (BGS)',
    url: 'https://www.bgs.ac.uk/map-viewers/geoindex-onshore/',
    note:
      'Official BGS hazard map viewer. Activate the "Ground stability", "Soluble rocks" and "Shrink/swell" layers, then search the postcode.',
  };
}

export function buildMiningLink(postcode) {
  return {
    name: 'GOV.UK — Check coal mining reports',
    agency: 'Mining Remediation Authority (formerly Coal Authority)',
    url: 'https://www.gov.uk/check-coal-mining-reports',
    note:
      'Official GOV.UK coal mining check. Order a free interactive map check or a paid Coal Mining Report (~£30) — recommended for any property in a former coalfield area.',
  };
}

// PlanIt is kept as an aggregated supplemental link only — for users who want
// cross-LPA history. The primary planning link is now the LPA's own website,
// constructed from planning.data.gov.uk data in server.js.
export function buildPlanItLink(postcode) {
  if (!postcode) return null;
  const q = encodeURIComponent(postcode);
  return {
    name: 'PlanIt UK — supplementary cross-LPA history',
    agency: 'PlanIt (independent aggregator)',
    url: `https://www.planit.org.uk/find/applications/postcode/${q}`,
    note:
      'Independent aggregator that cross-indexes UK Local Planning Authorities. Useful as a backup when an LPA portal is hard to navigate.',
  };
}

// Build a primary link to the Local Planning Authority's own planning portal.
// Most UK LPAs run Idox Public Access at predictable URL shapes; if the
// planning.data.gov.uk record gives us a website we use it directly. As a
// last resort we fall back to a Google search scoped to the LPA name.
export function buildLpaPlanningLink({ lpaName, lpaWebsite, postcode }) {
  if (!lpaName) return null;

  // 1. Use the LPA's own website if planning.data.gov.uk gave us one
  if (lpaWebsite) {
    const cleaned = String(lpaWebsite).replace(/\/+$/, '');
    return {
      name: `${lpaName} — official planning portal`,
      agency: lpaName,
      url: cleaned,
      note: `Open ${lpaName}'s own planning portal and search by ${postcode || 'postcode'}.`,
    };
  }

  // 2. Otherwise, fall back to a tightly-scoped Google search that lands on
  //    the LPA's planning pages.
  const q = encodeURIComponent(`${lpaName} planning applications ${postcode || ''}`.trim());
  return {
    name: `${lpaName} — planning portal (search)`,
    agency: lpaName,
    url: `https://www.google.com/search?q=${q}`,
    note: `Search Google for ${lpaName}'s planning applications portal — the top result is almost always the official council site.`,
  };
}

// ONS Local Authority area profile — comprehensive demographic and economic
// data for the LA, by ONS area code. The Postcodes.io response gives us the
// admin_district code (e.g. E09000030 for Tower Hamlets).
export function buildOnsAreaProfileLink({ adminDistrictCode, adminDistrictName }) {
  if (!adminDistrictCode) return null;
  return {
    name: `ONS — ${adminDistrictName || 'Local Authority'} area profile`,
    agency: 'Office for National Statistics (ONS)',
    url: `https://www.ons.gov.uk/visualisations/customprofiles/build/#${adminDistrictCode}`,
    note: `Official ONS profile for ${adminDistrictName || 'this Local Authority'}: population, income, employment, housing, deprivation, education and more.`,
  };
}
