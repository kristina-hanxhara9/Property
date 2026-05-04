import { useState } from 'react';
import { streamPostSSE } from '../lib/sseClient.js';
import { apiUrl } from '../lib/api.js';

export default function MarketComparables({ report, onResult }) {
  const [state, setState] = useState('idle'); // idle | running | done | error | unavailable
  const [data, setData] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);

  async function handleRun() {
    setState('running');
    setData(null);
    setStreamingText('');
    setErrorMessage(null);

    let buffer = '';

    const postcode = report?.queryInput?.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/i)?.[1];
    const body = {
      postcode: postcode || '',
      address: report?.queryInput || '',
      lastSalePrice: report?.lastSalePrice || null,
      lastSaleDate: report?.lastSaleDate || null,
      propertyType: report?.priceHistory?.[0]?.propertyType || null,
    };

    try {
      const fetchRes = await fetch(apiUrl('/api/comparables'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (fetchRes.status === 503) {
        setState('unavailable');
        setErrorMessage(
          'Configure ANTHROPIC_API_KEY on the backend to enable Claude web-search comparables.',
        );
        return;
      }
      if (!fetchRes.ok) {
        const text = await fetchRes.text();
        throw new Error(text || `Server returned ${fetchRes.status}`);
      }

      const reader = fetchRes.body.getReader();
      const decoder = new TextDecoder();
      let raw = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = raw.indexOf('\n\n')) !== -1) {
          const eventBlock = raw.slice(0, idx);
          raw = raw.slice(idx + 2);
          const ev = parseEvent(eventBlock);
          if (!ev) continue;
          if (ev.event === 'delta' && ev.data?.text) {
            buffer += ev.data.text;
            setStreamingText(buffer);
          } else if (ev.event === 'comparables') {
            setData(ev.data);
            setState('done');
            onResult?.(ev.data);
          } else if (ev.event === 'error') {
            setErrorMessage(ev.data?.message || 'Comparables agent failed.');
            setState('error');
          }
        }
      }
    } catch (err) {
      setErrorMessage(err.message || 'Comparables agent failed.');
      setState('error');
    }
  }

  return (
    <section className="card">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="card-title">Market comparables</p>
          <h3 className="mt-1 font-display text-lg font-bold">
            Live rental evidence via Claude + web search
          </h3>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={handleRun}
          disabled={state === 'running'}
        >
          {state === 'running' ? 'Searching…' : data ? 'Re-run' : 'Run comparables agent'}
        </button>
      </header>

      <p className="mb-3 text-xs text-slate-500">
        Uses Claude with the web-search tool to look up recent Rightmove / Zoopla / OnTheMarket listings
        within ~0.5 miles. Asking-rent evidence only — not transacted rents. Costs ~$0.05 per run.
      </p>

      {state === 'idle' && (
        <div className="rounded-xl border border-dashed border-cream-200 bg-cream-50 p-5 text-center text-sm text-slate-600">
          Click <strong className="text-ink">Run comparables agent</strong> to fetch live market evidence for this property.
        </div>
      )}

      {state === 'unavailable' && (
        <div className="rounded-xl border border-warn-bg bg-warn-bg/40 p-4 text-sm text-warn-text">
          <strong>Agent not configured:</strong> {errorMessage}
        </div>
      )}

      {state === 'running' && (
        <div className="rounded-xl border border-cream-200 bg-cream-50 p-4 text-sm">
          <p className="mb-2 font-semibold text-claude-700">
            <span className="tick-pulse">●</span> Searching live listings…
          </p>
          {streamingText && (
            <pre className="whitespace-pre-wrap text-xs text-slate-600">{streamingText}</pre>
          )}
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-xl border border-crit-bg bg-crit-bg/40 p-4 text-sm text-crit-text">
          {errorMessage}
        </div>
      )}

      {state === 'done' && data && (
        <div className="space-y-4">
          {data.areaSummary && (
            <p className="text-sm text-slate-700">{data.areaSummary}</p>
          )}

          {data.typicalRentRange && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat
                label="Typical rent (low)"
                value={formatGBP(data.typicalRentRange.low)}
                sub={`per ${data.typicalRentRange.period || 'month'}`}
              />
              <Stat
                label="Typical rent (high)"
                value={formatGBP(data.typicalRentRange.high)}
                sub={`per ${data.typicalRentRange.period || 'month'}`}
              />
              <Stat
                label="Confidence"
                value={data.confidence || '—'}
                sub={`from ${data.comparables?.length || 0} comps`}
              />
            </div>
          )}

          {data.estimatedYield && (data.estimatedYield.lowPct != null || data.estimatedYield.highPct != null) && (
            <div className="rounded-xl border border-cream-200 bg-cream-50 p-3 text-sm">
              <p className="font-semibold text-ink">
                Estimated gross yield: {data.estimatedYield.lowPct?.toFixed(1)}% –{' '}
                {data.estimatedYield.highPct?.toFixed(1)}%
              </p>
              <p className="text-xs text-slate-600">{data.estimatedYield.basisOfEstimate}</p>
            </div>
          )}

          {data.comparables && data.comparables.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-claude-700">
                Comparables found
              </p>
              <ul className="space-y-2">
                {data.comparables.map((c, i) => (
                  <li key={i} className="rounded-xl bg-cream-50 p-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold text-ink">{c.address}</p>
                      <span className="font-display font-bold text-claude-700 tabular-nums">
                        {formatGBP(c.rentPerMonth)}/mo
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      {c.bedrooms ? `${c.bedrooms}-bed ` : ''}
                      {c.propertyType || ''} · {c.source}
                      {c.listedDate ? ` · listed ${c.listedDate}` : ''}
                    </p>
                    {c.notes && <p className="mt-1 text-xs text-slate-600">{c.notes}</p>}
                    {c.sourceUrl && (
                      <a
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs text-claude-700 hover:underline"
                      >
                        View listing ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.caveats && data.caveats.length > 0 && (
            <div className="rounded-xl bg-cream-50 p-3 text-xs text-slate-600">
              <p className="mb-1 font-semibold uppercase tracking-wider text-claude-700">
                Caveats
              </p>
              <ul className="space-y-0.5">
                {data.caveats.map((c, i) => (
                  <li key={i}>· {c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-cream-50 p-3 text-center">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="font-display text-lg font-bold text-ink tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function parseEvent(raw) {
  const lines = raw.split('\n');
  let event = 'message';
  let data = '';
  for (const l of lines) {
    if (l.startsWith('event:')) event = l.slice(6).trim();
    else if (l.startsWith('data:')) data += l.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { event, data: JSON.parse(data) };
  } catch {
    return { event, data };
  }
}

function formatGBP(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value);
}
