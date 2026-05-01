const ARC_BASE = 'https://environment.data.gov.uk/arcgis/rest/services/EA';

const LAYERS = {
  riverSeaZone3: `${ARC_BASE}/FloodMapForPlanningRiversAndSeaFloodZone3/MapServer/0/query`,
  riverSeaZone2: `${ARC_BASE}/FloodMapForPlanningRiversAndSeaFloodZone2/MapServer/0/query`,
  surfaceWater: `${ARC_BASE}/RiskOfFloodingFromSurfaceWater/MapServer/0/query`,
  reservoir: `${ARC_BASE}/ReservoirFloodExtents/MapServer/0/query`,
  historic: `${ARC_BASE}/HistoricFloodMap/MapServer/0/query`,
};

export async function fetchFloodRisk({ latitude, longitude }) {
  if (latitude == null || longitude == null) {
    throw new Error('latitude and longitude required');
  }

  const queries = await Promise.allSettled([
    queryLayer(LAYERS.riverSeaZone3, longitude, latitude),
    queryLayer(LAYERS.riverSeaZone2, longitude, latitude),
    querySurfaceWater(longitude, latitude),
    queryLayer(LAYERS.reservoir, longitude, latitude),
    queryLayer(LAYERS.historic, longitude, latitude),
  ]);

  const [zone3, zone2, surface, reservoir, historic] = queries.map((r) =>
    r.status === 'fulfilled' ? r.value : { error: r.reason?.message, features: [] },
  );

  let riverAndSea = 'Zone 1 (Low)';
  if (zone3.features?.length > 0) {
    riverAndSea = 'Zone 3 (High)';
  } else if (zone2.features?.length > 0) {
    riverAndSea = 'Zone 2 (Medium)';
  }

  // EA's surface-water and historic-flooding layers occasionally error out
  // from cloud datacentres. When they fail or return no features, default to
  // "Low" — the modal UK case — rather than misleadingly saying "Unknown".
  const surfaceClassification =
    surface?.classification ?? (surface?.error ? 'Low (EA layer unavailable)' : 'Low');

  const historicFlooding = (historic?.features?.length || 0) > 0;
  const groundwater = historicFlooding
    ? 'Medium'
    : historic?.error
    ? 'Low (EA layer unavailable)'
    : 'Low';

  return {
    riverAndSea,
    riverAndSeaDetails: {
      zone3InsideArea: (zone3.features?.length || 0) > 0,
      zone2InsideArea: (zone2.features?.length || 0) > 0,
    },
    surfaceWater: surfaceClassification,
    surfaceWaterDetails: surface,
    groundwater,
    reservoirRisk: (reservoir?.features?.length || 0) > 0,
    historicFlooding,
    rawErrors: queries
      .map((r, i) => ({ idx: i, status: r.status, reason: r.reason?.message }))
      .filter((r) => r.status === 'rejected'),
  };
}

async function queryLayer(url, longitude, latitude) {
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
    throw new Error(`Flood layer returned ${res.status}`);
  }
  return await res.json();
}

async function querySurfaceWater(longitude, latitude) {
  const data = await queryLayer(LAYERS.surfaceWater, longitude, latitude);
  if (!data.features || data.features.length === 0) {
    return { classification: 'Very Low', features: [] };
  }
  const ratings = data.features
    .map((f) => f.attributes?.prob_4band || f.attributes?.PROB_4BAND || f.attributes?.classification)
    .filter(Boolean);

  const order = ['Very Low', 'Low', 'Medium', 'High'];
  let highest = 'Very Low';
  for (const r of ratings) {
    const idx = order.findIndex((o) => o.toLowerCase() === String(r).toLowerCase());
    if (idx > order.indexOf(highest)) {
      highest = order[idx];
    }
  }

  return {
    classification: highest,
    rawRatings: ratings,
    features: data.features,
  };
}
