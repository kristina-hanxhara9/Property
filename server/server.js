import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';

import { lookupPostcode, extractPostcode } from './apis/postcodes.js';
import { fetchPricePaidByPostcode, summarisePriceHistory } from './apis/landRegistry.js';
import { fetchPlanningConstraints } from './apis/planningData.js';
import { fetchFloodRisk } from './apis/floodRisk.js';
import { searchCompanies, fetchCompanyBundle } from './apis/companiesHouse.js';
import { checkSanctions } from './apis/sanctions.js';
import { searchCorporatePropertyHoldings } from './apis/ccod.js';
import { verifyVatNumber } from './apis/vat.js';
import { fetchEpcByPostcode, pickBestEpc } from './apis/epc.js';
import { fetchPlanningApplications, fetchPlanningApplicationsForAddress } from './apis/planit.js';
import { buildPropertyDocx, buildCompanyDocx } from './apis/docxExport.js';
import { buildVoaLinksForCompany, fetchVoaForCompany } from './apis/voa.js';
import {
  fetchImdDecile,
  fetchPostcodeDemographics,
  fetchOnsRentalGrowth,
  fetchOnsRegionalRentalGrowth,
} from './apis/ons.js';
import { fetchNomisProfile } from './apis/nomis.js';
import { fetchGroundHazards } from './apis/groundHazards.js';
import { fetchCrimeData } from './apis/crime.js';
import { fetchNearbySchools } from './apis/schools.js';
import { fetchNearbyTransport } from './apis/transport.js';
import { fetchFoodHygieneRatings } from './apis/foodHygiene.js';
import {
  buildRadonLink,
  buildGroundStabilityLink,
  buildMiningLink,
  buildPlanItLink,
  buildLpaPlanningLink,
  buildOnsAreaProfileLink,
} from './apis/environmentalLinks.js';
import {
  buildPropertyFallbackReport,
  buildCompanyFallbackReport,
} from './apis/fallbackReport.js';

import { PROPERTY_SYSTEM_PROMPT, buildPropertyUserMessage } from './prompts/propertyAnalysis.js';
import { COMPANY_SYSTEM_PROMPT, buildCompanyUserMessage } from './prompts/companyAnalysis.js';
import {
  COMPARABLES_SYSTEM_PROMPT,
  buildComparablesUserMessage,
} from './prompts/comparablesAgent.js';
import {
  AVM_SYSTEM_PROMPT,
  buildAvmUserMessage,
  ADVERSE_MEDIA_SYSTEM_PROMPT,
  buildAdverseMediaUserMessage,
  CONSTRUCTION_COST_SYSTEM_PROMPT,
  buildConstructionCostUserMessage,
  VAT_LOOKUP_SYSTEM_PROMPT,
  buildVatUserMessage,
  CORPORATE_PROPERTIES_SYSTEM_PROMPT,
  buildCorporatePropertiesUserMessage,
  COMMERCIAL_RENTS_SYSTEM_PROMPT,
  buildCommercialRentsUserMessage,
  HMO_RENTS_SYSTEM_PROMPT,
  buildHmoRentsUserMessage,
  INVESTMENT_MEMO_SYSTEM_PROMPT,
  buildInvestmentMemoUserMessage,
} from './prompts/aiAgents.js';

const PORT = Number(process.env.PORT || 3001);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const COMPANIES_HOUSE_KEY = process.env.COMPANIES_HOUSE_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const HMRC_CLIENT_ID = process.env.HMRC_CLIENT_ID || '';
const HMRC_CLIENT_SECRET = process.env.HMRC_CLIENT_SECRET || '';
const EPC_EMAIL = process.env.EPC_EMAIL || '';
const EPC_API_KEY = process.env.EPC_API_KEY || '';
const EPC_BEARER_TOKEN = process.env.EPC_BEARER_TOKEN || '';
const EPC_BASE_URL = process.env.EPC_BASE_URL || '';
// EPC_SEARCH_PATH and EPC_POSTCODE_PARAM let you override the search
// endpoint without a code change — useful while the new MHCLG API is
// still settling. Defaults are best-guess; check your OpenAPI spec.
const EPC_SEARCH_PATH = process.env.EPC_SEARCH_PATH || '';
const EPC_POSTCODE_PARAM = process.env.EPC_POSTCODE_PARAM || '';
const EPC_CONFIGURED = Boolean(EPC_BEARER_TOKEN || (EPC_EMAIL && EPC_API_KEY));

if (!ANTHROPIC_API_KEY) {
  console.warn('[propertyiq] ANTHROPIC_API_KEY is not set — Claude synthesis will fail.');
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Models per workload. Defaults are tuned for cost/quality balance —
// override via env vars if you want to scale up to Opus or down to Haiku.
//
//   ANTHROPIC_MODEL              — main property/company synthesis
//   ANTHROPIC_MODEL_COMPARABLES  — market-comparables agent (web search)
//   ANTHROPIC_MODEL_CHAT         — follow-up chat panel
//
// Per-run cost guide (rough, varies with input size):
//   sonnet-4-6:  $3 in / $15 out per 1M tokens   ~$0.02-0.05 per report
//   haiku-4-5:   $1 in /  $5 out per 1M tokens   ~$0.005-0.015 per report
//   opus-4-7:    $5 in / $25 out per 1M tokens   ~$0.05-0.15 per report
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MODEL_COMPARABLES = process.env.ANTHROPIC_MODEL_COMPARABLES || MODEL;
const MODEL_CHAT = process.env.ANTHROPIC_MODEL_CHAT || 'claude-haiku-4-5';

const app = express();
// Render and most PaaS providers terminate TLS at a proxy and forward the
// originating IP via X-Forwarded-For. Tell Express to trust ONE proxy hop so
// req.ip resolves correctly and express-rate-limit doesn't throw.
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(
  cors({
    origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN.split(',').map((s) => s.trim()),
    credentials: false,
  }),
);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a minute and try again.' },
});
app.use('/api', limiter);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    model: MODEL,
    modelComparables: MODEL_COMPARABLES,
    modelChat: MODEL_CHAT,
    time: new Date().toISOString(),
  });
});

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function runStep(res, name, label, fn) {
  const startedAt = Date.now();
  sseSend(res, 'step', { name, label, status: 'running' });
  try {
    const result = await fn();
    sseSend(res, 'step', {
      name,
      label,
      status: 'complete',
      durationMs: Date.now() - startedAt,
    });
    return { ok: true, value: result };
  } catch (err) {
    sseSend(res, 'step', {
      name,
      label,
      status: 'failed',
      error: err?.message || 'Unknown error',
      durationMs: Date.now() - startedAt,
    });
    return { ok: false, error: err?.message || 'Unknown error' };
  }
}

