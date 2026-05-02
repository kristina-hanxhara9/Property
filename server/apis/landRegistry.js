const BASE_URL = 'https://landregistry.data.gov.uk/data/ppi/transaction-record.json';

export async function fetchPricePaidByPostcode(postcode, { limit = 50 } = {}) {
  const cleaned = String(postcode || '').trim().toUpperCase();
  if (!cleaned) {
    throw new Error('Postcode required');
  }

  const url = new URL(BASE_URL);
  url.searchParams.set('propertyAddress.postcode', cleaned);
  url.searchParams.set('_pageSize', String(limit));
  url.searchParams.set('_sort', '-transactionDate');

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Land Registry returned ${res.status}`);
  }
  const body = await res.json();
  const items = body?.result?.items || [];

  const transactions = items.map((item) => {
    const addr = item.propertyAddress || {};
    return {
      transactionDate: item.transactionDate,
      pricePaid: item.pricePaid,
      propertyType: extractLabel(item.propertyType),
      estateType: extractLabel(item.estateType),
      newBuild: Boolean(item.newBuild),
      ppdCategory: extractLabel(item.recordStatus) || extractLabel(item.transactionCategory),
      address: {
        paon: addr.paon,
        saon: addr.saon,
        street: addr.street,
        town: addr.town,
        county: addr.county,
        postcode: addr.postcode,
      },
    };
  });

  return {
    postcode: cleaned,
    transactionCount: transactions.length,
    transactions,
  };
}

function extractLabel(field) {
  if (!field) return null;
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) return field.map(extractLabel).filter(Boolean).join(', ');
  if (field.label) return field.label;
  if (field.prefLabel) {
    return Array.isArray(field.prefLabel) ? field.prefLabel[0]?._value : field.prefLabel;
  }
  if (field._value) return field._value;
  return null;
}

export function summarisePriceHistory(transactions, { epcMatch } = {}) {
  if (!transactions || transactions.length === 0) {
    return {
      lastSalePrice: null,
      lastSaleDate: null,
      growth1yr: null,
      growth5yr: null,
      growthAllTime: null,
      pricePerSqFt: null,
      pricePerSqM: null,
      floorAreaSqM: null,
    };
  }

  const sorted = [...transactions].sort(
    (a, b) => new Date(b.transactionDate) - new Date(a.transactionDate),
  );
  const latest = sorted[0];
  const oldest = sorted[sorted.length - 1];

  const yearsBetween = (a, b) =>
    Math.abs(new Date(a) - new Date(b)) / (1000 * 60 * 60 * 24 * 365.25);

  const growth = (from, to) => {
    if (!from || !to || !from.pricePaid || !to.pricePaid) return null;
    const pct = ((to.pricePaid - from.pricePaid) / from.pricePaid) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  };

  // Find the transaction (excluding the latest itself) closest to N years
  // before the latest. Restrict to a sensible window so we don't call a
  // 10-year-old comparison "1yr growth".
  const findInWindow = (yearsAgo, minYears, maxYears) => {
    const target = new Date(latest.transactionDate);
    target.setFullYear(target.getFullYear() - yearsAgo);
    let best = null;
    let bestDelta = Infinity;
    for (let i = 1; i < sorted.length; i++) {
      const tx = sorted[i];
      const yrs = yearsBetween(tx.transactionDate, latest.transactionDate);
      if (yrs < minYears || yrs > maxYears) continue;
      const delta = Math.abs(new Date(tx.transactionDate) - target);
      if (delta < bestDelta) {
        best = tx;
        bestDelta = delta;
      }
    }
    return best;
  };

  const ref1 = findInWindow(1, 0.6, 1.6);     // 7-19 months
  const ref5 = findInWindow(5, 3.5, 7);        // 3.5-7 years
  const ref10 = findInWindow(10, 8, 13);       // 8-13 years

  // £/sqft (and £/sqm) using EPC total_floor_area for the matched property
  const floorAreaSqM = epcMatch?.totalFloorArea && Number(epcMatch.totalFloorArea) > 0
    ? Number(epcMatch.totalFloorArea)
    : null;
  const pricePerSqM = floorAreaSqM && latest.pricePaid
    ? Math.round(latest.pricePaid / floorAreaSqM)
    : null;
  const pricePerSqFt = pricePerSqM ? Math.round(pricePerSqM / 10.7639) : null;

  return {
    lastSalePrice: latest.pricePaid,
    lastSaleDate: latest.transactionDate,
    growth1yr: ref1 ? growth(ref1, latest) : null,
    growth5yr: ref5 ? growth(ref5, latest) : null,
    growth10yr: ref10 ? growth(ref10, latest) : null,
    growthAllTime: sorted.length > 1 ? growth(oldest, latest) : null,
    yearsCovered: sorted.length > 1
      ? yearsBetween(oldest.transactionDate, latest.transactionDate).toFixed(1)
      : null,
    floorAreaSqM,
    pricePerSqM,
    pricePerSqFt,
  };
}
