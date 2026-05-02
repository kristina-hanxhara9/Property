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

  // Build a partial-failure summary so the user sees in one glance which
  // datasets returned no data even when others succeeded.
  const partialFailures = Object.entries(failures)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`);

  // Throw only if EVERYTHING failed.
  const allFailed = !earningsVal && !empVal && !popLatest;
  if (allFailed) {
    throw new Error(
      `Nomis returned no data: ${partialFailures.join(' | ') || 'no observations'}`,
    );
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
    partialFailures,
  };
}

// ── Earnings (ASHE NM_30_1) ─────────────────────────────────────────────────
//
// Returns weekly £; we annualise by ×52.
async function fetchMedianWeeklyEarnings(laCode) {
  const attempts = [
    'sex=7&item=2&pay=1', // All employees, median, gross weekly pay (current ASHE schema)
    'sex=8&item=2&pay=1', // Sex=8 in some schema versions = all
    'item=2&pay=1', // Drop sex filter, take whatever the dataset provides
  ];
  let lastError = null;
  for (const filter of attempts) {
    const url = `${BASE}/NM_30_1.data.json?geography=${encodeURIComponent(
      laCode,
    )}&time=latest&measures=20100&${filter}`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        lastError = new Error(`Nomis ASHE HTTP ${res.status}`);
        continue;
      }
      const body = await res.json();
      const obs = pickObservation(body);
      const weekly = numberOrNull(obs?.obs_value?.value);
      if (weekly == null) {
        lastError = new Error(`Nomis ASHE: no value for filter "${filter}"`);
        continue;
      }
      return {
        medianWeeklyGross: weekly,
        medianAnnualGross: Math.round(weekly * 52),
        time: obs.time?.description || obs.time?.value || null,
        geography: obs.geography?.description || null,
        source: 'ONS ASHE — residence-based, median gross weekly pay',
        filterUsed: filter,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Nomis ASHE: all fallback queries failed');
}

// ── Employment / unemployment rate (APS NM_17_1) ─────────────────────────────
//
// Tries multiple query shapes. NM_17_1 has been re-versioned on Nomis a
// couple of times so different LAs / time periods may need different
// dimension names.
async function fetchEmploymentRates(laCode) {
  const attempts = [
    // Modern: cell parameter, well-known APS cells
    `cell=18,84,85`,
    // Older: variable parameter
    `variable=18,84,85`,
    // No filter — pull all cells, we filter client-side
    ``,
  ];

  let lastError = null;
  for (const filter of attempts) {
    const url = `${BASE}/NM_17_1.data.json?geography=${encodeURIComponent(laCode)}&time=latest&measures=20599${
      filter ? '&' + filter : ''
    }`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        lastError = new Error(`Nomis APS HTTP ${res.status} for ${url}`);
        continue;
      }
      const body = await res.json();
      const observations = body?.obs || [];
      if (observations.length === 0) {
        lastError = new Error(`Nomis APS returned 0 obs for filter "${filter || 'none'}"`);
        continue;
      }

      let employmentRate = null;
      let unemploymentRate = null;
      let economicActivityRate = null;
      let time = null;

      for (const o of observations) {
        const cell = o.cell?.value ?? o.cell?.id ?? o.variable?.value ?? o.variable?.id;
        const val = numberOrNull(o.obs_value?.value);
        time = time || o.time?.description || o.time?.value || null;
        if (cell == 18) employmentRate = val;
        else if (cell == 85 || cell == 19) unemploymentRate = val;
        else if (cell == 84) economicActivityRate = val;
      }

      if (employmentRate != null || unemploymentRate != null || economicActivityRate != null) {
        return {
          employmentRate,
          unemploymentRate,
          economicActivityRate,
          time,
          source: 'ONS Annual Population Survey — residence-based, aged 16-64',
          observationCount: observations.length,
          filterUsed: filter || 'none',
        };
      }
      lastError = new Error(
        `Nomis APS returned ${observations.length} obs for filter "${filter || 'none'}" but none matched cells 18/84/85`,
      );
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Nomis APS: all fallback queries failed');
}

// ── Population (NM_2002_1) ──────────────────────────────────────────────────
//
// Mid-year population estimates. Multiple filter shapes have been used
// over the years so we try in turn.
async function fetchPopulation(laCode, time = 'latest') {
  const attempts = [
    // Modern: sex=0 + age=0 (all persons, all ages)
    `sex=0&age=0`,
    // Older API: gender=0 + age=0
    `gender=0&age=0`,
    // Census 2021-aligned: c2021_age=0
    `sex=0&c2021_age=0`,
    // No filter — pull full breakdown, sum client-side
    ``,
  ];

  let lastError = null;
  for (const filter of attempts) {
    const url = `${BASE}/NM_2002_1.data.json?geography=${encodeURIComponent(
      laCode,
    )}&time=${time}&measures=20100${filter ? '&' + filter : ''}`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        lastError = new Error(`Nomis population HTTP ${res.status}`);
        continue;
      }
      const body = await res.json();
      const observations = body?.obs || [];
      if (observations.length === 0) {
        lastError = new Error(`Nomis population: 0 obs for filter "${filter || 'none'}"`);
        continue;
      }
      // For the no-filter case there will be many obs (one per age/sex).
      // Sum if we got more than one — but only for time='latest' as the
      // raw breakdown should aggregate to total population.
      const obs = observations[0];
      const value =
        observations.length > 1
          ? observations.reduce((s, o) => s + (numberOrNull(o.obs_value?.value) || 0), 0)
          : numberOrNull(obs.obs_value?.value);
      if (value == null) {
        lastError = new Error(`Nomis population: obs values were null`);
        continue;
      }
      return {
        value,
        time: obs.time?.description || obs.time?.value || null,
        source: 'ONS Mid-Year Population Estimates',
        filterUsed: filter || 'none',
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`Nomis population (${time}): all fallback queries failed`);
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
