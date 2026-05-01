// Free pointers to authoritative sources where there's no clean
// postcode-keyed JSON API. We surface the link in the report rather than
// fabricating a value.

export function buildRadonLink(postcode) {
  return {
    name: 'UK Radon — Indicative Atlas',
    url: 'https://www.ukradon.org/information/ukmaps',
    note: postcode
      ? `Open the UK Radon map and search ${postcode} to read the indicative band (1=lowest, 5=highest).`
      : 'Open the UK Radon map to read the indicative band for your postcode.',
  };
}

export function buildGroundStabilityLink(postcode) {
  return {
    name: 'BGS GeoIndex',
    url: 'https://mapapps2.bgs.ac.uk/geoindex/home.html',
    note: 'British Geological Survey GeoIndex — free hazard map. Search by postcode to view ground stability, dissolution, soluble rocks and shrink/swell layers.',
  };
}

export function buildMiningLink(postcode) {
  return {
    name: 'Coal Authority Interactive Map',
    url: 'https://mapapps2.bgs.ac.uk/coalauthority/home.html',
    note: 'Coal Authority free map — confirms whether the property sits within a coalfield reporting area. Full Mining Report (£30) recommended for any property within one.',
  };
}

export function buildPlanItLink(postcode) {
  if (!postcode) return null;
  const q = encodeURIComponent(postcode);
  return {
    name: 'PlanIt UK Planning Search',
    url: `https://www.planit.org.uk/find/applications/postcode/${q}`,
    note: 'Live planning application history aggregated across UK Local Planning Authorities — free public search.',
  };
}
