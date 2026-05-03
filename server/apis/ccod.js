// HM Land Registry CCOD (UK Companies that Own Property in England & Wales)
// and OCOD (Overseas Companies). Free monthly CSV downloads via the official
// HMLR Open Data API.
//
// As of 2024 the dataset endpoint moved behind an API key. Sign-up is free
// at https://use-land-property-data.service.gov.uk/. Set the resulting key
// as LAND_REGISTRY_OPEN_DATA_KEY (or LR_OPEN_DATA_KEY) on the backend.
//
// The API call returns a JSON body with a short-lived presigned S3 URL for
// the actual CSV. We fetch that URL, stream-parse, and index by company
// number. Result is cached for 24 hours.

const API_BASE = 'https://use-land-property-data.service.gov.uk/api/v1/datasets';

// In-memory caches keyed by month (YYYY_MM). Each value is a Map of
// company_number → array of records.
const cache = {
  ccod: { month: null, index: null, fetchedAt: 0, error: null },
  ocod: { month: null, index: null, fetchedAt: 0, error: null },
};

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function searchCorporatePropertyHoldings(companyNumber, { apiKey } = {}) {
  if (!companyNumber) return null;
  const key = apiKey || process.env.LAND_REGISTRY_OPEN_DATA_KEY || process.env.LR_OPEN_DATA_KEY || '';

  const normalised = String(companyNumber).replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const candidates = new Set([
    normalised,
    normalised.replace(/^0+/, ''),
    normalised.padStart(8, '0'),
  ]);

  const [ccod, ocod] = await Promise.allSettled([
    lookupInDataset('ccod', key),
    lookupInDataset('ocod', key),
  ]);

  const summarise = (status, name) => {
    if (status.status === 'rejected') {
      return { available: false, error: status.reason?.message || 'unknown', name };
    }
    const idx = status.value;
    if (!idx) return { available: false, error: 'No index built', name };
    let allMatches = [];
    for (const c of candidates) {
      if (idx.byNumber.has(c)) allMatches = allMatches.concat(idx.byNumber.get(c));
    }
    return {
      available: true,
      name,
      month: idx.month,
      totalRecords: idx.recordCount,
      matchCount: allMatches.length,
      properties: allMatches.slice(0, 100),
    };
  };

  return {
    ccod: summarise(ccod, 'UK Companies (CCOD)'),
    ocod: summarise(ocod, 'Overseas Companies (OCOD)'),
    keyConfigured: Boolean(key),
  };
}

async function lookupInDataset(kind, apiKey) {
  if (!apiKey) {
    throw new Error(
      'LAND_REGISTRY_OPEN_DATA_KEY not configured. Free signup: https://use-land-property-data.service.gov.uk/. Set the key on the backend env to unlock automated CCOD/OCOD lookups.',
    );
  }

  const c = cache[kind];
  if (c.index && Date.now() - c.fetchedAt < TTL_MS) return c.index;

  // Try current month, then previous months — the file lands mid-month.
  const tries = lastNMonths(3);
  let lastError = null;
  for (const month of tries) {
    const fileName = `${kind.toUpperCase()}_FULL_${month}.csv`;
    const apiUrl = `${API_BASE}/${kind}/${fileName}`;
    try {
      // Step 1 — call the JSON API. Returns { result: 'redirect', url }.
      const apiRes = await fetch(apiUrl, {
        headers: {
          Authorization: apiKey, // HMLR uses raw key, no "Bearer" prefix
          Accept: 'application/json',
        },
      });
      if (apiRes.status === 401 || apiRes.status === 403) {
        let body = '';
        try {
          body = await apiRes.text();
        } catch {
          /* ignore */
        }
        throw new Error(
          `${kind.toUpperCase()} ${month}: ${apiRes.status} unauthorized. Verify your LAND_REGISTRY_OPEN_DATA_KEY is correct and active. ${body.slice(0, 200)}`,
        );
      }
      if (apiRes.status === 404) {
        lastError = new Error(`${kind.toUpperCase()} ${month}: not yet published`);
        continue;
      }
      if (!apiRes.ok) {
        lastError = new Error(`${kind.toUpperCase()} ${month}: HTTP ${apiRes.status}`);
        continue;
      }

      const apiBody = await apiRes.json();
      // Some HMLR endpoints reply with { result: { download_url }, success: true }
      const csvUrl =
        apiBody?.url ||
        apiBody?.download_url ||
        apiBody?.result?.download_url ||
        apiBody?.result?.url ||
        (apiBody?.result === 'redirect' ? apiBody?.url : null);
      if (!csvUrl) {
        lastError = new Error(
          `${kind.toUpperCase()} ${month}: API didn't return a CSV URL. Body keys: ${Object.keys(apiBody || {}).join(', ')}`,
        );
        continue;
      }

      // Step 2 — download the CSV from the presigned URL.
      const csvRes = await fetch(csvUrl, { headers: { Accept: 'text/csv' } });
      if (!csvRes.ok) {
        lastError = new Error(`${kind.toUpperCase()} ${month}: CSV fetch ${csvRes.status}`);
        continue;
      }
      const text = await csvRes.text();
      const idx = parseCsvIntoIndex(text, month);
      cache[kind] = { month, index: idx, fetchedAt: Date.now(), error: null };
      return idx;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`Could not fetch ${kind.toUpperCase()} for any of the last 3 months`);
}

function parseCsvIntoIndex(csv, month) {
  const lines = csv.split(/\r?\n/);
  if (lines.length < 2) throw new Error('Empty CSV');
  const headers = parseCsvLine(lines[0]);
  const numberCol = headers.findIndex((h) =>
    /company.?registration.?no|company.?number|crn/i.test(h),
  );
  if (numberCol === -1) {
    throw new Error(
      `CSV had ${headers.length} columns but no company-number column found. Headers: ${headers.slice(0, 8).join(' | ')}`,
    );
  }

  const byNumber = new Map();
  let recordCount = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cells = parseCsvLine(lines[i]);
    if (cells.length < headers.length / 2) continue;
    const number = (cells[numberCol] || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!number) continue;
    recordCount++;
    const record = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = cells[j] || '';
    }
    if (!byNumber.has(number)) byNumber.set(number, []);
    byNumber.get(number).push(record);
  }
  return { month, recordCount, byNumber };
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function lastNMonths(n) {
  const months = [];
  const d = new Date();
  d.setDate(15);
  for (let i = 0; i < n; i++) {
    months.push(`${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return months;
}
