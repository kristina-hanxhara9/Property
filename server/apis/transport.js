// Transport / connectivity via the OpenStreetMap Overpass API.
// Free, public, no key. Returns nearest train/tube/bus stops within a radius.
// Docs: https://wiki.openstreetmap.org/wiki/Overpass_API

const OVERPASS = 'https://overpass-api.de/api/interpreter';

export async function fetchNearbyTransport({ latitude, longitude, radiusMeters = 1500 }) {
  if (latitude == null || longitude == null) {
    throw new Error('latitude and longitude required');
  }

  // Overpass QL — find railway stations, tube stations, and tram stops
  // within radius. Includes Network Rail, TfL Underground, DLR, Overground,
  // Elizabeth line, trams, and metro systems.
  const query = `
    [out:json][timeout:15];
    (
      node["railway"="station"](around:${radiusMeters},${latitude},${longitude});
      node["railway"="halt"](around:${radiusMeters},${latitude},${longitude});
      node["station"="subway"](around:${radiusMeters},${latitude},${longitude});
      node["public_transport"="station"](around:${radiusMeters},${latitude},${longitude});
      node["highway"="bus_stop"](around:${Math.min(radiusMeters, 500)},${latitude},${longitude});
    );
    out body;
  `;

  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'PropertyIQ/0.1',
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass API returned ${res.status}`);
  }
  const body = await res.json();
  const elements = body?.elements || [];

  const stations = [];
  const busStops = [];

  for (const el of elements) {
    const tags = el.tags || {};
    const dist = haversineMeters(latitude, longitude, el.lat, el.lon);
    const item = {
      name: tags.name || tags['name:en'] || 'Unnamed',
      operator: tags.operator || null,
      network: tags.network || null,
      ref: tags.ref || null,
      distanceMeters: Math.round(dist),
      latitude: el.lat,
      longitude: el.lon,
      tags,
    };

    if (tags.highway === 'bus_stop') {
      busStops.push(item);
    } else {
      // Categorise the station type
      if (tags.station === 'subway' || tags['railway:type'] === 'metro') {
        item.type = 'Underground / Metro';
      } else if (tags.train === 'yes' || tags.railway === 'station') {
        item.type = 'Train';
      } else if (tags.light_rail === 'yes' || tags.tram === 'yes') {
        item.type = 'Tram / Light rail';
      } else {
        item.type = tags.public_transport || 'Station';
      }
      stations.push(item);
    }
  }

  stations.sort((a, b) => a.distanceMeters - b.distanceMeters);
  busStops.sort((a, b) => a.distanceMeters - b.distanceMeters);

  // Closest station for the headline
  const closestStation = stations[0] || null;

  return {
    closestStation,
    stations: stations.slice(0, 8),
    busStops: busStops.slice(0, 5),
    stationCount: stations.length,
    busStopCount: busStops.length,
    walkTimeMinutesToClosestStation: closestStation
      ? Math.round(closestStation.distanceMeters / 80)
      : null,
    source: 'OpenStreetMap (Overpass API)',
  };
}

// Great-circle distance via haversine formula
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
