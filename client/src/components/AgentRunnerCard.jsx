// Generic on-demand AI agent card — used for AVM, adverse media, and
// construction cost. Each runs Claude with web search against curated
// domains, returns structured JSON, and renders it via a custom render
// function passed in by the caller.

import { useState } from 'react';
import { apiUrl } from '../lib/api.js';
import { safeText } from '../lib/safeText.js';

export default function AgentRunnerCard({
  title,
  subtitle,
  endpoint,
  body,
  eventName,
  noteCost = '~$0.05–0.15 per run',
  caveats = [
    'AI-derived from public web search — not equivalent to a regulated paid API.',
    'Verify against original sources before signing.',
  ],
  renderResult,
  buttonLabel = 'Run agent',
  onResult,
}) {
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
    try {
      const fetchRes = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (fetchRes.status === 503) {
        setState('unavailable');
        setErrorMessage(
          'Configure ANTHROPIC_API_KEY on the backend to enable this AI agent.',
        );
        return;
      }
      if (!fetchRes.ok) {
        const t = await fetchRes.text();
        throw new Error(t || `Server returned ${fetchRes.status}`);
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
          const block = raw.slice(0, idx);
          raw = raw.slice(idx + 2);
          const ev = parseSseBlock(block);
          if (!ev) continue;
          if (ev.event === 'delta' && ev.data?.text) {
            buffer += ev.data.text;
            setStreamingText(buffer);
          } else if (ev.event === eventName) {
            setData(ev.data);
            setState('done');
            onResult?.(ev.data);
          } else if (ev.event === 'error') {
            setErrorMessage(ev.data?.message || 'Agent failed.');
            setState('error');
          }
        }
      }
    } catch (err) {
      setErrorMessage(err.message || 'Agent failed.');
      setState('error');
    }
  }

  return (
    <section className="card">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="card-title">AI agent · web search</p>
          <h3 className="mt-1 font-display text-lg font-bold">{safeText(title)}</h3>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={handleRun}
          disabled={state === 'running'}
        >
          {state === 'running' ? 'Searching…' : data ? 'Re-run' : buttonLabel}
        </button>
      </header>

      <p className="mb-3 text-xs text-slate-500">
        {safeText(subtitle)} <span className="ml-1 text-slate-400">· Costs {noteCost}</span>
      </p>

      {state === 'idle' && (
        <div className="rounded-xl border border-dashed border-cream-200 bg-cream-50 p-4 text-center text-sm text-slate-600">
          Click <strong className="text-ink">{buttonLabel}</strong> to run this AI agent.
        </div>
      )}

      {state === 'unavailable' && (
        <div className="rounded-xl border border-warn-bg bg-warn-bg/40 p-3 text-sm text-warn-text">
          <strong>Agent not configured:</strong> {safeText(errorMessage)}
        </div>
      )}

      {state === 'running' && (
        <div className="rounded-xl border border-cream-200 bg-cream-50 p-3 text-sm">
          <p className="mb-2 font-semibold text-claude-700">
            <span className="tick-pulse">●</span> Searching the web…
          </p>
          {streamingText && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-600">
              {streamingText}
            </pre>
          )}
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-xl border border-crit-bg bg-crit-bg/40 p-3 text-sm text-crit-text">
          {safeText(errorMessage)}
        </div>
      )}

      {state === 'done' && data && (
        <div className="space-y-3">
          {renderResult(data)}
          {caveats?.length > 0 && (
            <div className="rounded-xl bg-cream-50 p-3 text-xs text-slate-600">
              <p className="mb-1 font-semibold uppercase tracking-wider text-claude-700">
                Caveats
              </p>
              <ul className="space-y-0.5">
                {caveats.map((c, i) => (
                  <li key={i}>· {safeText(c)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function parseSseBlock(raw) {
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

export function formatGBP(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value);
}
