const FREE_APIS = new Set([
  'postcodes',
  'land-registry',
  'planning',
  'flood',
  'ch-search',
  'ch-profile',
  'claude',
]);

export default function AgentLog({ steps }) {
  if (!steps || steps.length === 0) return null;

  const completed = steps.filter((s) => s.status === 'complete').length;
  const failed = steps.filter((s) => s.status === 'failed').length;
  const total = steps.length;

  return (
    <div className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="card-title">Live agent log</p>
          <h3 className="mt-1 font-display text-lg font-bold">Querying data sources in parallel</h3>
        </div>
        <p className="text-sm text-slate-500">
          {completed} / {total} complete{failed > 0 && <span className="text-crit-text"> · {failed} failed</span>}
        </p>
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-cream-200">
        <div
          className="h-full rounded-full bg-claude transition-all"
          style={{ width: `${(completed / Math.max(total, 1)) * 100}%` }}
        />
      </div>

      <ul className="mt-5 space-y-2">
        {steps.map((step) => (
          <li
            key={step.name}
            className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <StatusIcon status={step.status} />
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">{step.label}</p>
                {step.error && (
                  <p className="mt-0.5 truncate text-xs text-crit-text">{step.error}</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {FREE_APIS.has(step.name) && (
                <span className="pill-info text-[10px] uppercase tracking-wider">Free</span>
              )}
              {step.durationMs != null && (
                <span className="text-xs tabular-nums text-slate-500">{step.durationMs}ms</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusIcon({ status }) {
  if (status === 'complete') {
    return (
      <svg className="h-5 w-5 shrink-0 text-ok-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="m5 12 4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'failed') {
    return (
      <svg className="h-5 w-5 shrink-0 text-crit-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5 shrink-0 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
