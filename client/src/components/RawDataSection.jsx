import { useState } from 'react';

// Renders every field returned by every data source in expandable groups.
// This is the "show me everything" view — no curation.
export default function RawDataSection({ rawData }) {
  if (!rawData || Object.keys(rawData).length === 0) return null;

  const entries = Object.entries(rawData).filter(([, v]) => v != null);

  return (
    <section className="card">
      <header className="mb-3">
        <p className="card-title">All raw API data</p>
        <h3 className="mt-1 font-display text-lg font-bold">Every field, every source</h3>
        <p className="mt-1 text-xs text-slate-500">
          The cards above show the curated subset that drives the analysis. Below is everything
          each API actually returned for this query — useful when you want to drill into a
          specific field that didn't make it to the cards.
        </p>
      </header>

      <div className="space-y-2">
        {entries.map(([key, value]) => (
          <RawDataGroup key={key} sourceKey={key} value={value} />
        ))}
      </div>
    </section>
  );
}

function RawDataGroup({ sourceKey, value }) {
  const [open, setOpen] = useState(false);
  const summary = summariseValue(value);

  return (
    <div className="rounded-xl border border-cream-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-cream-50"
      >
        <div className="min-w-0">
          <p className="font-semibold text-claude-700">{prettySourceName(sourceKey)}</p>
          <p className="truncate text-xs text-slate-500">{summary}</p>
        </div>
        <span className="text-claude-700">{open ? '−' : '+'}</span>
      </button>
      {open && <RawDataContent value={value} />}
    </div>
  );
}

function RawDataContent({ value }) {
  // For arrays of records → render as a table. For everything else → JSON tree.
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
    return <RecordTable records={value} />;
  }
  if (Array.isArray(value)) {
    if (value.length === 0)
      return (
        <div className="border-t border-cream-200 px-4 py-3 text-xs text-slate-500">
          (empty array)
        </div>
      );
    return (
      <ul className="border-t border-cream-200 px-4 py-3 text-xs">
        {value.map((v, i) => (
          <li key={i} className="font-mono text-slate-700">
            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === 'object') {
    return <FieldTable obj={value} />;
  }
  return (
    <div className="border-t border-cream-200 px-4 py-3 font-mono text-xs text-slate-700">
      {String(value)}
    </div>
  );
}

function FieldTable({ obj, depth = 0 }) {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return (
      <div className="border-t border-cream-200 px-4 py-3 text-xs text-slate-500">
        (empty object)
      </div>
    );
  }

  return (
    <div className={depth === 0 ? 'border-t border-cream-200' : 'mt-1 border-l-2 border-cream-200 pl-3'}>
      <table className="w-full" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '34%' }} />
          <col style={{ width: '66%' }} />
        </colgroup>
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="border-b border-cream-100 last:border-b-0">
              <td className="bg-cream-50 px-3 py-2 align-top text-xs font-semibold text-ink" style={{ wordBreak: 'normal', overflowWrap: 'anywhere' }}>
                {k}
              </td>
              <td className="px-3 py-2 align-top text-xs text-slate-700" style={{ wordBreak: 'normal', overflowWrap: 'anywhere' }}>
                {renderValue(v, depth)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderValue(v, depth) {
  if (v == null) return <span className="italic text-slate-400">null</span>;
  if (typeof v === 'boolean')
    return (
      <span className={v ? 'text-ok-text' : 'text-slate-500'}>{v ? 'true' : 'false'}</span>
    );
  if (typeof v === 'number') return <span className="font-mono">{v}</span>;
  if (typeof v === 'string') {
    if (v.startsWith('http://') || v.startsWith('https://')) {
      return (
        <a href={v} target="_blank" rel="noopener noreferrer" className="text-claude-700 hover:underline">
          {v}
        </a>
      );
    }
    return <span className="break-words">{v}</span>;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="italic text-slate-400">[]</span>;
    if (typeof v[0] === 'object') {
      return <RecordTable records={v} compact />;
    }
    return <span>{v.map((x) => String(x)).join(', ')}</span>;
  }
  if (typeof v === 'object') {
    return <FieldTable obj={v} depth={depth + 1} />;
  }
  return <span>{String(v)}</span>;
}

function RecordTable({ records, compact }) {
  // Collect every key across all records so we don't drop columns.
  const keys = Array.from(
    records.reduce((set, r) => {
      if (r && typeof r === 'object') {
        for (const k of Object.keys(r)) set.add(k);
      }
      return set;
    }, new Set()),
  );

  return (
    <div className={`overflow-x-auto ${compact ? '' : 'border-t border-cream-200'}`}>
      <table className="text-xs" style={{ minWidth: '100%', tableLayout: 'auto' }}>
        <thead>
          <tr className="bg-cream-100">
            {keys.map((k) => (
              <th
                key={k}
                className="whitespace-nowrap border-b border-cream-200 px-3 py-1.5 text-left font-semibold text-claude-700"
              >
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i} className="border-b border-cream-100">
              {keys.map((k) => (
                <td
                  key={k}
                  className="px-3 py-1.5 align-top text-slate-700"
                  style={{
                    minWidth: '100px',
                    maxWidth: '320px',
                    wordBreak: 'normal',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {renderValue(r?.[k], 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function prettySourceName(key) {
  const map = {
    postcode: 'Postcodes.io geocoding',
    pricePaid: 'HM Land Registry — Price Paid Data',
    priceSummary: 'Land Registry — derived price summary',
    planning: 'Planning Data GOV.UK',
    flood: 'Environment Agency — flood risk',
    epc: 'EPC Register',
    epcMatch: 'EPC Register — best-match record',
    imd: 'ONS — Index of Multiple Deprivation',
    onsRental: 'ONS — Rental Price Index',
    planit: 'PlanIt UK — recent planning applications',
    environmentalLinks: 'Authoritative source links',
    profile: 'Companies House — profile',
    officers: 'Companies House — officers',
    psc: 'Companies House — PSC register',
    charges: 'Companies House — charges',
    insolvency: 'Companies House — insolvency',
    filingHistory: 'Companies House — filing history',
    searchResults: 'Companies House — search results',
    errors: 'Errors / failures',
    meta: 'Metadata',
  };
  return map[key] || key;
}

function summariseValue(v) {
  if (v == null) return 'null';
  if (Array.isArray(v)) return `array · ${v.length} item${v.length === 1 ? '' : 's'}`;
  if (typeof v === 'object') return `object · ${Object.keys(v).length} field${Object.keys(v).length === 1 ? '' : 's'}`;
  return String(v).slice(0, 100);
}
