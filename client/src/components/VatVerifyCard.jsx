// Manual VAT verification — user enters a known UK / NI VAT number and we
// verify it via HMRC API (when configured) or EU VIES (free, NI only).
// Sits next to the AI VAT lookup agent so the user has both options:
//   - "I know the number" → enter + verify (free, deterministic)
//   - "Find me the number" → AI agent (Claude web search, ~$0.05)

import { useState } from 'react';
import { apiUrl } from '../lib/api.js';
import { safeText } from '../lib/safeText.js';

export default function VatVerifyCard() {
  const [vatNumber, setVatNumber] = useState('');
  const [state, setState] = useState('idle'); // idle | running | done | error
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  async function handleVerify() {
    if (!vatNumber.trim()) return;
    setState('running');
    setResult(null);
    setErrorMessage(null);
    try {
      const res = await fetch(apiUrl('/api/vat-verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vatNumber: vatNumber.trim() }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Server returned ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
      setState('done');
    } catch (err) {
      setErrorMessage(err.message);
      setState('error');
    }
  }

  return (
    <section className="card">
      <header className="mb-3">
        <p className="card-title">VAT verify · HMRC + VIES</p>
        <h3 className="mt-1 font-display text-lg font-bold">
          Verify a known VAT number directly
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Type the GB or XI VAT number from the company's invoices / website footer. Verifies via
          HMRC's official API (when HMRC_CLIENT_ID + HMRC_CLIENT_SECRET are configured) or EU VIES
          (free, no key, NI/XI numbers only). Fast and free — no Claude credits used.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleVerify();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="text"
          value={vatNumber}
          onChange={(e) => setVatNumber(e.target.value.toUpperCase())}
          placeholder="GB 123 4567 89"
          className="flex-1 rounded-xl border border-cream-200 bg-white px-4 py-2.5 text-sm font-mono outline-none focus:border-claude focus:ring-2 focus:ring-claude/20"
          disabled={state === 'running'}
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={state === 'running' || !vatNumber.trim()}
        >
          {state === 'running' ? 'Verifying…' : 'Verify'}
        </button>
      </form>

      {state === 'error' && (
        <div className="rounded-xl border border-crit-bg bg-crit-bg/40 p-3 text-sm text-crit-text">
          {safeText(errorMessage)}
        </div>
      )}

      {state === 'done' && result && <VatResult data={result} />}
    </section>
  );
}

function VatResult({ data }) {
  if (!data.formatValid) {
    return (
      <div className="rounded-xl border border-warn-bg bg-warn-bg/40 p-3 text-sm">
        <p className="font-semibold text-warn-text">Invalid format</p>
        <p className="mt-1 text-xs text-slate-700">{safeText(data.error)}</p>
      </div>
    );
  }
  if (!data.found) {
    return (
      <div className="rounded-xl border border-warn-bg bg-warn-bg/40 p-3 text-sm">
        <p className="font-semibold text-warn-text">Not verified</p>
        <p className="mt-1 text-xs text-slate-700">{safeText(data.error)}</p>
        {data.verificationMethod && (
          <p className="mt-1 text-xs text-slate-500">
            Method: {safeText(data.verificationMethod)}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-ok-bg bg-ok-bg/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-lg font-bold tabular-nums text-ok-text">
          ✓ Verified · {safeText(data.vatNumber)}
        </p>
        <span className="pill-ok">Active</span>
      </div>
      {data.vatRegisteredName && (
        <div>
          <p className="text-xs text-slate-500">Registered name</p>
          <p className="font-semibold text-ink">{safeText(data.vatRegisteredName)}</p>
        </div>
      )}
      {data.vatAddress && (
        <div>
          <p className="text-xs text-slate-500">Registered address</p>
          <p className="text-sm text-ink">{safeText(data.vatAddress)}</p>
        </div>
      )}
      {data.verificationMethod && (
        <p className="text-xs text-slate-500">
          Verified via: <span className="font-semibold">{safeText(data.verificationMethod)}</span>
        </p>
      )}
    </div>
  );
}
