// Ground hazards via the British Geological Survey (BGS) GeoIndex
// public ArcGIS REST services. Free, no key required — same pattern as the
// Environment Agency flood layers we already use.
//
// Each layer is queried with a point intersection. The response contains
// any features whose polygon contains the lat/lng. Severity is read from
// the feature's attributes (varies per layer — we normalise).
//
// Layers covered:
//   - Indicative radon band (UKHSA / BGS joint Atlas)
//   - Ground stability hazards (compressible / collapsible / shrink-swell /
//     soluble / landslides / running sand)
//   - Coal mining reporting area

const BGS_BASE = 'https://map.bgs.ac.uk/arcgis/rest/services';

// Hazards (GeoIndex/Hazards) layer indices — BGS publishes 6 layers:
//   0 — Compressible ground
//   1 — Collapsible deposits
//   2 — Landslide hazard
//   3 — Running sand
//   4 — Shrink-swell clay
//   5 — Soluble rocks (dissolution)
const HAZARDS_LAYER_BASE = `${BGS_BASE}/GeoIndex/Hazards/MapServer`;
const HAZARDS_LAYERS = {
  compressibleGround: 0,
  collapsibleDeposits: 1,
  landslide: 2,
  runningSand: 3,
  shrinkSwell: 4,
  solubleRocks: 5,
};

// Radon — UKHSA Indicative Atlas of Radon, hosted on BGS infrastructure.
// Single layer returns the band 1-5 for the point.
const RADON_LAYER = `${BGS_BASE}/GeoIndex/Radon/MapServer/0`;

// Coal Mining — Coal Authority data hosted on BGS infrastructure.
// Layer 0 = "Coal mining reporting area" boundary.
const COAL_LAYER = `${BGS_BASE}/CoalAuthority/CoalAuthority_OS/MapServer/0`;

export async function fetchGroundHazards({ latitude, longitude }) {
  if (latitude == null || longitude == null) {
    throw new Error('latitude and longitude required');
  }

  const hazardPromises = Object.entries(HAZARDS_LAYERS).map(async ([key, idx]) => {
    const url = `${HAZARDS_LAYER_BASE}/${idx}/query`;
    const features = await queryPoint(url, longitude, latitude);
    return [key, features];
  });

  const [hazardResults, radonResult, coalResult] = await Promise.allSettled([
    Promise.all(hazardPromises),
    queryPoint(`${RADON_LAYER}/query`, longitude, latitude),
    queryPoint(`${COAL_LAYER}/query`, longitude, latitude),
  ]);

  const hazards = {};
  const errors = [];

  if (hazardResults.status === 'fulfilled') {
    for (const [key, features] of hazardResults.value) {
      hazards[key] = normaliseHazard(key, features);
    }
  } else {
    errors.push({ source: 'BGS hazards', error: hazardResults.reason?.message });
  }

  let radon = null;
  if (radonResult.status === 'fulfilled') {
    radon = normaliseRadon(radonResult.value);
  } else {
    errors.push({ source: 'BGS radon', error: radonResult.reason?.message });
  }

  let coalMining = null;
  if (coalResult.status === 'fulfilled') {
    const features = coalResult.value;
    coalMining = {
      withinReportingArea: features.length > 0,
      details: features.map((f) => f.attributes || {}),
    };
  } else {
    errors.push({ source: 'BGS coal', error: coalResult.reason?.message });
  }

  // Compute an overall stability rating from the hazard layers.
  const stabilityRating = computeOverallStability(hazards);

  return {
    radon,
    coalMining,
    hazards,
    stabilityRating,
    errors,
  };
}

async function queryPoint(url, longitude, latitude) {
  const params = new URLSearchParams({
    geometry: `${longitude},${latitude}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'false',
    f: 'json',
  });
  const res = await fetch(`${url}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`BGS layer returned ${res.status}`);
  }
  const data = await res.json();
  return data?.features || [];
}

// BGS hazard layers store a numeric severity (typically 0-5 or A-E in the
// `class` / `hazard` / `category` attribute). We pick whichever attribute
// looks most like a severity and normalise to a label.
function normaliseHazard(key, features) {
  if (!features || features.length === 0) {
    return { present: false, severity: 'None / very low', features: [] };
  }
  // Find the most severe feature
  let highest = 0;
  let highestLabel = 'Unknown';
  for (const f of features) {
    const attrs = f.attributes || {};
    const severity =
      pickSeverity(attrs, ['HAZARD', 'class', 'CLASS', 'class_text', 'category']) ||
      attrs.HAZARD ||
      attrs.class ||
      'Unknown';
    const num = severityNumber(severity);
    if (num > highest) {
      highest = num;
      highestLabel = String(severity);
    }
  }
  return {
    present: true,
    severity: highestLabel,
    severityScore: highest,
    features: features.map((f) => f.attributes || {}),
  };
}

function pickSeverity(attrs, candidateKeys) {
  for (const k of candidateKeys) {
    if (attrs[k] != null) return attrs[k];
  }
  return null;
}

function severityNumber(value) {
  if (value == null) return 0;
  const s = String(value).toUpperCase();
  if (/VERY HIGH/.test(s)) return 5;
  if (/HIGH/.test(s)) return 4;
  if (/MEDIUM|MODERATE/.test(s)) return 3;
  if (/LOW/.test(s) && !/VERY LOW/.test(s)) return 2;
  if (/VERY LOW/.test(s)) return 1;
  if (/^[A-E]$/.test(s)) {
    return { A: 1, B: 2, C: 3, D: 4, E: 5 }[s] || 0;
  }
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  return 0;
}

function normaliseRadon(features) {
  if (!features || features.length === 0) {
    return { band: 1, label: 'Band 1 (lowest)', percentageHomes: '<1%' };
  }
  const attrs = features[0].attributes || {};
  // BGS radon layer attributes typically include CLASS_NUM (1-5) and CLASS
  // (descriptive). We tolerate a few key name variants.
  const band =
    numberOrNull(attrs.CLASS_NUM) ||
    numberOrNull(attrs.class_num) ||
    numberOrNull(attrs.RADON_BAND) ||
    numberOrNull(attrs.radon_band) ||
    null;
  const label =
    attrs.CLASS ||
    attrs.class_text ||
    attrs.DESCRIPTION ||
    attrs.description ||
    null;
  return {
    band,
    label: label || (band ? `Band ${band}` : 'Unknown'),
    percentageHomes: percentageHomesForBand(band),
    rawAttributes: attrs,
  };
}

function percentageHomesForBand(band) {
  // Per UKHSA / BGS Indicative Atlas guidance
  const map = {
    1: '<1% of homes above Action Level',
    2: '1-3% of homes above Action Level',
    3: '3-5% of homes above Action Level',
    4: '5-10% of homes above Action Level',
    5: '10-30% of homes above Action Level',
  };
  return map[band] || null;
}

function computeOverallStability(hazards) {
  // Pick the highest severity across all hazard layers.
  let max = 0;
  for (const v of Object.values(hazards)) {
    if (v?.severityScore > max) max = v.severityScore;
  }
  if (max >= 4) return 'High';
  if (max >= 3) return 'Medium';
  if (max >= 2) return 'Low';
  return 'Very low';
}

function numberOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