app.post('/api/property-check', async (req, res) => {
  const { address, postcode: rawPostcode } = req.body || {};
  if (!address && !rawPostcode) {
    res.status(400).json({ error: 'Address or postcode required.' });
    return;
  }

  sseHeaders(res);
  const apiResults = {};
  const apisFailed = [];

  let postcodeStr = rawPostcode || extractPostcode(address);
  if (!postcodeStr) {
    sseSend(res, 'step', {
      name: 'postcode',
      label: 'Postcode parsing',
      status: 'failed',
      error: 'Could not detect a UK postcode in the address. Provide it explicitly.',
    });
    sseSend(res, 'error', {
      message: 'Could not extract a UK postcode. Please include the postcode in the address.',
    });
    res.end();
    return;
  }

  const geo = await runStep(res, 'postcodes', 'Postcodes.io geocoding', () =>
    lookupPostcode(postcodeStr),
  );
  apiResults.postcode = geo.value || null;
  if (!geo.ok) apisFailed.push('postcodes.io');

  if (!geo.ok) {
    sseSend(res, 'error', {
      message: 'Postcode lookup failed. Please verify the postcode and try again.',
    });
    res.end();
    return;
  }

  const { latitude, longitude } = geo.value;

  const pricePaidPromise = runStep(
    res,
    'land-registry',
    'HM Land Registry — Price Paid Data (free)',
    () => fetchPricePaidByPostcode(postcodeStr),
  );
  const planningPromise = runStep(
    res,
    'planning',
    'Planning Data GOV.UK constraints (free)',
    () => fetchPlanningConstraints({ latitude, longitude }),
  );
  const floodPromise = runStep(
    res,
    'flood',
    'Environment Agency flood risk (free)',
    () => fetchFloodRisk({ latitude, longitude }),
  );
  const epcLabel = EPC_CONFIGURED
    ? `EPC Register — energy performance (${
        EPC_BEARER_TOKEN
          ? `Bearer auth, token len=${EPC_BEARER_TOKEN.length}`
          : 'legacy Basic auth'
      })`
    : `EPC Register — NOT CONFIGURED · env vars seen: BEARER=${
        EPC_BEARER_TOKEN ? 'set' : 'missing'
      }, EMAIL=${EPC_EMAIL ? 'set' : 'missing'}, API_KEY=${EPC_API_KEY ? 'set' : 'missing'}`;

  const epcPromise = runStep(res, 'epc', epcLabel, () =>
    fetchEpcByPostcode(
      { postcode: postcodeStr, addressFragment: address },
      {
        bearerToken: EPC_BEARER_TOKEN,
        email: EPC_EMAIL,
        apiKey: EPC_API_KEY,
        baseUrl: EPC_BASE_URL,
        searchPath: EPC_SEARCH_PATH,
        postcodeParam: EPC_POSTCODE_PARAM,
      },
    ),
  );
  const lsoaCode = geo.value?.codes?.lsoa || null;
  // Primary demographic + IMD lookup via findthatpostcode.uk (clean JSON,
  // free, no key). Falls back to opendatacommunities SPARQL inside ons.js
  // if the primary fails — both surface as the same shape for downstream.
  const imdPromise = runStep(
    res,
    'imd',
    'findthatpostcode.uk — IMD2019 decile + ONS demographics (free)',
    async () => {
      const demo = await fetchPostcodeDemographics(postcodeStr);
      if (demo?.imdDecile != null) {
        return {
          decile: demo.imdDecile,
          score: demo.imdScore,
          rank: demo.imdRank,
          ruralUrban: demo.ruralUrban,
          demographics: demo,
        };
      }
      // Fallback to SPARQL via LSOA
      return await fetchImdDecile(lsoaCode);
    },
  );
  const onsRentalPromise = runStep(
    res,
    'ons-rental',
    'ONS Index of Private Housing Rental Prices (free)',
    () => fetchOnsRentalGrowth(),
  );
  const planitPromise = runStep(
    res,
    'planit',
    'PlanIt UK — recent planning applications (free)',
    () => fetchPlanningApplications({ postcode: postcodeStr, latitude, longitude, limit: 12 }),
  );
  // Address-level history: only meaningful if the user gave us a real
  // address string (not a bare postcode click from the map).
  const planitAddressPromise = address && address !== postcodeStr
    ? runStep(
        res,
        'planit-address',
        'PlanIt UK — full history at this address (free)',
        () =>
          fetchPlanningApplicationsForAddress({
            postcode: postcodeStr,
            addressFragment: address,
            limit: 25,
          }),
      )
    : Promise.resolve({ ok: true, value: null });
  const adminDistrictCode = geo.value?.codes?.admin_district || null;
  const nomisPromise = (async () => {
    const result = await runStep(
      res,
      'nomis',
      'ONS Nomis — earnings, employment, population (free)',
      () => fetchNomisProfile(adminDistrictCode),
    );
    // If Nomis succeeded but had partial failures, emit a follow-up step so
    // the user sees exactly which sub-datasets came back empty.
    if (result.ok && result.value?.partialFailures?.length) {
      sseSend(res, 'step', {
        name: 'nomis-partial',
        label: `Nomis partial: ${result.value.partialFailures.join(' · ')}`,
        status: 'failed',
        error: 'Some Nomis datasets returned no data for this LA.',
      });
    }
    return result;
  })();
  const groundPromise = runStep(
    res,
    'bgs-ground',
    'BGS GeoIndex — radon band, ground stability, mining (free)',
    () => fetchGroundHazards({ latitude, longitude }),
  );
  const crimePromise = runStep(
    res,
    'crime',
    'data.police.uk — crimes within 1mi (free)',
    () => fetchCrimeData({ latitude, longitude }),
  );
  const schoolsPromise = runStep(
    res,
    'schools',
    'DfE — state schools within 1mi with Ofsted ratings (free)',
    () => fetchNearbySchools({ postcode: postcodeStr, latitude, longitude }),
  );
  const transportPromise = runStep(
    res,
    'transport',
    'OpenStreetMap Overpass — nearest train, tube, tram stations (free)',
    () => fetchNearbyTransport({ latitude, longitude }),
  );
  const foodPromise = runStep(
    res,
    'food',
    'Food Standards Agency — restaurants & hygiene ratings (free)',
    () => fetchFoodHygieneRatings({ postcode: postcodeStr, latitude, longitude }),
  );

  const [
    pricePaid,
    planning,
    flood,
    epc,
    imd,
    onsRental,
    planit,
    planitAddress,
    nomis,
    ground,
    crime,
    schools,
    transport,
    food,
  ] = await Promise.all([
    pricePaidPromise,
    planningPromise,
    floodPromise,
    epcPromise,
    imdPromise,
    onsRentalPromise,
    planitPromise,
    planitAddressPromise,
    nomisPromise,
    groundPromise,
    crimePromise,
    schoolsPromise,
    transportPromise,
    foodPromise,
  ]);
  if (!pricePaid.ok) apisFailed.push('land-registry-price-paid');
  if (!planning.ok) apisFailed.push('planning-data-gov-uk');
  if (!flood.ok) apisFailed.push('environment-agency-flood');
  if (!epc.ok) apisFailed.push('epc-register');
  if (!imd.ok) apisFailed.push('ons-imd');
  if (!onsRental.ok) apisFailed.push('ons-rental');
  if (!planit.ok) apisFailed.push('planit');
  if (!nomis.ok) apisFailed.push('ons-nomis');
  if (!ground.ok) apisFailed.push('bgs-ground');
  if (!crime.ok) apisFailed.push('police-uk');
  if (!schools.ok) apisFailed.push('dfe-schools');
  if (!transport.ok) apisFailed.push('osm-transport');
  if (!food.ok) apisFailed.push('fsa-food');

  apiResults.pricePaid = pricePaid.value || null;
  apiResults.epcMatchForArea = epc.value ? pickBestEpc(epc.value, address) : null;
  apiResults.priceSummary = pricePaid.value
    ? summarisePriceHistory(pricePaid.value.transactions, { epcMatch: apiResults.epcMatchForArea })
    : null;
  apiResults.planning = planning.value || null;
  apiResults.flood = flood.value || null;
  apiResults.epc = epc.value || (epc.error ? { configured: true, error: epc.error, results: [] } : null);
  apiResults.epcMatch = epc.value ? pickBestEpc(epc.value, address) : null;
  apiResults.imd = imd.value || null;
  apiResults.onsRental = onsRental.value || null;
  apiResults.planit = planit.value || null;
  apiResults.planitAddress = planitAddress?.value || null;
  apiResults.nomis = nomis.value || null;
  apiResults.ground = ground.value || null;
  apiResults.crime = crime.value || null;
  apiResults.schools = schools.value || null;
  apiResults.transport = transport.value || null;
  apiResults.food = food.value || null;
  const lpaEntity = (planning.value?.constraints?.['local-planning-authority'] || [])[0] || null;
  const lpaPlanningLink = buildLpaPlanningLink({
    lpaName: lpaEntity?.name || null,
    lpaWebsite: lpaEntity?.website || null,
    postcode: postcodeStr,
  });
  const onsAreaLink = buildOnsAreaProfileLink({
    adminDistrictCode: geo.value?.codes?.admin_district || null,
    adminDistrictName: geo.value?.adminDistrict || null,
  });
  apiResults.environmentalLinks = {
    radon: buildRadonLink(postcodeStr),
    groundStability: buildGroundStabilityLink(postcodeStr),
    mining: buildMiningLink(postcodeStr),
    planningHistory: lpaPlanningLink,
    planningHistorySupplementary: buildPlanItLink(postcodeStr),
    onsAreaProfile: onsAreaLink,
  };

  sseSend(res, 'partial-data', { partial: apiResults });
  // Send the FULL raw data set so the frontend can hold it for DOCX export
  // and an "All raw data" UI section. This includes everything every API
  // returned, not just the curated fields the cards display.
  sseSend(res, 'raw-data', { rawData: apiResults });

  const apisQueried = 14;
  const apisSuccessful = apisQueried - apisFailed.length;

  const rawDataForReport = {
    ...apiResults,
    meta: { apisQueried, apisSuccessful, apisFailed },
  };

  const fallbackReport = buildPropertyFallbackReport({
    address,
    postcode: postcodeStr,
    rawData: rawDataForReport,
  });

  if (!ANTHROPIC_API_KEY) {
    sseSend(res, 'step', {
      name: 'claude',
      label: 'Claude AI synthesis (skipped — using rule-based fallback)',
      status: 'failed',
      error: 'No ANTHROPIC_API_KEY configured. Showing report built directly from the open-data sources.',
    });
    sseSend(res, 'report', fallbackReport);
    res.end();
    return;
  }

  const userMessage = buildPropertyUserMessage({
    address,
    postcode: postcodeStr,
    rawData: rawDataForReport,
  });

  sseSend(res, 'step', {
    name: 'claude',
    label: 'Claude AI synthesis',
    status: 'running',
  });

  let collected = '';
  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      system: PROPERTY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    stream.on('text', (delta) => {
      collected += delta;
      sseSend(res, 'ai-delta', { text: delta });
    });

    const finalMessage = await stream.finalMessage();
    sseSend(res, 'step', {
      name: 'claude',
      label: 'Claude AI synthesis',
      status: 'complete',
    });

    const fullText = finalMessage.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = tryParseJson(fullText) || tryParseJson(collected);

    if (!parsed) {
      sseSend(res, 'report', fallbackReport);
    } else {
      sseSend(res, 'report', parsed);
    }
  } catch (err) {
    sseSend(res, 'step', {
      name: 'claude',
      label: 'Claude AI synthesis (failed — using rule-based fallback)',
      status: 'failed',
      error: err?.message || 'Claude error',
    });
    sseSend(res, 'report', fallbackReport);
  }

  res.end();
});

