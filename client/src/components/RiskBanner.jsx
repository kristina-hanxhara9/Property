const LEVEL_STYLES = {
  low: { bg: 'bg-ok-bg', text: 'text-ok-text', accent: 'bg-ok-text' },
  medium: { bg: 'bg-warn-bg', text: 'text-warn-text', accent: 'bg-warn-text' },
  high: { bg: 'bg-crit-bg', text: 'text-crit-text', accent: 'bg-crit-text' },
  critical: { bg: 'bg-crit-bg', text: 'text-crit-text', accent: 'bg-crit-text' },
};

export default function RiskBanner({ report }) {
  const level = (report.riskLevel || 'medium').toLowerCase();
  const style = LEVEL_STYLES[level] || LEVEL_STYLES.medium;
  const score = Number(report.riskScore) || 0;
  const completeness = report.dataQuality?.dataCompleteness || 'Medium';

  return (
    <div className={`rounded-2xl border border-slate-200 ${style.bg} p-6 shadow-sm`}>
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 place-items-center rounded-2xl bg-white/70 shadow-sm">
            <span className={`font-display text-4xl font-extrabold tabular-nums ${style.text}`}>
              {score.toFixed(1)}
            </span>
          </div>
          <div>
            <p className={`font-display text-xs font-bold uppercase tracking-wider ${style.text}`}>
              Risk score · {level}
            </p>
            <h2 className="mt-1 max-w-xl font-display text-xl font-bold text-ink sm:text-2xl">
              {report.riskSummary || 'Risk summary unavailable.'}
            </h2>
          </div>
        </div>

        <div className="ml-auto flex flex-col items-end gap-2 text-right text-xs text-slate-700">
          <div>
            <span className="block font-semibold uppercase tracking-wider text-slate-500">
              Data completeness
            </span>
            <span className="text-sm font-semibold text-ink">{completeness}</span>
          </div>
          {report.generatedAt && (
            <div>
              <span className="block font-semibold uppercase tracking-wider text-slate-500">
                Generated
              </span>
              <span className="text-sm text-ink">
                {new Date(report.generatedAt).toLocaleString('en-GB')}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/60">
        <div
          className={`h-full rounded-full ${style.accent} transition-all`}
          style={{ width: `${(score / 10) * 100}%` }}
        />
      </div>
    </div>
  );
}
