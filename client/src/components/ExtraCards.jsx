// New cards for crime, schools, transport, food hygiene, and the
// "premium data" upsell — all sit alongside the existing PropertyCards.

import { safeText } from '../lib/safeText.js';

export function CrimeCard({ report }) {
  const c = report.crime;
  if (!c) return null;
  const severityTone = c.latestCount > 200 ? 'crit' : c.latestCount > 80 ? 'warn' : 'ok';
  return (
    <CardShell title="Crime (1 mile radius)" source="Source: data.police.uk">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">{c.latestMonth ? `Crimes in ${c.latestMonth}` : 'Crime count'}</span>
        <span className={`pill-${severityTone}`}>
          <Dot tone={severityTone} />
          {c.latestCount}
        </span>
      </div>

      {c.twelveMonthTrend && c.twelveMonthTrend.length > 0 && (
        <CrimeTrendSparkline trend={c.twelveMonthTrend} />
      )}

      {c.categoryBreakdown && c.categoryBreakdown.length > 0 && (
        <div className="space-y-1.5 border-t border-cream-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">
            Top categories ({safeText(c.latestMonth)})
          </p>
          <ul className="space-y-1">
            {c.categoryBreakdown.slice(0, 6).map((cat, i) => (
              <li
                key={safeText(cat.category, `cat-${i}`)}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-slate-700">{safeText(cat.label)}</span>
                <span className="font-semibold tabular-nums text-ink">{cat.count ?? 0}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.note && (
        <p className="border-t border-cream-200 pt-3 text-xs text-slate-500">{c.note}</p>
      )}
    </CardShell>
  );
}

function CrimeTrendSparkline({ trend }) {
  const points = trend.filter((t) => t.count != null).reverse();
  if (points.length < 2) return null;

  const max = Math.max(...points.map((p) => p.count));
  const min = Math.min(...points.map((p) => p.count));
  const range = Math.max(max - min, 1);
  const w = 240;
  const h = 40;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * (w - 8) + 4;
      const y = h - 4 - ((p.count - min) / range) * (h - 8);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <div className="border-t border-cream-200 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">
        12-month trend ({points[0].month} → {points[points.length - 1].month})
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-10 w-full">
        <path d={path} fill="none" stroke="#D97757" strokeWidth="2" />
        {points.map((p, i) => {
          const x = (i / (points.length - 1)) * (w - 8) + 4;
          const y = h - 4 - ((p.count - min) / range) * (h - 8);
          return <circle key={p.month} cx={x} cy={y} r="2" fill="#D97757" />;
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>min: {min}</span>
        <span>max: {max}</span>
      </div>
    </div>
  );
}

export function SchoolsCard({ report }) {
  const s = report.schools;
  if (!s) return null;
  const list = s.schools || [];
  const ratedCount = s.ratedCount ?? list.filter((sch) => sch.ofstedRating).length;
  return (
    <CardShell
      title="Nearby schools (1 mile)"
      source="Source: OpenStreetMap + Ofsted Reports (live)"
    >
      {ratedCount > 0 && (
        <div className="rounded-xl bg-claude-50 p-2 text-xs text-claude-700">
          <strong>{ratedCount}</strong> of {list.length} schools have a live Ofsted rating from
          reports.ofsted.gov.uk.
        </div>
      )}
      {list.length === 0 ? (
        <p className="text-sm text-slate-500">
          {safeText(s.error || s.note, 'No schools tagged in OpenStreetMap for this area.')}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.slice(0, 8).map((sch, i) => {
            const name = safeText(sch.name, '(unnamed school)');
            const phaseOrType = safeText(sch.phase || sch.type, '');
            const ageRange = safeText(sch.ageRange, '');
            const ofsted = safeText(sch.ofstedRating, '');
            const ofstedDate = safeText(sch.ofstedDate, '');
            const subtitle = [
              phaseOrType,
              ageRange ? `ages ${ageRange}` : '',
              sch.distanceMiles != null ? `${Number(sch.distanceMiles).toFixed(2)} mi` : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={i} className="rounded-xl bg-cream-50 p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-ink">{name}</p>
                  {ofsted && (
                    <span className={`pill-${ofstedTone(ofsted)}`}>
                      <Dot tone={ofstedTone(ofsted)} />
                      {ofsted}
                    </span>
                  )}
                </div>
                {subtitle && <p className="text-xs text-slate-600">{subtitle}</p>}
                {sch.address && (
                  <p className="mt-0.5 text-xs text-slate-500">{safeText(sch.address)}</p>
                )}
                {(ofstedDate || sch.ofstedReportUrl) && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {ofstedDate && (
                      <span className="text-slate-500">Inspected {ofstedDate}</span>
                    )}
                    {sch.ofstedReportUrl && (
                      <a
                        href={sch.ofstedReportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto font-semibold text-claude-700 hover:underline"
                      >
                        Ofsted report ↗
                      </a>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {s.ofstedSearchUrl && (
        <a
          href={s.ofstedSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg bg-cream-50 p-2 text-xs hover:bg-cream-100"
        >
          <span className="font-semibold text-claude-700">
            🎓 Open Ofsted reports for this postcode ↗
          </span>
          <span className="block text-slate-600">
            Verify ratings + view full inspection PDFs on the official Ofsted Reports site.
          </span>
        </a>
      )}
    </CardShell>
  );
}

function ofstedTone(rating) {
  const r = String(rating || '').toLowerCase();
  if (r.includes('outstanding')) return 'ok';
  if (r.includes('good')) return 'ok';
  if (r.includes('requires')) return 'warn';
  if (r.includes('inadequate')) return 'crit';
  return 'neutral';
}

export function TransportCard({ report }) {
  const t = report.transport;
  if (!t) return null;
  const closest = t.closestStation;
  return (
    <CardShell title="Transport & connectivity" source="Source: OpenStreetMap">
      {closest ? (
        <div className="rounded-xl bg-cream-50 p-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">Closest station</p>
          <p className="font-display text-lg font-bold text-ink">{safeText(closest.name, 'Unnamed')}</p>
          <p className="text-xs text-slate-600">
            {safeText(closest.type, 'Station')}
            {closest.operator ? ` · ${safeText(closest.operator)}` : ''}
            {closest.distanceMeters != null
              ? ` · ${closest.distanceMeters}m (${t.walkTimeMinutesToClosestStation} min walk)`
              : ''}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No stations within 1.5km.</p>
      )}

      {t.stations && t.stations.length > 1 && (
        <div className="space-y-1 border-t border-cream-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">
            Other stations nearby
          </p>
          <ul className="space-y-1 text-sm">
            {t.stations.slice(1, 6).map((s, i) => (
              <li key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-700">
                  {safeText(s.name, 'Unnamed')}{' '}
                  <span className="text-slate-400">· {safeText(s.type, 'Station')}</span>
                </span>
                <span className="tabular-nums text-slate-500">{s.distanceMeters ?? '?'}m</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-cream-200 pt-3 text-sm">
        <Field label="Bus stops within 500m" value={String(t.busStopCount || 0)} mono />
      </div>
    </CardShell>
  );
}

export function FoodHygieneCard({ report }) {
  const f = report.foodHygiene;
  if (!f) return null;
  const list = f.establishments || [];
  return (
    <CardShell title="Restaurants & food hygiene (1 mile)" source="Source: Food Standards Agency">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-slate-700">{f.count} establishments rated</span>
        {f.ratingBreakdown && f.ratingBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {f.ratingBreakdown.map((r) => (
              <span
                key={r.rating}
                className={`pill-${ratingTone(r.rating)}`}
                title={`${r.count} establishments`}
              >
                {r.rating}: {r.count}
              </span>
            ))}
          </div>
        )}
      </div>
      {list.length > 0 && (
        <ul className="space-y-1.5 border-t border-cream-200 pt-3">
          {list.slice(0, 6).map((e, i) => (
            <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{safeText(e.name, '(unnamed)')}</p>
                <p className="truncate text-xs text-slate-500">{safeText(e.type, '')}</p>
              </div>
              <span className={`pill-${ratingTone(e.rating)} shrink-0`}>
                {safeText(e.rating, '?')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function ratingTone(r) {
  const n = Number(r);
  if (Number.isFinite(n)) {
    if (n >= 5) return 'ok';
    if (n >= 4) return 'ok';
    if (n >= 3) return 'info';
    if (n >= 1) return 'warn';
    return 'crit';
  }
  return 'neutral';
}

export function PremiumDataCard({ report }) {
  const items = report.premiumDataAvailable || [];
  if (items.length === 0) return null;
  return (
    <CardShell title="Premium data — paid services" source="What's not in this MVP and where to get it">
      <p className="text-xs text-slate-600">
        These data points require paid third-party APIs. PropertyIQ doesn't include them by default,
        but you can subscribe and integrate them yourself.
      </p>
      <ul className="space-y-2">
        {items.map((cat, i) => (
          <li key={i} className="rounded-xl bg-cream-50 p-3">
            <p className="font-semibold text-claude-700">{cat.category}</p>
            <ul className="mt-1 space-y-0.5">
              {cat.points.map((p, j) => (
                <li key={j} className="text-sm text-slate-700">
                  · {p}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-slate-500">
              <span className="font-semibold">Providers:</span> {cat.providers}
            </p>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

// ── shared primitives (reused from ReportCards) ─────────────────────────────

function CardShell({ title, source, children, className = '' }) {
  return (
    <section className={`card flex flex-col gap-3 ${className}`}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="card-title">{title}</h3>
        {source && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {source}
          </span>
        )}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, value, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium text-ink ${mono ? 'tabular-nums' : ''} max-w-[60%] truncate`}>
        {value == null || value === '' ? '—' : value}
      </span>
    </div>
  );
}

function Dot({ tone }) {
  const cls =
    tone === 'ok'
      ? 'bg-ok-text'
      : tone === 'warn'
      ? 'bg-warn-text'
      : tone === 'crit'
      ? 'bg-crit-text'
      : tone === 'info'
      ? 'bg-info-text'
      : 'bg-slate-400';
  return <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${cls}`} />;
}