// Sales-in-area lookup. Given a lat/lng (and optionally a radius), find the
// nearest postcodes via Postcodes.io reverse-geocode, then pull Land Registry
// Price Paid for each. Returns up to ~limit transactions with lat/lng so the
// map view can drop colour-coded sale pins.
app.post('/api/sales-in-area', async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      radiusMeters = 1000,
      maxPostcodes = 20,
      limitPerPostcode = 15,
    } = req.body || {};

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'latitude and longitude required as numbers.' });
      return;
    }

    // Postcodes.io supports radius up to 2000m. Clamp to be safe.
    const radius = Math.min(2000, Math.max(100, Number(radiusMeters) || 1000));
    const limit = Math.min(100, Math.max(1, Number(maxPostcodes) || 20));

    const pcRes = await fetch(
      `https://api.postcodes.io/postcodes?lon=${lng}&lat=${lat}&radius=${radius}&limit=${limit}`,
    );
    if (!pcRes.ok) {
      res.status(502).json({ error: `Postcodes.io returned ${pcRes.status}` });
      return;
    }
    const pcBody = await pcRes.json();
    const postcodes = (pcBody?.result || []).map((r) => ({
      postcode: r.postcode,
      latitude: r.latitude,
      longitude: r.longitude,
    }));

    if (postcodes.length === 0) {
      res.json({ count: 0, sales: [], postcodes: [], radiusMeters: radius });
      return;
    }

    // Cap parallel requests to be polite to Land Registry.
    const results = await Promise.allSettled(
      postcodes.map((pc) =>
        fetchPricePaidByPostcode(pc.postcode, { limit: limitPerPostcode }).then((r) => ({
          ...r,
          centroid: { latitude: pc.latitude, longitude: pc.longitude },
        })),
      ),
    );

    const sales = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { postcode, transactions, centroid } = r.value;
      for (const tx of transactions || []) {
        sales.push({
          postcode,
          // Postcode centroid is the best free locator — no per-property lat/lng
          // exists in Price Paid Data. Pins will overlap on the same street.
          latitude: centroid.latitude,
          longitude: centroid.longitude,
          price: tx.pricePaid,
          date: tx.transactionDate,
          propertyType: tx.propertyType,
          tenure: tx.estateType,
          newBuild: tx.newBuild,
          address: [
            tx.address?.saon,
            tx.address?.paon,
            tx.address?.street,
            tx.address?.town,
            tx.address?.postcode,
          ]
            .filter(Boolean)
            .join(', '),
        });
      }
    }

    sales.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      count: sales.length,
      postcodes: postcodes.map((p) => p.postcode),
      sales: sales.slice(0, 500), // hard cap so we don't blow up the JSON payload
      radiusMeters: radius,
      centroid: { latitude: lat, longitude: lng },
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Sales-in-area lookup failed' });
  }
});

