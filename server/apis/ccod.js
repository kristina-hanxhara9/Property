// HM Land Registry CCOD (UK Companies that Own Property in England & Wales)
// and OCOD (Overseas Companies). Free monthly CSV downloads from
// use-land-property-data.service.gov.uk.
//
// Lazy-loaded on first request and cached for 24 hours. CSVs are large
// (~70-90MB CCOD, ~10-15MB OCOD) so we stream-parse and index by
// company_registration_number, NOT load the whole thing into memory as
// objects.
//
// If the URL pattern changes or the file is gated behind session/CSRF,
// we surface a clear error and the UI falls back to the link.

const CCOD_BASE = 'https://use-land-property-data.service.gov.uk/datasets/ccod/download';
const OCOD_BASE = 'https://use-land-property-data.service.gov.uk/datasets/ocod/download';

// In-memory caches keyed by month (YYYY_MM). Each value is a Map of
// company_number → array of records.
const cache = {
  ccod: { month: null, index: null, fetchedAt: 0, error: null },
  ocod: { month: null, index: null, fetchedAt: 0, error: null },
};

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function searchCorporatePropertyHoldings(companyNumber) {
  if (!companyNumber) return null;
  // Normalise — Companies House numbers are 8 chars with leading zeros
  const normalised = String(companyNumber).replace(/[^A-Z0-9]/gi, '').toUpperCase();
  // Also try the unpadded variant (CCOD sometimes drops leading zeros)
  const candidates = new Set([
    normalised,
    normalised.replace(/^0+/, ''),
    normalised.padStart(8, '0'),
  ]);

  const [ccod, ocod] = await Promise.allSettled([
    lookupInDataset('ccod'),
    lookupInDataset('ocod'),
  ]);

  const summarise = (status, name) => {
    if (status.status === 'rejected') {
      return {
        available: false,
        error: status.reason?.message || 'unknown',
        name,
      };
    }
    const idx = status.value;
    if (!idx) {
      return { available: false, error: 'No index built', name };
    }
    let allMatches = [];
    for (const c of candidates) {
      if (idx.byNumber.has(c)) {
        allMatches = allMatches.concat(idx.byNumber.get(c));
      }
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
  };
}

async function lookupInDataset(kind) {
  const c = cache[kind];
  if (c.index && Date.now() - c.fetchedAt < TTL_MS) {
    return c.index;
  }

  // Build URL for the most recent month. The Land Registry publishes
  // mid-month. Try current month, then previous month if 404.
  const tries = lastNMonths(3);
  let lastError = null;
  for (const month of tries) {
    const url = buildDownloadUrl(kind, month);
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'text/csv,application/octet-stream',
          'User-Agent': 'PropertyIQ/0.1',
        },
      });
      if (res.status === 404) {
        lastError = new Error(`${month}: 404`);
        continue;
      }
      if (!res.ok) {
        lastError = new Error(`${month}: HTTP ${res.status}`);
        continue;
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('csv') && !contentType.includes('octet-stream') && !contentType.includes('text/plain')) {
        lastError = new Error(
          `${month}: response wasn't CSV (got ${contentType.slice(0, 60)}). The dataset URL likely requires session/CSRF — manual download needed.`,
        );
        continue;
      }

      const text = await res.text();
      const idx = parseCsvIntoIndex(text, month);
      cache[kind] = { month, index: idx, fetchedAt: Date.now(), error: null };
      return idx;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`Could not fetch ${kind.toUpperCase()} for any of the last 3 months`);
}

function buildDownloadUrl(kind, month) {
  const base = kind === 'ccod' ? CCOD_BASE : OCOD_BASE;
  // Filename pattern: CCOD_FULL_YYYY_MM.csv / OCOD_FULL_YYYY_MM.csv
  const fileName = `${kind.toUpperCase()}_FULL_${month}.csv`;
  return `${base}/${fileName}`;
}

function parseCsvIntoIndex(csv, month) {
  const lines = csv.split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error('Empty CSV');
  }
  const headers = parseCsvLine(lines[0]);
  // Find the company_registration_no column (CCOD field name).
  // OCOD uses similar but different headers; we check several variants.
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
