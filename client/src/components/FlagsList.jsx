const SEVERITY_ORDER = { critical: 0, warning: 1, ok: 2 };

const SEVERITY_STYLES = {
  critical: { pill: 'pill-crit', label: 'Critical', accent: 'border-l-crit-text' },
  warning: { pill: 'pill-warn', label: 'Warning', accent: 'border-l-warn-text' },
  ok: { pill: 'pill-ok', label: 'OK', accent: 'border-l-ok-text' },
};

const CATEGORY_ICONS = {
  ownership: '👤',
  planning: '📐',
  flood: '🌊',
  ground: '⛰️',
  market: '📈',
  legal: '⚖️',
  financial: '£',
  directors: '🧑‍💼',
  compliance: '✅',
};

export default function FlagsList({ flags }) {
  if (!flags || flags.length === 0) return null;

  const sorted = [...flags].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99),
  );

  return (
    <section className="card">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="card-title">Flags</p>
          <h3 className="mt-1 font-display text-lg font-bold">
            Risk flags raised by analysis
          </h3>
        </div>
        <p className="text-sm text-slate-500">{flags.length} total</p>
      </header>

      <ul className="space-y-2">
        {sorted.map((flag, idx) => {
          const style = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.warning;
          return (
            <li
              key={`${flag.title}-${idx}`}
              className={`flex gap-3 rounded-xl border border-slate-100 bg-slate-50/40 border-l-4 ${style.accent} p-4`}
            >
              <span aria-hidden className="mt-0.5 text-lg">
                {CATEGORY_ICONS[flag.category] || '•'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h4 className="font-semibold text-ink">{flag.title}</h4>
                  <span className={style.pill}>{style.label}</span>
                  <span className="text-xs uppercase tracking-wider text-slate-400">
                    {flag.category}
                  </span>
                </div>
                {flag.detail && (
                  <p className="mt-1 text-sm text-slate-600">{flag.detail}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
