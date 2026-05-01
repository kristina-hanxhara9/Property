const BASE_URL = 'https://api.company-information.service.gov.uk';

function authHeader(apiKey) {
  if (!apiKey) {
    throw new Error('COMPANIES_HOUSE_KEY is not configured');
  }
  const encoded = Buffer.from(`${apiKey}:`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

async function chRequest(path, apiKey) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { ...authHeader(apiKey), Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    const detail = body.slice(0, 200).replace(/\s+/g, ' ').trim();
    const keyHint = `key len=${apiKey?.length || 0}, starts=${(apiKey || '').slice(0, 4)}…`;
    throw new Error(
      `Companies House ${res.status} (${keyHint}). ${
        detail || 'Invalid or revoked API key.'
      } Check that your application is set to "Live" (not "Test") at developer.company-information.service.gov.uk.`,
    );
  }
  if (!res.ok) {
    throw new Error(`Companies House ${path} returned ${res.status}`);
  }
  return await res.json();
}

export async function searchCompanies(query, apiKey) {
  const path = `/search/companies?q=${encodeURIComponent(query)}&items_per_page=10`;
  const body = await chRequest(path, apiKey);
  if (!body) return [];
  return (body.items || []).map((c) => ({
    companyNumber: c.company_number,
    title: c.title,
    address: c.address_snippet,
    status: c.company_status,
    type: c.company_type,
    incorporatedDate: c.date_of_creation,
  }));
}

export async function fetchCompanyProfile(companyNumber, apiKey) {
  return await chRequest(`/company/${companyNumber}`, apiKey);
}

export async function fetchCompanyOfficers(companyNumber, apiKey) {
  return await chRequest(`/company/${companyNumber}/officers?items_per_page=100`, apiKey);
}

export async function fetchPSC(companyNumber, apiKey) {
  return await chRequest(
    `/company/${companyNumber}/persons-with-significant-control?items_per_page=100`,
    apiKey,
  );
}

export async function fetchCharges(companyNumber, apiKey) {
  return await chRequest(`/company/${companyNumber}/charges?items_per_page=100`, apiKey);
}

export async function fetchInsolvency(companyNumber, apiKey) {
  return await chRequest(`/company/${companyNumber}/insolvency`, apiKey);
}

export async function fetchFilingHistory(companyNumber, apiKey) {
  return await chRequest(`/company/${companyNumber}/filing-history?items_per_page=20`, apiKey);
}

export async function fetchCompanyBundle(companyNumber, apiKey) {
  const [profile, officers, psc, charges, insolvency, filingHistory] = await Promise.allSettled([
    fetchCompanyProfile(companyNumber, apiKey),
    fetchCompanyOfficers(companyNumber, apiKey),
    fetchPSC(companyNumber, apiKey),
    fetchCharges(companyNumber, apiKey),
    fetchInsolvency(companyNumber, apiKey),
    fetchFilingHistory(companyNumber, apiKey),
  ]);

  const settled = (s) => (s.status === 'fulfilled' ? s.value : null);
  const errors = [];
  ['profile', 'officers', 'psc', 'charges', 'insolvency', 'filingHistory'].forEach((name, i) => {
    const r = [profile, officers, psc, charges, insolvency, filingHistory][i];
    if (r.status === 'rejected') {
      errors.push({ source: name, error: r.reason?.message || 'unknown' });
    }
  });

  return {
    profile: settled(profile),
    officers: settled(officers),
    psc: settled(psc),
    charges: settled(charges),
    insolvency: settled(insolvency),
    filingHistory: settled(filingHistory),
    errors,
  };
}