// IMD heatmap. Pull nearby postcodes, then look up the IMD decile for each
// via findthatpostcode.uk in parallel. Returns one circle per postcode for
// the map to colour by decile (red = deprived, green = least deprived).
app.post('/api/area-imd', async (req, res) => {
  try {
    const { latitude, longitude, radiusMeters = 1500, maxPostcodes = 80 } = req.body || {};
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'latitude and longitude required as numbers.' });
      return;
    }
    const radius = Math.min(2000, Math.max(100, Number(radiusMeters) || 1500));
    const limit = Math.min(100, Math.max(1, Number(maxPostcodes) || 80));

    const pcRes = await fetch(
      `https://api.postcodes.io/postcodes?lon=${lng}&lat=${lat}&radius=${radius}&limit=${limit}`,
    );
    if (!pcRes.ok) {
      res.status(502).json({ error: `Postcodes.io returned ${pcRes.status}` });
      return;
    }
    const pcBody = await pcRes.json();
    const postcodes = (pcBody?.result || []).map((r) => ({
      postcode: r.postcode,
      latitude: r.latitude,
      longitude: r.longitude,
    }));

    if (postcodes.length === 0) {
      res.json({ count: 0, points: [], radiusMeters: radius });
      return;
    }

    // Parallel — but capped to keep findthatpostcode happy.
    const concurrency = 8;
    const points = [];
    for (let i = 0; i < postcodes.length; i += concurrency) {
      const slice = postcodes.slice(i, i + concurrency);
      const lookups = await Promise.allSettled(
        slice.map((pc) =>
          fetchPostcodeDemographics(pc.postcode).then((d) => ({
            postcode: pc.postcode,
            latitude: pc.latitude,
            longitude: pc.longitude,
            imdDecile: d?.imdDecile ?? null,
            imdScore: d?.imdScore ?? null,
            adminDistrict: d?.adminDistrict || null,
          })),
        ),
      );
      for (const r of lookups) {
        if (r.status === 'fulfilled' && r.value.imdDecile != null) {
          points.push(r.value);
        }
      }
    }

    res.json({
      count: points.length,
      points,
      radiusMeters: radius,
      centroid: { latitude: lat, longitude: lng },
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'IMD area lookup failed' });
  }
});

