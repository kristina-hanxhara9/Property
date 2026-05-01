const BASE_URL = 'https://api.postcodes.io';

export async function lookupPostcode(postcode) {
  const cleaned = String(postcode || '').trim().replace(/\s+/g, '');
  if (!cleaned) {
    throw new Error('Postcode is empty');
  }
  const res = await fetch(`${BASE_URL}/postcodes/${encodeURIComponent(cleaned)}`);
  if (!res.ok) {
    throw new Error(`Postcodes.io returned ${res.status}`);
  }
  const body = await res.json();
  if (body.status !== 200 || !body.result) {
    throw new Error('Postcode not found');
  }
  const r = body.result;
  return {
    postcode: r.postcode,
    latitude: r.latitude,
    longitude: r.longitude,
    adminDistrict: r.admin_district,
    adminWard: r.admin_ward,
    parliamentaryConstituency: r.parliamentary_constituency,
    region: r.region,
    country: r.country,
    nuts: r.nuts,
    codes: r.codes,
  };
}

const POSTCODE_REGEX = /\b([A-Z]{1,2}\d[A-Z\d]?)\s?(\d[A-Z]{2})\b/i;

export function extractPostcode(text) {
  if (!text) return null;
  const match = String(text).toUpperCase().match(POSTCODE_REGEX);
  if (!match) return null;
  return `${match[1]} ${match[2]}`.toUpperCase();
}
