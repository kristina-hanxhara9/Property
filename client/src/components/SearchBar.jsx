import { useState, useEffect, useRef } from 'react';

const PROPERTY_EXAMPLES = [
  '10 Downing Street, SW1A 2AA',
  '1 Canada Square, Canary Wharf, E14 5AB',
  '350 Euston Road, NW1 3AX',
];

const COMPANY_EXAMPLES = ['Berkeley Group Holdings plc', 'Barratt Developments PLC', 'Persimmon plc'];

export default function SearchBar({ mode, onModeChange, onSubmit, busy }) {
  const [value, setValue] = useState('');
  const [recent, setRecent] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('propertyiq.recent');
      if (raw) setRecent(JSON.parse(raw).slice(0, 5));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  function persistRecent(entry) {
    try {
      const next = [entry, ...recent.filter((r) => r.value !== entry.value)].slice(0, 5);
      setRecent(next);
      localStorage.setItem('propertyiq.recent', JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    persistRecent({ mode, value: trimmed, ts: Date.now() });
    onSubmit(trimmed);
  }

  function handlePill(text) {
    if (busy) return;
    setValue(text);
    persistRecent({ mode, value: text, ts: Date.now() });
    onSubmit(text);
  }

  const examples = mode === 'property' ? PROPERTY_EXAMPLES : COMPANY_EXAMPLES;

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-full border border-cream-200 bg-white p-1 text-sm shadow-sm">
        <button
          type="button"
          className={`rounded-full px-4 py-2 font-semibold transition ${
            mode === 'property' ? 'bg-claude text-white shadow-sm' : 'text-ink/70 hover:text-claude'
          }`}
          onClick={() => onModeChange('property')}
          aria-pressed={mode === 'property'}
        >
          Property address
        </button>
        <button
          type="button"
          className={`rounded-full px-4 py-2 font-semibold transition ${
            mode === 'company' ? 'bg-claude text-white shadow-sm' : 'text-ink/70 hover:text-claude'
          }`}
          onClick={() => onModeChange('company')}
          aria-pressed={mode === 'company'}
        >
          Company / JV partner
        </button>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-cream-200">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <div className="flex flex-1 items-center gap-3 px-3">
            <SearchIcon />
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                mode === 'property'
                  ? 'Enter UK property address (e.g. 10 Downing Street, SW1A 2AA)'
                  : 'Enter company name or 8-digit company number'
              }
              className="w-full bg-transparent py-3 text-base text-ink outline-none placeholder:text-ink/40"
              disabled={busy}
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            className="btn-primary px-6"
            disabled={busy || !value.trim()}
          >
            {busy ? 'Running…' : 'Run report'}
          </button>
        </div>
      </form>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/60">
          Try an example
        </p>
        <div className="flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              className="rounded-full border border-cream-200 bg-white px-3 py-1.5 text-sm text-ink hover:border-claude-200 hover:bg-claude-50 disabled:opacity-50"
              onClick={() => handlePill(ex)}
              disabled={busy}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {recent.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/60">
            Recent searches
          </p>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <button
                key={`${r.mode}:${r.value}`}
                type="button"
                onClick={() => {
                  onModeChange(r.mode);
                  setValue(r.value);
                  onSubmit(r.value);
                }}
                disabled={busy}
                className="rounded-full bg-cream-100 px-3 py-1.5 text-sm text-ink hover:bg-cream-200 disabled:opacity-50"
              >
                <span className="mr-1.5 text-xs uppercase tracking-wider text-claude-700">
                  {r.mode === 'property' ? 'Property' : 'Company'}
                </span>
                {r.value}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      className="h-5 w-5 text-claude-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