app.post('/api/company-check', async (req, res) => {
  const { companyName, companyNumber } = req.body || {};
  if (!companyName && !companyNumber) {
    res.status(400).json({ error: 'companyName or companyNumber required.' });
    return;
  }

  sseHeaders(res);
  const apisFailed = [];
  let resolvedNumber = companyNumber;
  let searchResults = null;

  if (!resolvedNumber) {
    const chLabel = COMPANIES_HOUSE_KEY
      ? `Companies House — search by name (key len=${COMPANIES_HOUSE_KEY.length}, starts=${COMPANIES_HOUSE_KEY.slice(0, 4)}…)`
      : 'Companies House — search by name · COMPANIES_HOUSE_KEY env var MISSING on backend';
    const search = await runStep(
      res,
      'ch-search',
      chLabel,
      () => searchCompanies(companyName, COMPANIES_HOUSE_KEY),
    );
    if (!search.ok || !search.value || search.value.length === 0) {
      if (!search.ok) apisFailed.push('companies-house-search');
      sseSend(res, 'error', {
        message: search.ok
          ? 'No companies matched that name.'
          : `Companies House search failed: ${search.error}`,
      });
      res.end();
      return;
    }
    searchResults = search.value;
    // Pick the most relevant match — not just the first one returned by
    // Companies House. For "Barratt Developments PLC" search, the API
    // returns recent newly-incorporated subsidiaries first, but the user
    // almost certainly wants the established PLC parent.
    const ranked = rankCompanyMatches(search.value, companyName);
    resolvedNumber = ranked[0].companyNumber;
    sseSend(res, 'company-matched', {
      matched: ranked[0],
      otherCandidates: ranked.slice(1, 5),
    });
  }

  const bundleStep = await runStep(
    res,
    'ch-profile',
    `Companies House — profile / officers / PSC / charges / insolvency`,
    () => fetchCompanyBundle(resolvedNumber, COMPANIES_HOUSE_KEY),
  );
  if (!bundleStep.ok) {
    apisFailed.push('companies-house-bundle');
    sseSend(res, 'error', { message: bundleStep.error });
    res.end();
    return;
  }
  const bundle = bundleStep.value;
  if (bundle.errors?.length) {
    apisFailed.push(...bundle.errors.map((e) => `ch-${e.source}`));
  }

  sseSend(res, 'partial-data', {
    partial: {
      profile: bundle.profile,
      officers: bundle.officers,
      psc: bundle.psc,
      charges: bundle.charges,
      insolvency: bundle.insolvency,
      filingHistory: bundle.filingHistory,
    },
  });

  // Run sanctions / PEP / watchlist checks on the company itself and each
  // PSC + officer in parallel. All free, no API keys.
  const sanctionsTargets = [
    { name: bundle.profile?.company_name, schema: 'Company', role: 'Company' },
    ...(bundle.psc?.items || []).map((p) => ({
      name: p.name,
      schema: p.kind?.includes('individual') ? 'Person' : 'Company',
      role: 'PSC',
    })),
    ...(bundle.officers?.items || [])
      .filter((o) => !o.resigned_on)
      .map((o) => ({ name: o.name, schema: 'Person', role: 'Director' })),
  ].filter((t) => t.name);

  const ccodStep = await runStep(
    res,
    'ccod',
    'Land Registry CCOD/OCOD — UK property holdings lookup (free, key required)',
    () => searchCorporatePropertyHoldings(bundle.profile?.company_number),
  );

  const voaStep = await runStep(
    res,
    'voa',
    'VOA — live business rates lookup at registered office (free)',
    () => fetchVoaForCompany(bundle.profile),
  );

  const sanctionsStep = await runStep(
    res,
    'sanctions',
    `Sanctions / PEP — OpenSanctions + HM Treasury OFSI (free, ${sanctionsTargets.length} entities)`,
    async () => {
      const results = await Promise.all(
        sanctionsTargets.slice(0, 12).map(async (t) => {
          try {
            const result = await checkSanctions(t.name, { schema: t.schema });
            return { ...t, ...result };
          } catch (err) {
            return { ...t, error: err.message };
          }
        }),
      );
      return {
        checked: results.length,
        flagged: results.filter(
          (r) =>
            (r.openSanctions?.highConfidenceMatches || 0) > 0 ||
            (r.ofsi?.matchesTotal || 0) > 0,
        ),
        results,
      };
    },
  );
  const apisFailedExtra = sanctionsStep.ok ? [] : ['sanctions'];
  const sanctionsResult = sanctionsStep.value || null;

  const apisQueried = 7;
  const apisSuccessful = apisQueried - apisFailed.length - apisFailedExtra.length;

  const companyRawData = {
    searchResults,
    ...bundle,
    sanctions: sanctionsResult,
    propertyHoldings: ccodStep.value || null,
    propertyHoldingsError: ccodStep.ok ? null : ccodStep.error,
    voaLive: voaStep.value || null,
    voaLiveError: voaStep.ok ? null : voaStep.error,
    voaLinks: buildVoaLinksForCompany(bundle.profile),
    meta: { apisQueried, apisSuccessful, apisFailed: [...apisFailed, ...apisFailedExtra] },
  };

  sseSend(res, 'raw-data', { rawData: companyRawData });

  const fallbackReport = buildCompanyFallbackReport({
    companyInput: companyName || resolvedNumber,
    rawData: companyRawData,
  });

  if (!ANTHROPIC_API_KEY) {
    sseSend(res, 'step', {
      name: 'claude',
      label: 'Claude AI synthesis (skipped — using rule-based fallback)',
      status: 'failed',
      error: 'No ANTHROPIC_API_KEY configured. Showing report built directly from Companies House data.',
    });
    sseSend(res, 'report', fallbackReport);
    res.end();
    return;
  }

  const userMessage = buildCompanyUserMessage({
    companyInput: companyName || resolvedNumber,
    rawData: companyRawData,
  });

  sseSend(res, 'step', {
    name: 'claude',
    label: 'Claude AI synthesis',
    status: 'running',
  });

  let collected = '';
  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      system: COMPANY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    stream.on('text', (delta) => {
      collected += delta;
      sseSend(res, 'ai-delta', { text: delta });
    });

    const finalMessage = await stream.finalMessage();
    sseSend(res, 'step', {
      name: 'claude',
      label: 'Claude AI synthesis',
      status: 'complete',
    });

    const fullText = finalMessage.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = tryParseJson(fullText) || tryParseJson(collected);

    if (!parsed) {
      sseSend(res, 'report', fallbackReport);
    } else {
      sseSend(res, 'report', parsed);
    }
  } catch (err) {
    sseSend(res, 'step', {
      name: 'claude',
      label: 'Claude AI synthesis (failed — using rule-based fallback)',
      status: 'failed',
      error: err?.message || 'Claude error',
    });
    sseSend(res, 'report', fallbackReport);
  }

  res.end();
});

