// VAT verification — uses HMRC's official VAT lookup API when configured,
// EU VIES as a free no-key fallback for XI (Northern Ireland) numbers, and
// a basic format check as a last resort.
//
// The HMRC API requires OAuth2 credentials (free, but you must register an
// app at developer.service.hmrc.gov.uk). When HMRC_CLIENT_ID and
// HMRC_CLIENT_SECRET are configured, this module obtains and caches an
// application access token, then verifies VAT numbers in real-time.
//
// Note on Brexit: GB VAT numbers were removed from the EU VIES service in
// January 2021. For GB verification you need HMRC's API. For XI (Northern
// Ireland Protocol) numbers, VIES still works.

const HMRC_BASE = 'https://api.service.hmrc.gov.uk';
const HMRC_TOKEN_URL = `${HMRC_BASE}/oauth/token`;
const VIES_BASE = 'https://ec.europa.eu/taxation_customs/vies/rest-api';

// Cached access token for the HMRC application (4-hour TTL on the live API).
let hmrcToken = null;
let hmrcTokenExpiresAt = 0;

export async function verifyVatNumber(rawVatNumber, { hmrcClientId, hmrcClientSecret } = {}) {
  if (!rawVatNumber) {
    return { found: false, error: 'No VAT number provided.' };
  }

  // Normalise — strip spaces, hyphens, uppercase. UK formats:
  //   GB123456789  (9 digits standard)
  //   GB123456789012 (12 digits with branch code)
  //   GBGD123 (government dept) / GBHA123 (health authority)
  //   XI123456789 (NI Protocol)
  const cleaned = String(rawVatNumber).toUpperCase().replace(/[\s-]/g, '');
  const formatCheck = checkFormat(cleaned);
  if (!formatCheck.valid) {
    return {
      found: false,
      provided: cleaned,
      formatValid: false,
      error: formatCheck.reason,
    };
  }

  // 1. XI (Northern Ireland) → use VIES (free, no key)
  if (cleaned.startsWith('XI')) {
    try {
      const vies = await viesLookup(cleaned);
      return {
        ...vies,
        provided: cleaned,
        formatValid: true,
        verificationMethod: 'EU VIES (Northern Ireland Protocol)',
      };
    } catch (err) {
      return {
        found: false,
        provided: cleaned,
        formatValid: true,
        error: `VIES verification failed: ${err.message}`,
      };
    }
  }

  // 2. GB → use HMRC API if configured
  if (cleaned.startsWith('GB')) {
    if (hmrcClientId && hmrcClientSecret) {
      try {
        const hmrc = await hmrcLookup(cleaned, { hmrcClientId, hmrcClientSecret });
        return {
          ...hmrc,
          provided: cleaned,
          formatValid: true,
          verificationMethod: 'HMRC Check VAT Number Lookup API',
        };
      } catch (err) {
        return {
          found: false,
          provided: cleaned,
          formatValid: true,
          error: `HMRC verification failed: ${err.message}`,
          verificationMethod: 'HMRC API (failed)',
        };
      }
    }
    return {
      found: false,
      provided: cleaned,
      formatValid: true,
      error:
        'HMRC API not configured (set HMRC_CLIENT_ID + HMRC_CLIENT_SECRET on the server). Format is valid but cannot verify in real time.',
      verificationMethod: 'Format check only',
    };
  }

  return {
    found: false,
    provided: cleaned,
    formatValid: true,
    error: `VAT prefix not recognised. Supported: GB (UK), XI (Northern Ireland).`,
  };
}

function checkFormat(vat) {
  if (vat.length < 4) return { valid: false, reason: 'Too short to be a valid VAT number.' };
  // GB + 9 digits, optionally + 3 digit branch
  if (/^GB\d{9}(\d{3})?$/.test(vat)) return { valid: true };
  // GB government departments / health authorities
  if (/^GB(GD|HA)\d{3}$/.test(vat)) return { valid: true };
  // XI (Northern Ireland)
  if (/^XI\d{9}(\d{3})?$/.test(vat)) return { valid: true };
  return {
    valid: false,
    reason: `"${vat}" doesn't match GB+9 digits, GB+12 digits, GBGD+3, GBHA+3 or XI+9 patterns.`,
  };
}

async function hmrcLookup(vat, { hmrcClientId, hmrcClientSecret }) {
  const token = await getHmrcAccessToken({ hmrcClientId, hmrcClientSecret });
  const numberOnly = vat.replace(/^GB/, '');
  const url = `${HMRC_BASE}/organisations/vat/check-vat-number/lookup/${numberOnly}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.hmrc.2.0+json',
    },
  });
  if (res.status === 404) {
    return { found: false, error: 'VAT number not found in HMRC register.' };
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(`HMRC API ${res.status}: ${body.slice(0, 200)}`);
  }
  const body = await res.json();
  // Response shape: { target: { name, vatNumber, address: {...} } }
  const t = body.target || body;
  return {
    found: true,
    vatNumber: vat,
    vatRegisteredName: t.name || null,
    vatAddress: formatAddress(t.address),
    verifiedActive: true,
    sourceData: body,
  };
}

async function getHmrcAccessToken({ hmrcClientId, hmrcClientSecret }) {
  if (hmrcToken && Date.now() < hmrcTokenExpiresAt - 60000) {
    return hmrcToken;
  }
  const params = new URLSearchParams();
  params.set('client_id', hmrcClientId);
  params.set('client_secret', hmrcClientSecret);
  params.set('grant_type', 'client_credentials');
  params.set('scope', 'read:vat');

  const res = await fetch(HMRC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`HMRC token endpoint returned ${res.status}`);
  }
  const body = await res.json();
  hmrcToken = body.access_token;
  hmrcTokenExpiresAt = Date.now() + (body.expires_in || 14400) * 1000;
  return hmrcToken;
}

async function viesLookup(vat) {
  // VIES expects { countryCode, vatNumber }. For XI numbers strip the
  // "XI" prefix.
  const countryCode = vat.slice(0, 2);
  const numberOnly = vat.slice(2);
  const url = `${VIES_BASE}/check-vat-number`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ countryCode, vatNumber: numberOnly }),
  });
  if (!res.ok) {
    throw new Error(`VIES returned ${res.status}`);
  }
  const body = await res.json();
  if (body.valid === false || body.isValid === false) {
    return { found: false, vatNumber: vat, error: 'VIES marked this number as invalid.' };
  }
  return {
    found: true,
    vatNumber: vat,
    vatRegisteredName: body.name || null,
    vatAddress: body.address || null,
    verifiedActive: Boolean(body.valid || body.isValid),
    sourceData: body,
  };
}

function formatAddress(addr) {
  if (!addr) return null;
  if (typeof addr === 'string') return addr;
  return [
    addr.line1,
    addr.line2,
    addr.line3,
    addr.line4,
    addr.line5,
    addr.line6,
    addr.line7,
    addr.line8,
    addr.postcode,
    addr.countryCode,
  ]
    .filter(Boolean)
    .join(', ');
}
