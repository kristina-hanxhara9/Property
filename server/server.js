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

import { PROPERTY_SYSTEM_PROMPT, buildPropertyUserMessage } from './prompts/propertyAnalysis.js';
import { COMPANY_SYSTEM_PROMPT, buildCompanyUserMessage } from './prompts/companyAnalysis.js';

const PORT = Number(process.env.PORT || 3001);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const COMPANIES_HOUSE_KEY = process.env.COMPANIES_HOUSE_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

if (!ANTHROPIC_API_KEY) {
  console.warn('[propertyiq] ANTHROPIC_API_KEY is not set — Claude synthesis will fail.');
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

const app = express();
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
  res.json({ status: 'ok', model: MODEL, time: new Date().toISOString() });
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

  const [pricePaid, planning, flood] = await Promise.all([
    pricePaidPromise,
    planningPromise,
    floodPromise,
  ]);
  if (!pricePaid.ok) apisFailed.push('land-registry-price-paid');
  if (!planning.ok) apisFailed.push('planning-data-gov-uk');
  if (!flood.ok) apisFailed.push('environment-agency-flood');

  apiResults.pricePaid = pricePaid.value || null;
  apiResults.priceSummary = pricePaid.value
    ? summarisePriceHistory(pricePaid.value.transactions)
    : null;
  apiResults.planning = planning.value || null;
  apiResults.flood = flood.value || null;

  sseSend(res, 'partial-data', { partial: apiResults });

  const apisQueried = 4;
  const apisSuccessful = apisQueried - apisFailed.length;

  const userMessage = buildPropertyUserMessage({
    address,
    postcode: postcodeStr,
    rawData: {
      ...apiResults,
      meta: { apisQueried, apisSuccessful, apisFailed },
    },
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
      sseSend(res, 'error', {
        message: 'Claude returned a response that could not be parsed as JSON.',
        raw: fullText.slice(0, 4000),
      });
    } else {
      sseSend(res, 'report', parsed);
    }
  } catch (err) {
    sseSend(res, 'step', {
      name: 'claude',
      label: 'Claude AI synthesis',
      status: 'failed',
      error: err?.message || 'Claude error',
    });
    sseSend(res, 'error', { message: err?.message || 'Claude synthesis failed.' });
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
    const search = await runStep(
      res,
      'ch-search',
      'Companies House — search by name (free)',
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

  const userMessage = buildCompanyUserMessage({
    companyInput: companyName || resolvedNumber,
    rawData: {
      searchResults,
      ...bundle,
      meta: { apisQueried, apisSuccessful, apisFailed },
    },
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
      sseSend(res, 'error', {
        message: 'Claude returned a response that could not be parsed as JSON.',
        raw: fullText.slice(0, 4000),
      });
    } else {
      sseSend(res, 'report', parsed);
    }
  } catch (err) {
    sseSend(res, 'step', {
      name: 'claude',
      label: 'Claude AI synthesis',
      status: 'failed',
      error: err?.message || 'Claude error',
    });
    sseSend(res, 'error', { message: err?.message || 'Claude synthesis failed.' });
  }

  res.end();
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
      model: MODEL,
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
  console.log(`[propertyiq] Model: ${MODEL}`);
});