app.post('/api/comparables', async (req, res) => {
  const { postcode, address, lastSalePrice, lastSaleDate, propertyType } = req.body || {};
  if (!postcode) {
    res.status(400).json({ error: 'postcode required.' });
    return;
  }
  if (!ANTHROPIC_API_KEY) {
    res.status(503).json({
      error:
        'Market comparables agent requires ANTHROPIC_API_KEY to be configured on the server. This feature uses Claude with web search.',
    });
    return;
  }

  sseHeaders(res);
  sseSend(res, 'step', {
    name: 'comparables',
    label: 'Searching Rightmove / Zoopla / OnTheMarket via Claude web search',
    status: 'running',
  });

  let collected = '';
  try {
    const stream = anthropic.messages.stream({
      model: MODEL_COMPARABLES,
      max_tokens: 4000,
      system: COMPARABLES_SYSTEM_PROMPT,
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 6,
          allowed_domains: [
            'rightmove.co.uk',
            'zoopla.co.uk',
            'onthemarket.com',
            'spareroom.co.uk',
            'gov.uk',
            'ons.gov.uk',
          ],
        },
      ],
      messages: [
        {
          role: 'user',
          content: buildComparablesUserMessage({
            postcode,
            address,
            lastSalePrice,
            lastSaleDate,
            propertyType,
          }),
        },
      ],
    });

    stream.on('text', (delta) => {
      collected += delta;
      sseSend(res, 'delta', { text: delta });
    });

    const finalMessage = await stream.finalMessage();
    const fullText = finalMessage.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = tryParseJson(fullText) || tryParseJson(collected);

    sseSend(res, 'step', {
      name: 'comparables',
      label: 'Claude web-search comparables analysis',
      status: 'complete',
    });

    if (parsed) {
      sseSend(res, 'comparables', parsed);
    } else {
      sseSend(res, 'error', {
        message: 'Claude returned a response that could not be parsed as JSON.',
        raw: fullText.slice(0, 4000),
      });
    }
  } catch (err) {
    sseSend(res, 'step', {
      name: 'comparables',
      label: 'Claude web-search comparables analysis',
      status: 'failed',
      error: err?.message || 'Claude error',
    });
    sseSend(res, 'error', { message: err?.message || 'Comparables agent failed.' });
  }

  res.end();
});

