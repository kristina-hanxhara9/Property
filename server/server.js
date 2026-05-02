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
import { fetchEpcByPostcode, pickBestEpc } from './apis/epc.js';
import { fetchPlanningApplications } from './apis/planit.js';
import { buildPropertyDocx, buildCompanyDocx } from './apis/docxExport.js';
import {
  fetchImdDecile,
  fetchOnsRentalGrowth,
  fetchOnsRegionalRentalGrowth,
} from './apis/ons.js';
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

const PORT = Number(process.env.PORT || 3001);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const COMPANIES_HOUSE_KEY = process.env.COMPANIES_HOUSE_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
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
  const imdPromise = runStep(
    res,
    'imd',
    'ONS Index of Multiple Deprivation (free SPARQL)',
    () => fetchImdDecile(lsoaCode),
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

  const [pricePaid, planning, flood, epc, imd, onsRental, planit] = await Promise.all([
    pricePaidPromise,
    planningPromise,
    floodPromise,
    epcPromise,
    imdPromise,
    onsRentalPromise,
    planitPromise,
  ]);
  if (!pricePaid.ok) apisFailed.push('land-registry-price-paid');
  if (!planning.ok) apisFailed.push('planning-data-gov-uk');
  if (!flood.ok) apisFailed.push('environment-agency-flood');
  if (!epc.ok) apisFailed.push('epc-register');
  if (!imd.ok) apisFailed.push('ons-imd');
  if (!onsRental.ok) apisFailed.push('ons-rental');
  if (!planit.ok) apisFailed.push('planit');

  apiResults.pricePaid = pricePaid.value || null;
  apiResults.priceSummary = pricePaid.value
    ? summarisePriceHistory(pricePaid.value.transactions)
    : null;
  apiResults.planning = planning.value || null;
  apiResults.flood = flood.value || null;
  apiResults.epc = epc.value || (epc.error ? { configured: true, error: epc.error, results: [] } : null);
  apiResults.epcMatch = epc.value ? pickBestEpc(epc.value, address) : null;
  apiResults.imd = imd.value || null;
  apiResults.onsRental = onsRental.value || null;
  apiResults.planit = planit.value || null;
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

  const apisQueried = 8;
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
    resolvedNumber = search.value[0].companyNumber;
    sseSend(res, 'company-matched', {
      matched: search.value[0],
      otherCandidates: search.value.slice(1, 5),
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

  const apisQueried = 6;
  const apisSuccessful = apisQueried - apisFailed.length;

  const companyRawData = {
    searchResults,
    ...bundle,
    meta: { apisQueried, apisSuccessful, apisFailed },
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
  const { report, rawData } = req.body || {};
  if (!report || !report.reportType) {
    res.status(400).json({ error: 'report (with reportType) required.' });
    return;
  }
  try {
    const buf =
      report.reportType === 'company'
        ? await buildCompanyDocx(report, rawData || {})
        : await buildPropertyDocx(report, rawData || {});

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
