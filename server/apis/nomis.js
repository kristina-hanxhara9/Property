// ONS Nomis API integration.
// Free, no API key. Base URL: https://www.nomisweb.co.uk/api/v01/
//
// Datasets we use:
//   NM_30_1     — Annual Survey of Hours and Earnings (ASHE), residence-based
//                  → median gross weekly pay by Local Authority of residence
//   NM_17_1     — Annual Population Survey, residence-based
//                  → employment rate, unemployment rate, economic activity (16-64)
//   NM_2002_1   — Mid-year population estimates by single year of age (LA/LSOA)
//                  → total population, plus 5yr-ago value for growth trend
//
// Geography parameter accepts ONS area codes directly (E.../W.../S.../N...).
// We pass the admin_district code from postcodes.io.
//
// Each fetch is wrapped in try/catch and returns null on failure so a
// flaky single dataset never blocks the rest of the property report.

const BASE = 'https://www.nomisweb.co.uk/api/v01/dataset';

export async function fetchNomisProfile(adminDistrictCode) {
  if (!adminDistrictCode) return null;

  const [earnings, employment, population, populationFiveYearsAgo] = await Promise.allSettled([
    fetchMedianWeeklyEarnings(adminDistrictCode),
    fetchEmploymentRates(adminDistrictCode),
    fetchPopulation(adminDistrictCode, 'latest'),
    fetchPopulation(adminDistrictCode, 'latestMINUS5'),
  ]);

  const earningsVal = earnings.status === 'fulfilled' ? earnings.value : null;
  const empVal = employment.status === 'fulfilled' ? employment.value : null;
  const popLatest = population.status === 'fulfilled' ? population.value : null;
  const pop5yr = populationFiveYearsAgo.status === 'fulfilled' ? populationFiveYearsAgo.value : null;

  let populationGrowthTrend = null;
  let populationGrowthPct = null;
  if (popLatest?.value && pop5yr?.value) {
    const pct = ((popLatest.value - pop5yr.value) / pop5yr.value) * 100;
    populationGrowthPct = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    populationGrowthTrend =
      pct >= 2 ? 'Growing' : pct <= -1 ? 'Declining' : 'Stable';
  }

  const failures = {
    earnings: earnings.status === 'rejected' ? String(earnings.reason?.message || earnings.reason || '').slice(0, 200) : null,
    employment: employment.status === 'rejected' ? String(employment.reason?.message || employment.reason || '').slice(0, 200) : null,
    population: population.status === 'rejected' ? String(population.reason?.message || population.reason || '').slice(0, 200) : null,
    populationFiveYearsAgo:
      populationFiveYearsAgo.status === 'rejected'
        ? String(populationFiveYearsAgo.reason?.message || populationFiveYearsAgo.reason || '').slice(0, 200)
        : null,
  };

  // If everything failed, throw so the agent log shows the failure
  // rather than silently returning a profile of nulls.
  const allFailed = !earningsVal && !empVal && !popLatest;
  if (allFailed) {
    const summary = Object.entries(failures)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' | ');
    throw new Error(`Nomis returned no data: ${summary || 'no observations'}`);
  }

  return {
    geography: adminDistrictCode,
    earnings: earningsVal,
    employment: empVal,
    population: popLatest,
    populationFiveYearsAgo: pop5yr,
    populationGrowthTrend,
    populationGrowthPct,
    failures,
  };
}

// ── Earnings (ASHE NM_30_1) ─────────────────────────────────────────────────
//
// Filters used:
//   sex=7        — All employees
//   item=2       — Median
//   pay=1        — Gross weekly pay
//   measures=20100  — Value (not coefficient of variation)
//
// Returns weekly £; we annualise by ×52.
async function fetchMedianWeeklyEarnings(laCode) {
  const url = `${BASE}/NM_30_1.data.json?geography=${encodeURIComponent(
    laCode,
  )}&time=latest&sex=7&item=2&pay=1&measures=20100`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nomis ASHE returned ${res.status}`);
  const body = await res.json();
  const obs = pickObservation(body);
  if (!obs) return null;
  const weekly = numberOrNull(obs.obs_value?.value);
  if (weekly == null) return null;
  return {
    medianWeeklyGross: weekly,
    medianAnnualGross: Math.round(weekly * 52),
    time: obs.time?.description || obs.time?.value || null,
    geography: obs.geography?.description || null,
    source: 'ONS ASHE — residence-based, all employees, median gross weekly pay',
  };
}

// ── Employment / unemployment rate (APS NM_17_1) ─────────────────────────────
//
// NM_17_1 is the Annual Population Survey, residence-based.
// Variable codes (Nomis: cell):
//   18    — Employment rate (aged 16-64)
//   84    — Economic activity rate (aged 16-64)
//   85    — Unemployment rate (aged 16+)
//   45    — % all in employment who are - employees, etc.
// measures=20599 returns the value.
//
// Different LAs have different cells available depending on sample size.
// We try the documented codes and accept whatever comes back.
async function fetchEmploymentRates(laCode) {
  const url = `${BASE}/NM_17_1.data.json?geography=${encodeURIComponent(
    laCode,
  )}&time=latest&cell=18,84,85&measures=20599`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nomis APS returned ${res.status}`);
  const body = await res.json();
  const observations = body?.obs || [];

  let employmentRate = null;
  let unemploymentRate = null;
  let economicActivityRate = null;
  let time = null;

  for (const o of observations) {
    const cell = o.cell?.value ?? o.cell?.id ?? o.variable?.value;
    const val = numberOrNull(o.obs_value?.value);
    time = time || o.time?.description || o.time?.value || null;
    if (cell == 18) employmentRate = val;
    else if (cell == 85) unemploymentRate = val;
    else if (cell == 84) economicActivityRate = val;
  }

  if (employmentRate == null && unemploymentRate == null && economicActivityRate == null) {
    // Surface a clear error with the obs count rather than silently returning null
    throw new Error(`Nomis APS returned ${observations.length} observations but none matched the expected cells (18/84/85). LA may have insufficient APS sample.`);
  }
  return {
    employmentRate,
    unemploymentRate,
    economicActivityRate,
    time,
    source: 'ONS Annual Population Survey — residence-based, aged 16-64',
    observationCount: observations.length,
  };
}

// ── Population (NM_2002_1) ──────────────────────────────────────────────────
//
// NM_2002_1 is mid-year population estimates by single year of age.
// Filters: sex=0 (persons / all), age=0 (all ages), measures=20100 (value).
//
// `time` accepts: latest, latestMINUS1, latestMINUS5, or YYYY.
async function fetchPopulation(laCode, time = 'latest') {
  // Try a couple of filter shapes since Nomis APIs vary.
  // Primary: sex=0 + age=0 (all persons, all ages)
  // Fallback: c2021_age=0 (Census-aligned aggregations)
  const url = `${BASE}/NM_2002_1.data.json?geography=${encodeURIComponent(
    laCode,
  )}&time=${time}&sex=0&age=0&measures=20100`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nomis population returned ${res.status}`);
  const body = await res.json();
  const observations = body?.obs || [];
  const obs = observations[0];
  if (!obs) {
    throw new Error(`Nomis population returned 0 observations for ${laCode}/${time}`);
  }
  return {
    value: numberOrNull(obs.obs_value?.value),
    time: obs.time?.description || obs.time?.value || null,
    source: 'ONS Mid-Year Population Estimates',
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function pickObservation(body) {
  const obs = body?.obs || [];
  return obs[0] || null;
}

function numberOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