app.post('/api/export-docx', async (req, res) => {
  const { report, rawData, investmentMemo } = req.body || {};
  if (!report || !report.reportType) {
    res.status(400).json({ error: 'report (with reportType) required.' });
    return;
  }
  try {
    const buf =
      report.reportType === 'company'
        ? await buildCompanyDocx(report, rawData || {})
        : await buildPropertyDocx(report, rawData || {}, { investmentMemo });

    const safeName = String(report.queryInput || 'report')
      .replace(/[^a-z0-9-]+/gi, '_')
      .slice(0, 80);
    const filename = `propertyiq_${report.reportType}_${safeName}.docx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'DOCX generation failed.' });
  }
});

// Investment memo — Claude streams a structured Markdown memo derived from
// the report JSON. Pure synthesis — no web search. Chunked Markdown is
// emitted via SSE 'delta' events; the final memo arrives in 'memo'.
app.post('/api/investment-memo', async (req, res) => {
  const { report } = req.body || {};
  if (!report || report.reportType !== 'property') {
    res.status(400).json({ error: 'A property report is required.' });
    return;
  }
  if (!ANTHROPIC_API_KEY) {
    res.status(503).json({
      error: 'Investment memo requires ANTHROPIC_API_KEY on the server.',
    });
    return;
  }

  sseHeaders(res);
  sseSend(res, 'step', {
    name: 'memo',
    label: 'Drafting investment memorandum (Claude)',
    status: 'running',
  });

  let collected = '';
  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 4000,
      system: INVESTMENT_MEMO_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildInvestmentMemoUserMessage(report) }],
    });
    stream.on('text', (delta) => {
      collected += delta;
      sseSend(res, 'delta', { text: delta });
    });
    await stream.finalMessage();
    sseSend(res, 'step', { name: 'memo', label: 'Memo complete', status: 'complete' });
    sseSend(res, 'memo', { markdown: collected });
  } catch (err) {
    sseSend(res, 'step', {
      name: 'memo',
      label: 'Memo failed',
      status: 'failed',
      error: err?.message,
    });
    sseSend(res, 'error', { message: err?.message || 'Memo generation failed.' });
  }
  res.end();
});

// Generic helper for the on-demand Claude web-search agents (AVM,
// adverse media, construction cost). Each endpoint just wires its prompt
// + body shape to this runner.
async function runWebSearchAgent(res, { systemPrompt, userMessage, allowedDomains, maxUses, eventName, label }) {
  if (!ANTHROPIC_API_KEY) {
    res.status(503).json({
      error: `${label} requires ANTHROPIC_API_KEY to be configured on the server.`,
    });
    return;
  }
  sseHeaders(res);
  sseSend(res, 'step', { name: 'agent', label, status: 'running' });

  let collected = '';
  try {
    const stream = anthropic.messages.stream({
      model: MODEL_COMPARABLES,
      max_tokens: 4000,
      system: systemPrompt,
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: maxUses || 6,
          allowed_domains: allowedDomains,
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
    });
    stream.on('text', (delta) => {
      collected += delta;
      sseSend(res, 'delta', { text: delta });
    });
    const finalMessage = await stream.finalMessage();
    const fullText = finalMessage.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = tryParseJson(fullText) || tryParseJson(collected);
    sseSend(res, 'step', { name: 'agent', label, status: 'complete' });
    if (parsed) {
      sseSend(res, eventName, parsed);
    } else {
      sseSend(res, 'error', { message: 'Agent returned a response that could not be parsed as JSON.', raw: fullText.slice(0, 4000) });
    }
  } catch (err) {
    sseSend(res, 'step', { name: 'agent', label, status: 'failed', error: err?.message });
    sseSend(res, 'error', { message: err?.message || 'Agent failed.' });
  }
  res.end();
}

app.post('/api/avm', async (req, res) => {
  const { address, postcode, propertyType, bedrooms, lastSalePrice, lastSaleDate, floorAreaSqM } = req.body || {};
  if (!postcode) {
    res.status(400).json({ error: 'postcode required' });
    return;
  }
  await runWebSearchAgent(res, {
    systemPrompt: AVM_SYSTEM_PROMPT,
    userMessage: buildAvmUserMessage({ address, postcode, propertyType, bedrooms, lastSalePrice, lastSaleDate, floorAreaSqM }),
    allowedDomains: ['rightmove.co.uk', 'zoopla.co.uk', 'onthemarket.com'],
    eventName: 'avm',
    label: 'AVM / Sale valuation agent — Claude + web search (Rightmove/Zoopla/OnTheMarket)',
  });
});

app.post('/api/adverse-media', async (req, res) => {
  const { companyName, companyNumber, directors } = req.body || {};
  if (!companyName) {
    res.status(400).json({ error: 'companyName required' });
    return;
  }
  await runWebSearchAgent(res, {
    systemPrompt: ADVERSE_MEDIA_SYSTEM_PROMPT,
    userMessage: buildAdverseMediaUserMessage({ companyName, companyNumber, directors }),
    allowedDomains: [
      'ft.com',
      'theguardian.com',
      'thetimes.co.uk',
      'telegraph.co.uk',
      'bbc.co.uk',
      'cityam.com',
      'propertyweek.com',
      'fnlondon.com',
      'reuters.com',
      'bloomberg.com',
      'gov.uk',
    ],
    maxUses: 8,
    eventName: 'adverse-media',
    label: 'Adverse media agent — Claude + web search (FT/Guardian/BBC/Property Week/etc.)',
  });
});

// Synchronous VAT verification — no Claude / no SSE. Takes a VAT number,
// returns HMRC / VIES verification result. Free, fast, deterministic.
app.post('/api/vat-verify', async (req, res) => {
  const { vatNumber } = req.body || {};
  if (!vatNumber) {
    res.status(400).json({ error: 'vatNumber required' });
    return;
  }
  try {
    const result = await verifyVatNumber(vatNumber, {
      hmrcClientId: HMRC_CLIENT_ID,
      hmrcClientSecret: HMRC_CLIENT_SECRET,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'VAT verification failed.' });
  }
});

app.post('/api/vat-lookup', async (req, res) => {
  const { companyName, companyNumber } = req.body || {};
  if (!companyName) {
    res.status(400).json({ error: 'companyName required' });
    return;
  }
  await runWebSearchAgent(res, {
    systemPrompt: VAT_LOOKUP_SYSTEM_PROMPT,
    userMessage: buildVatUserMessage({ companyName, companyNumber }),
    allowedDomains: [
      'gov.uk',
      'tax.service.gov.uk',
      'find-and-update.company-information.service.gov.uk',
      'europa.eu',
      // Many companies publish their VAT number in the footer of their site;
      // allowing all domains too would be useful but is too broad — Claude
      // will use search to find the company's site via gov.uk hits anyway.
    ],
    maxUses: 6,
    eventName: 'vat-lookup',
    label: 'VAT lookup agent — Claude + web search (gov.uk + EU VIES)',
  });
});

app.post('/api/corporate-properties', async (req, res) => {
  const { companyName, companyNumber } = req.body || {};
  if (!companyName) {
    res.status(400).json({ error: 'companyName required' });
    return;
  }
  await runWebSearchAgent(res, {
    systemPrompt: CORPORATE_PROPERTIES_SYSTEM_PROMPT,
    userMessage: buildCorporatePropertiesUserMessage({ companyName, companyNumber }),
    allowedDomains: [
      'propertyweek.com',
      'constructionnews.co.uk',
      'egi.co.uk',
      'estatesgazette.com',
      'find-and-update.company-information.service.gov.uk',
      'planit.org.uk',
      'gov.uk',
      'ft.com',
      'theguardian.com',
      'reuters.com',
      'bloomberg.com',
    ],
    maxUses: 8,
    eventName: 'corporate-properties',
    label: 'Corporate property holdings agent — Claude + web search (annual reports, property press)',
  });
});

app.post('/api/commercial-rents', async (req, res) => {
  const { postcode, address, localAuthority } = req.body || {};
  if (!postcode) {
    res.status(400).json({ error: 'postcode required' });
    return;
  }
  await runWebSearchAgent(res, {
    systemPrompt: COMMERCIAL_RENTS_SYSTEM_PROMPT,
    userMessage: buildCommercialRentsUserMessage({ postcode, address, localAuthority }),
    allowedDomains: ['rightmove.co.uk', 'realla.co.uk', 'egi.co.uk', 'estatesgazette.com'],
    maxUses: 8,
    eventName: 'commercial-rents',
    label: 'Commercial rents agent — Rightmove Commercial / Realla / EG (alt to CoStar)',
  });
});

app.post('/api/hmo-rents', async (req, res) => {
  const { postcode, address, lastSalePrice, lastSaleDate, articleFourPresent } = req.body || {};
  if (!postcode) {
    res.status(400).json({ error: 'postcode required' });
    return;
  }
  await runWebSearchAgent(res, {
    systemPrompt: HMO_RENTS_SYSTEM_PROMPT,
    userMessage: buildHmoRentsUserMessage({ postcode, address, lastSalePrice, lastSaleDate, articleFourPresent }),
    allowedDomains: ['spareroom.co.uk', 'openrent.co.uk', 'rightmove.co.uk', 'zoopla.co.uk', 'gumtree.com'],
    maxUses: 6,
    eventName: 'hmo-rents',
    label: 'HMO rents agent — SpareRoom / OpenRent / Rightmove rooms',
  });
});

app.post('/api/construction-cost', async (req, res) => {
  const { address, postcode, localAuthority, region, scope } = req.body || {};
  if (!postcode) {
    res.status(400).json({ error: 'postcode required' });
    return;
  }
  await runWebSearchAgent(res, {
    systemPrompt: CONSTRUCTION_COST_SYSTEM_PROMPT,
    userMessage: buildConstructionCostUserMessage({ address, postcode, localAuthority, region, scope }),
    allowedDomains: [
      'rics.org',
      'bcis.co.uk',
      'aecom.com',
      'mottmac.com',
      'propertyweek.com',
      'constructionnews.co.uk',
      'building.co.uk',
      'gov.uk',
      'ons.gov.uk',
    ],
    maxUses: 6,
    eventName: 'construction-cost',
    label: 'Construction cost agent — Claude + web search (RICS BCIS / AECOM / construction press)',
  });
});

app.post('/api/chat', async (req, res) => {
  const { messages, reportContext } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array required.' });
    return;
  }

  sseHeaders(res);
  const system = `You are PropertyIQ's senior analyst, continuing a conversation about a previously analysed ${
    reportContext?.reportType || 'property'
  } report. Answer follow-up questions concisely (under 200 words unless the user asks for detail). Reference the report data when answering. If the user asks for something the data doesn't cover, say so and suggest where to find it.

REPORT CONTEXT:
${JSON.stringify(reportContext || {}, null, 2)}`;

  try {
    const stream = anthropic.messages.stream({
      model: MODEL_CHAT,
      max_tokens: 1500,
      system,
      messages,
    });

    stream.on('text', (delta) => {
      sseSend(res, 'delta', { text: delta });
    });

    await stream.finalMessage();
    sseSend(res, 'done', {});
  } catch (err) {
    sseSend(res, 'error', { message: err?.message || 'Chat failed.' });
  }
  res.end();
});

// Score Companies House search results to pick the most likely intended
// match for the user's query. Without scoring, the API returns recent or
// alphabetical matches first, which often surfaces tiny new subsidiaries
// instead of the well-known parent company the user typed.
function rankCompanyMatches(results, query) {
  const q = String(query || '').toUpperCase().trim();
  const qNoPunc = q.replace(/[^A-Z0-9 ]/g, '');
  const wantsPlc = /\bP\.?L\.?C\.?\b|PUBLIC LIMITED/i.test(query);

  const scored = results.map((r) => {
    const name = String(r.title || '').toUpperCase();
    const nameNoPunc = name.replace(/[^A-Z0-9 ]/g, '');
    let score = 0;

    // Exact match (after normalisation) wins
    if (nameNoPunc === qNoPunc) score += 100;
    // Same name with/without "PLC" / "LIMITED" suffix
    if (
      nameNoPunc.replace(/\s+(PLC|LIMITED|LTD|LLP)\s*$/g, '') ===
      qNoPunc.replace(/\s+(PLC|LIMITED|LTD|LLP)\s*$/g, '')
    ) {
      score += 60;
    }

    // Active companies preferred over dissolved/dormant
    if (r.status === 'active') score += 30;
    if (/dissolved|liquidation/.test(r.status || '')) score -= 30;

    // PLC vs LTD matching
    if (wantsPlc && / PLC$/.test(name)) score += 40;
    if (wantsPlc && /LIMITED$|LTD$/.test(name)) score -= 10;
    if (!wantsPlc && /LIMITED$|LTD$/.test(name)) score += 5;

    // Established companies preferred (more likely the famous one)
    if (r.incorporatedDate) {
      const ageYears =
        (Date.now() - new Date(r.incorporatedDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
      if (ageYears > 25) score += 25;
      else if (ageYears > 10) score += 15;
      else if (ageYears > 5) score += 5;
      else if (ageYears < 2) score -= 10; // Recent subsidiaries
    }

    return { r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.r);
}

function tryParseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

app.listen(PORT, () => {
  console.log(`[propertyiq] Server listening on http://localhost:${PORT}`);
  console.log(`[propertyiq] Allowed origin: ${ALLOWED_ORIGIN}`);
  console.log(`[propertyiq] Models — synthesis: ${MODEL}, comparables: ${MODEL_COMPARABLES}, chat: ${MODEL_CHAT}`);
});
