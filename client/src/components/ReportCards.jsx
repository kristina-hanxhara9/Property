import PriceChart from './PriceChart.jsx';
import {
  CrimeCard,
  SchoolsCard,
  TransportCard,
  FoodHygieneCard,
  PremiumDataCard,
} from './ExtraCards.jsx';
import { safeText } from '../lib/safeText.js';

export function PropertyCards({ report }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <OwnershipCard report={report} />
      <LegalCard report={report} />
      <PriceHistoryCard report={report} />
      <PlanningCard report={report} />
      <FloodCard report={report} />
      <GroundCard report={report} />
      <EpcCard report={report} />
      <MarketCard report={report} />
      <CrimeCard report={report} />
      <SchoolsCard report={report} />
      <TransportCard report={report} />
      <FoodHygieneCard report={report} />
      <PremiumDataCard report={report} />
    </div>
  );
}

export function CompanyCards({ report }) {
  // Note: VatStatusCard is intentionally omitted — VAT data lives in the
  // dedicated VatVerifyCard (manual + HMRC API) and VatLookupAgentCard
  // (AI search) further down the page. The old static card was always
  // showing "Unknown" since Companies House doesn't expose VAT numbers.
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <CompanyProfileCard report={report} />
      <FilingHealthCard report={report} />
      <OwnershipStructureCard report={report} />
      <DirectorsCard report={report} />
      <FinancialHealthCard report={report} />
      <SanctionsCard report={report} />
      <PropertyHoldingsCard report={report} />
      <VoaBusinessRatesCard report={report} />
    </div>
  );
}

function VoaBusinessRatesCard({ report }) {
  const v = report.voaLinks;
  if (!v || !v.links?.length) return null;
  return (
    <CardShell
      title="VOA business rates — commercial property at this address"
      source="Source: Valuation Office Agency · GOV.UK"
    >
      <p className="text-xs text-slate-600">{v.note}</p>
      <ul className="space-y-1.5">
        {v.links.map((l, i) => (
          <li key={i}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg bg-cream-50 p-2 text-xs hover:bg-cream-100"
            >
              <span className="font-semibold text-claude-700">
                🏢 {l.label} — {l.postcode} ↗
              </span>
              <span className="block text-slate-600">{l.address}</span>
            </a>
          </li>
        ))}
      </ul>
      {v.bulkDownload && (
        <details className="border-t border-cream-200 pt-2 text-[11px] text-slate-600">
          <summary className="cursor-pointer font-semibold text-claude-700">
            Want every commercial property the company occupies anywhere in England & Wales?
          </summary>
          <a
            href={v.bulkDownload.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block rounded-lg bg-cream-50 p-2 hover:bg-cream-100"
          >
            <span className="font-semibold text-claude-700">📦 {v.bulkDownload.name} ↗</span>
            <span className="block text-slate-500">{v.bulkDownload.note}</span>
          </a>
        </details>
      )}
    </CardShell>
  );
}

function FilingHealthCard({ report }) {
  const f = report.filingHealth;
  if (!f) return null;
  const bandStyle =
    f.band === 'red'
      ? { bg: 'bg-crit-bg', text: 'text-crit-text', dot: 'bg-crit-text' }
      : f.band === 'amber'
      ? { bg: 'bg-warn-bg', text: 'text-warn-text', dot: 'bg-warn-text' }
      : { bg: 'bg-ok-bg', text: 'text-ok-text', dot: 'bg-ok-text' };
  return (
    <CardShell
      title="Filing health score"
      source="Source: Companies House (statutory filings only — not a credit score)"
    >
      <div className={`rounded-xl ${bandStyle.bg} p-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-3 w-3 rounded-full ${bandStyle.dot}`} />
            <p className={`font-display text-base font-bold ${bandStyle.text}`}>
              {f.score}/100 · {f.band.toUpperCase()}
            </p>
          </div>
        </div>
        <p className={`mt-1 text-sm ${bandStyle.text}`}>{f.label}</p>
      </div>
      <ul className="mt-2 space-y-1.5 text-xs">
        {f.checks.map((c, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              className={
                c.status === 'pass'
                  ? 'mt-0.5 inline-block h-3 w-3 rounded-full bg-ok-text'
                  : c.status === 'warn'
                  ? 'mt-0.5 inline-block h-3 w-3 rounded-full bg-warn-text'
                  : 'mt-0.5 inline-block h-3 w-3 rounded-full bg-crit-text'
              }
            />
            <span>
              <span className="font-semibold text-ink">{c.label}:</span>{' '}
              <span className="text-slate-600">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {f.note && (
        <p className="mt-2 border-t border-cream-200 pt-2 text-[11px] italic leading-relaxed text-slate-500">
          {f.note}
        </p>
      )}
    </CardShell>
  );
}

function SanctionsCard({ report }) {
  const s = report.sanctions;
  if (!s) return null;
  const flagged = s.flagged || [];
  const tone = flagged.length > 0 ? 'crit' : 'ok';
  return (
    <CardShell title="Sanctions, PEP & watchlist screening" source="Source: OpenSanctions + HM Treasury OFSI">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">{s.checked || 0} entities checked</span>
        <span className={`pill-${tone}`}>
          <DotIcon tone={tone} />
          {flagged.length === 0 ? 'No matches' : `${flagged.length} flagged`}
        </span>
      </div>

      {flagged.length > 0 && (
        <div className="space-y-2 border-t border-cream-200 pt-3">
          {flagged.map((f, i) => (
            <div key={i} className="rounded-xl bg-crit-bg/40 p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold text-ink">{safeText(f.name)}</p>
                <span className="pill-crit">{safeText(f.role)}</span>
              </div>
              {f.openSanctions?.verdict && (
                <p className="mt-1 text-xs text-slate-700">
                  <span className="font-semibold">OpenSanctions:</span>{' '}
                  {safeText(f.openSanctions.verdict)} ({f.openSanctions.matchesTotal || 0} matches)
                </p>
              )}
              {f.ofsi?.verdict && (
                <p className="mt-1 text-xs text-slate-700">
                  <span className="font-semibold">UK OFSI list:</span>{' '}
                  {safeText(f.ofsi.verdict)} ({f.ofsi.matchesTotal || 0} matches)
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {s.results && s.results.length > 0 && flagged.length === 0 && (
        <div className="border-t border-cream-200 pt-3 text-xs text-slate-500">
          All {s.results.length} entities cleared against international sanctions, PEP and
          watchlist databases. Verify against original sources before signing.
        </div>
      )}
    </CardShell>
  );
}

function PropertyHoldingsCard({ report }) {
  const holdings = report.propertyHoldings;
  const error = report.propertyHoldingsError;
  const links = report.propertyHoldingsLinks || [];

  const ccodMatches = holdings?.ccod?.properties || [];
  const ocodMatches = holdings?.ocod?.properties || [];
  const totalMatches = (holdings?.ccod?.matchCount || 0) + (holdings?.ocod?.matchCount || 0);

  // available=true means the dataset was fetched successfully (even if 0 matches).
  // available=false means the fetch failed.
  const ccodAvailable = holdings?.ccod?.available;
  const ocodAvailable = holdings?.ocod?.available;
  const anyDatasetFetched = ccodAvailable || ocodAvailable;
  const allDatasetsFailed = holdings && !ccodAvailable && !ocodAvailable;

  return (
    <CardShell
      title="UK property holdings (live data)"
      source="Source: Land Registry CCOD + OCOD bulk datasets"
    >
      {totalMatches > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-700">{totalMatches} title(s) registered to this company</span>
            <span className="pill-info">
              CCOD {holdings.ccod?.matchCount || 0} · OCOD {holdings.ocod?.matchCount || 0}
            </span>
          </div>
          {ccodMatches.length > 0 && (
            <PropertyHoldingsList
              kind="UK Companies (CCOD)"
              month={holdings.ccod?.month}
              records={ccodMatches}
            />
          )}
          {ocodMatches.length > 0 && (
            <PropertyHoldingsList
              kind="Overseas Companies (OCOD)"
              month={holdings.ocod?.month}
              records={ocodMatches}
            />
          )}
        </div>
      ) : anyDatasetFetched ? (
        <p className="text-sm text-slate-600">
          No UK title found in the latest{' '}
          {ccodAvailable && `CCOD (${safeText(holdings.ccod?.month).replace('_', '/')})`}
          {ccodAvailable && ocodAvailable && ' or '}
          {ocodAvailable && `OCOD (${safeText(holdings.ocod?.month).replace('_', '/')})`}{' '}
          datasets for this company number.
        </p>
      ) : (
        <div className="rounded-xl border border-warn-bg bg-warn-bg/30 p-3 text-xs">
          <p className="font-semibold text-warn-text">Could not auto-fetch CCOD/OCOD</p>
          {(holdings?.ccod?.error || holdings?.ocod?.error || error) && (
            <p className="mt-1 text-slate-700">
              CCOD: {safeText(holdings?.ccod?.error)}
              {holdings?.ccod?.error && holdings?.ocod?.error ? ' · OCOD: ' : ''}
              {holdings?.ocod?.error ? safeText(holdings?.ocod?.error) : ''}
            </p>
          )}
          <p className="mt-1 text-slate-700">
            The Land Registry download endpoint likely requires session/CSRF tokens or has changed
            URL pattern. Use the manual link below.
          </p>
        </div>
      )}

      <div className="space-y-1.5 border-t border-cream-200 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">
          Manual sources
        </p>
        {links.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg bg-cream-50 p-2 text-xs hover:bg-cream-100"
          >
            <span className="font-semibold text-claude-700">📁 {safeText(l.name)} ↗</span>
            <span className="block text-slate-600">{safeText(l.note)}</span>
          </a>
        ))}
      </div>
    </CardShell>
  );
}

function PropertyHoldingsList({ kind, month, records }) {
  return (
    <div className="rounded-xl bg-cream-50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-claude-700">
        {safeText(kind)} {month ? `· ${safeText(month).replace('_', '/')}` : ''}
      </p>
      <ul className="space-y-1.5 text-xs">
        {records.slice(0, 8).map((r, i) => (
          <li key={i} className="rounded-lg bg-white p-2 ring-1 ring-cream-200">
            {Object.entries(r).slice(0, 4).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-slate-500">{k}</span>
                <span className="font-medium text-ink">{safeText(v)}</span>
              </div>
            ))}
          </li>
        ))}
        {records.length > 8 && (
          <li className="text-slate-500">… and {records.length - 8} more</li>
        )}
      </ul>
    </div>
  );
}

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
  const safe = safeText(value);
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-slate-500">{safeText(label)}</span>
      <span
        className={`font-medium text-ink ${mono ? 'tabular-nums' : ''} max-w-[60%] truncate`}
        title={safe}
      >
        {safe}
      </span>
    </div>
  );
}

function OwnershipCard({ report }) {
  const t = report.titleData || {};
  const titleLocked = !t.titleNumber && (!t.dataSource || /not enabled|unavailable|paid/i.test(t.dataSource || ''));
  if (titleLocked) {
    return (
      <CardShell title="Ownership" source="Source: HM Land Registry Title Register (paid)">
        <TitleUnlockBlock />
      </CardShell>
    );
  }
  return (
    <CardShell title="Ownership" source="Source: Land Registry Title Register">
      <Field label="Owner" value={t.owner} />
      <Field label="Type" value={t.ownerType} />
      <Field label="Title number" value={t.titleNumber} mono />
      <Field label="Tenure" value={t.tenure} />
      {t.tenure === 'Leasehold' && (
        <Field label="Lease years remaining" value={t.leaseYearsRemaining} mono />
      )}
      <Field label="Last registered" value={t.lastRegistrationDate} />
      {t.dataSource && (
        <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">{t.dataSource}</p>
      )}
    </CardShell>
  );
}

// Shared "unlock for £7" block used by Ownership + Legal cards. Renders an
// obvious CTA — clearer than the previous "data unavailable" footnote. The
// click goes to the HM Land Registry Find a Property page; once HMLR Business
// Gateway billing is wired server-side, swap the button to call /api/title-
// register and inject the result back into the report inline.
function TitleUnlockBlock() {
  return (
    <div className="rounded-xl border-2 border-dashed border-claude-300 bg-claude-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-bold text-claude-700">
          🔒 Locked — official title data
        </p>
        <span className="pill-info">£7 per title</span>
      </div>
      <p className="mt-2 text-sm text-slate-700">
        Owner name, mortgages / charges, restrictive covenants and easements live on the
        official HM Land Registry Title Register — a paid lookup (£7 per title) we can&rsquo;t
        infer from open data. We don&rsquo;t want to guess and report &ldquo;none&rdquo; when the
        truth is &ldquo;we haven&rsquo;t checked.&rdquo;
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <a
          href="https://eservices.landregistry.gov.uk/eservices/FindAProperty/view/QuickEnquiryInit.do"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-claude px-4 py-2 text-center font-display text-sm font-bold text-white shadow-sm hover:bg-claude-700"
        >
          Order Title Register · £7 ↗
        </a>
        <a
          href="https://www.gov.uk/government/organisations/land-registry/about/business-gateway"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-white px-4 py-2 text-center font-display text-sm font-bold text-claude-700 ring-1 ring-claude-300 hover:bg-cream-50"
        >
          What you get for £7 ↗
        </a>
      </div>
      <p className="mt-2 text-[11px] italic text-slate-500">
        Roadmap: HMLR Business Gateway integration will let you unlock and inject the title
        directly into this report in one click. Currently a manual link-out.
      </p>
    </div>
  );
}

function LegalCard({ report }) {
  const t = report.titleData || {};
  const titleNotEnabled = !t.titleNumber && (!t.dataSource || /not enabled|unavailable|paid/i.test(t.dataSource));

  if (titleNotEnabled) {
    // Don't double-render the big unlock block — Ownership card shows it.
    // Keep this card slim with just a pointer back.
    return (
      <CardShell title="Legal & encumbrances" source="Source: HM Land Registry Title Register (paid)">
        <p className="text-sm text-slate-600">
          Mortgages, restrictive covenants and easements unlock together with the Ownership
          card above. See the &ldquo;Unlock&rdquo; button there.
        </p>
      </CardShell>
    );
  }

  return (
    <CardShell title="Legal & encumbrances" source="Source: Land Registry Title Register">
      <BulletList label="Mortgages / charges" items={t.mortgages} empty="None recorded" />
      <BulletList
        label="Restrictive covenants"
        items={t.restrictiveCovenants}
        empty="None recorded"
      />
      <BulletList label="Easements" items={t.easements} empty="None recorded" />
    </CardShell>
  );
}

function BulletList({ label, items, empty }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {safeText(label)}
      </p>
      {!items || items.length === 0 ? (
        <p className="text-sm text-slate-500">{safeText(empty)}</p>
      ) : (
        <ul className="space-y-1 text-sm text-ink">
          {items.map((item, idx) => (
            <li key={`${idx}`} className="flex gap-2">
              <span
                aria-hidden
                className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300"
              />
              <span>{safeText(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PriceHistoryCard({ report }) {
  // Pick the three most relevant stats. Always show last sale; then prefer
  // 1yr / 5yr where available; fall back to 10yr / all-time so the card
  // shows useful info even for properties that traded less frequently.
  const stats = [
    { label: 'Last sale', value: formatGBP(report.lastSalePrice), sub: report.lastSaleDate },
  ];
  const candidates = [
    {
      label: '£/sqft',
      value: report.pricePerSqFt ? `£${report.pricePerSqFt.toLocaleString('en-GB')}` : null,
      sub: report.floorAreaSqM ? `${report.floorAreaSqM} m² (EPC)` : null,
    },
    { label: '1yr growth', value: report.priceGrowth1yr },
    { label: '5yr growth', value: report.priceGrowth5yr },
    { label: '10yr growth', value: report.priceGrowth10yr },
    {
      label: report.yearsCovered ? `${report.yearsCovered}yr total` : 'Total growth',
      value: report.priceGrowthAllTime,
    },
  ].filter((c) => c.value);
  for (const c of candidates) {
    if (stats.length < 3) stats.push(c);
  }
  while (stats.length < 3) stats.push({ label: '—', value: '—' });

  return (
    <CardShell title="Price history" source="Source: HM Land Registry Price Paid Data">
      <PriceChart history={report.priceHistory} />
      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
        {stats.map((s, i) => (
          <Stat key={i} label={s.label} value={s.value} sub={s.sub} />
        ))}
      </div>
    </CardShell>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="font-display text-lg font-bold text-ink tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function PlanningCard({ report }) {
  const p = report.planningConstraints || {};
  const flags = [
    booleanPill('Conservation Area', p.conservationArea?.present, p.conservationArea?.name),
    booleanPill(
      'Listed Building',
      p.listedBuilding?.present,
      p.listedBuilding?.grade ? `Grade ${p.listedBuilding.grade}` : null,
    ),
    booleanPill('Green Belt', p.greenBelt),
    booleanPill(
      'Article 4 Direction',
      p.articleFourDirection?.present,
      p.articleFourDirection?.description,
    ),
    booleanPill('Tree Preservation Order', p.treePreservationOrder),
    booleanPill('Brownfield Land', p.brownfieldLand, null, true),
    booleanPill('National Park', p.nationalPark?.present, p.nationalPark?.name),
    booleanPill('AONB', p.aonb?.present, p.aonb?.name),
    booleanPill('Ancient Woodland', p.ancientWoodland),
    booleanPill('Scheduled Monument', p.scheduledMonument),
    booleanPill('World Heritage Site', p.worldHeritageSite),
  ];

  return (
    <CardShell title="Planning constraints" source="Source: planning.data.gov.uk" className="lg:col-span-2">
      <Field label="Local Planning Authority" value={p.localPlanningAuthority} />
      <div className="flex flex-wrap gap-2 pt-1">
        {flags.map((f) => (
          <span key={f.label} className={`pill-${f.tone}`}>
            <DotIcon tone={f.tone} />
            {f.label}
            {f.detail && <span className="font-normal opacity-80"> · {f.detail}</span>}
          </span>
        ))}
      </div>
      {p.planningNotes && (
        <p className="border-t border-slate-100 pt-3 text-sm text-slate-600">{p.planningNotes}</p>
      )}
      {report.addressPlanningHistory && report.addressPlanningHistory.applications.length > 0 && (
        <div className="space-y-1.5 border-t border-cream-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">
            🎯 Planning history at this address
            {report.addressPlanningHistory.fragment && (
              <span className="font-normal text-slate-500"> · matched on “{report.addressPlanningHistory.fragment}”</span>
            )}
          </p>
          {report.addressPlanningHistory.summary && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {report.addressPlanningHistory.summary.approved > 0 && (
                <span className="pill-ok">✓ {report.addressPlanningHistory.summary.approved} approved</span>
              )}
              {report.addressPlanningHistory.summary.refused > 0 && (
                <span className="pill-crit">✗ {report.addressPlanningHistory.summary.refused} refused</span>
              )}
              {report.addressPlanningHistory.summary.withdrawn > 0 && (
                <span className="pill-warn">↩ {report.addressPlanningHistory.summary.withdrawn} withdrawn</span>
              )}
              {report.addressPlanningHistory.summary.pending > 0 && (
                <span className="pill-warn">⏳ {report.addressPlanningHistory.summary.pending} pending</span>
              )}
              {report.addressPlanningHistory.summary.refusalRate != null && (
                <span className="text-slate-600">
                  · refusal rate {report.addressPlanningHistory.summary.refusalRate}%
                </span>
              )}
            </div>
          )}
          <ul className="space-y-1.5">
            {report.addressPlanningHistory.applications.slice(0, 12).map((a, i) => (
              <li key={i} className="rounded-lg bg-claude-50 p-2 text-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink">{a.reference || 'No ref'}</span>
                  <span className="text-slate-500">
                    {a.receivedDate ? new Date(a.receivedDate).toLocaleDateString('en-GB') : '—'}
                  </span>
                </div>
                {a.address && <p className="text-slate-700">{a.address}</p>}
                {a.description && <p className="mt-0.5 text-slate-600">{a.description}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {(a.decision || a.status) && (
                    <span
                      className={
                        /approv|granted|permit/i.test(a.decision || a.status)
                          ? 'pill-ok'
                          : /refus|reject|withdraw/i.test(a.decision || a.status)
                          ? 'pill-crit'
                          : 'pill-warn'
                      }
                    >
                      {a.decision || a.status}
                    </span>
                  )}
                  {a.decisionDate && (
                    <span className="text-slate-500">
                      decided {new Date(a.decisionDate).toLocaleDateString('en-GB')}
                    </span>
                  )}
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto font-semibold text-claude-700 hover:underline"
                    >
                      View ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.planningApplications && report.planningApplications.length > 0 && (
        <div className="space-y-1.5 border-t border-cream-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">
            Recent planning applications nearby ({report.planningApplications.length}
            {report.planningApplicationsTotal > report.planningApplications.length
              ? ` of ${report.planningApplicationsTotal}`
              : ''})
          </p>
          <ul className="space-y-1.5">
            {report.planningApplications.slice(0, 8).map((a, i) => (
              <li key={i} className="rounded-lg bg-cream-50 p-2 text-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink">{a.reference || 'No ref'}</span>
                  <span className="text-slate-500">
                    {a.receivedDate ? new Date(a.receivedDate).toLocaleDateString('en-GB') : '—'}
                  </span>
                </div>
                {a.address && <p className="text-slate-700">{a.address}</p>}
                {a.description && <p className="mt-0.5 text-slate-600">{a.description}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {a.status && (
                    <span
                      className={
                        /approv|granted|permit/i.test(a.status)
                          ? 'pill-ok'
                          : /refus|reject|withdraw/i.test(a.status)
                          ? 'pill-crit'
                          : /pending|consult|valid/i.test(a.status)
                          ? 'pill-warn'
                          : 'pill-neutral'
                      }
                    >
                      {a.status}
                    </span>
                  )}
                  {a.authority && (
                    <span className="text-slate-500">{a.authority}</span>
                  )}
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto font-semibold text-claude-700 hover:underline"
                    >
                      View ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1.5 border-t border-cream-200 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">
          Planning portals
        </p>
        {report.planningHistoryLink && (
          <a
            href={report.planningHistoryLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg bg-cream-50 p-2 text-xs hover:bg-cream-100"
          >
            <span className="font-semibold text-claude-700">
              🏛️ {report.planningHistoryLink.name} ↗
            </span>
            <span className="block text-slate-600">{report.planningHistoryLink.note}</span>
          </a>
        )}
        {report.planningHistorySupplementary && (
          <a
            href={report.planningHistorySupplementary.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg bg-cream-50 p-2 text-xs hover:bg-cream-100"
          >
            <span className="font-semibold text-claude-700">
              📑 {report.planningHistorySupplementary.name} ↗
            </span>
            <span className="block text-slate-600">{report.planningHistorySupplementary.note}</span>
          </a>
        )}
      </div>
    </CardShell>
  );
}

function booleanPill(label, present, detail = null, positiveIfPresent = false) {
  const tone = present ? (positiveIfPresent ? 'ok' : 'warn') : 'neutral';
  return { label, detail, tone };
}

function DotIcon({ tone }) {
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

function FloodCard({ report }) {
  const f = report.floodRisk || {};
  return (
    <CardShell title="Flood risk" source="Source: Environment Agency">
      <FloodRow label="Rivers & sea" value={f.riverAndSea} />
      <FloodRow label="Surface water" value={f.surfaceWater} />
      <FloodRow label="Groundwater" value={f.groundwater} />
      <FloodRow label="Reservoir risk" value={f.reservoirRisk ? 'Present' : 'Not flagged'} bool={f.reservoirRisk} />
      {f.floodInsuranceImplication && (
        <p className="border-t border-slate-100 pt-3 text-sm text-slate-600">
          <span className="font-semibold text-ink">Insurance: </span>
          {f.floodInsuranceImplication}
        </p>
      )}
    </CardShell>
  );
}

function FloodRow({ label, value, bool }) {
  const v = String(value || '').toLowerCase();
  let tone = 'ok';
  if (v.includes('zone 2') || v.includes('zone 3') || v.includes('high') || v.includes('medium') || bool) {
    tone = v.includes('zone 3') || v.includes('very high') ? 'crit' : 'warn';
  }
  if (!value || v.includes('unknown')) tone = 'neutral';
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`pill-${tone}`}>
        <DotIcon tone={tone} />
        {value || 'Unknown'}
      </span>
    </div>
  );
}

function GroundCard({ report }) {
  const g = report.groundRisk || {};
  const links = (g.links || []).filter(Boolean);
  const stabilityTone = stabilityToTone(g.stabilityRating);
  const radonTone = radonBandToTone(g.radonBand);

  return (
    <CardShell title="Ground & environmental" source="Source: BGS GeoIndex / UKHSA / Coal Authority (live data)">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Stability rating</span>
        <span className={`pill-${stabilityTone}`}>
          <DotIcon tone={stabilityTone} />
          {g.stabilityRating || 'Unknown'}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Radon band</span>
        <span className={`pill-${radonTone}`}>
          <DotIcon tone={radonTone} />
          {g.radonBand && g.radonBand !== 'Unknown'
            ? `Band ${g.radonBand}${g.radonHomesAffected ? ` · ${g.radonHomesAffected}` : ''}`
            : 'Unknown'}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Coal mining</span>
        <span className={`pill-${g.miningRisk ? 'warn' : 'ok'}`}>
          <DotIcon tone={g.miningRisk ? 'warn' : 'ok'} />
          {g.miningRisk ? 'In reporting area' : 'Not flagged'}
        </span>
      </div>
      {g.miningDetail && (
        <p className="border-t border-cream-200 pt-3 text-xs text-slate-600">{g.miningDetail}</p>
      )}
      {g.hazardTypes && g.hazardTypes.length > 0 && (
        <BulletList label="Specific hazards detected" items={g.hazardTypes} empty="None" />
      )}
      {links.length > 0 && (
        <div className="space-y-1.5 border-t border-cream-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">
            Drill into the source data
          </p>
          {links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg bg-cream-50 p-2 text-xs hover:bg-cream-100"
            >
              <span className="font-semibold text-claude-700">{l.name} ↗</span>
              <span className="block text-slate-600">{l.note}</span>
            </a>
          ))}
        </div>
      )}
    </CardShell>
  );
}

function stabilityToTone(s) {
  const v = String(s || '').toLowerCase();
  if (v.includes('high')) return 'crit';
  if (v.includes('medium')) return 'warn';
  if (v.includes('low')) return 'ok';
  return 'neutral';
}

function radonBandToTone(b) {
  const n = Number(b);
  if (!Number.isFinite(n)) return 'neutral';
  if (n >= 4) return 'crit';
  if (n >= 3) return 'warn';
  if (n === 2) return 'info';
  return 'ok';
}

function EpcCard({ report }) {
  const e = report.epcData || {};
  return (
    <CardShell title="Energy performance" source="Source: EPC Register">
      <div className="flex flex-wrap items-center gap-4">
        <RatingBadge rating={e.currentRating} />
        <div className="text-sm">
          <p className="text-slate-500">Current</p>
          <p className="font-semibold text-ink">
            {e.currentRating || 'Unknown'} {e.currentScore != null ? `(${e.currentScore})` : ''}
          </p>
        </div>
        <span className="text-2xl text-slate-300">→</span>
        <RatingBadge rating={e.potentialRating} muted />
        <div className="text-sm">
          <p className="text-slate-500">Potential</p>
          <p className="font-semibold text-ink">
            {e.potentialRating || 'Unknown'} {e.potentialScore != null ? `(${e.potentialScore})` : ''}
          </p>
        </div>
      </div>
      {e.address && <Field label="Matched record" value={e.address} />}
      {e.propertyType && <Field label="Property type" value={`${e.propertyType}${e.builtForm ? ' · ' + e.builtForm : ''}`} />}
      {e.totalFloorArea && <Field label="Floor area" value={`${e.totalFloorArea} m²`} mono />}
      {e.mainHeating && <Field label="Main heating" value={e.mainHeating} />}
      {e.lodgedDate && <Field label="Lodged" value={e.lodgedDate} />}
      {e.keyRecommendations && e.keyRecommendations.length > 0 && (
        <BulletList label="Notes" items={e.keyRecommendations} empty="None" />
      )}
    </CardShell>
  );
}

function RatingBadge({ rating, muted }) {
  const colours = {
    A: '#1e9a48',
    B: '#67b32f',
    C: '#bdd13a',
    D: '#f4d030',
    E: '#f0a832',
    F: '#e9762d',
    G: '#d23a2a',
  };
  const r = String(rating || '').toUpperCase();
  const bg = colours[r] || '#94a3b8';
  return (
    <div
      className={`grid h-12 w-12 place-items-center rounded-xl font-display text-2xl font-extrabold text-white ${
        muted ? 'opacity-70' : ''
      }`}
      style={{ backgroundColor: bg }}
    >
      {r || '?'}
    </div>
  );
}

function MarketCard({ report }) {
  const m = report.marketContext || {};
  const idx = m.ukRentalIndex;
  return (
    <CardShell title="Market context" source="Source: ONS / findthatpostcode.uk / Land Registry HPI">
      <Field label="Local authority" value={m.localAuthority} />
      {m.parliamentaryConstituency && (
        <Field label="Parliamentary constituency" value={m.parliamentaryConstituency} />
      )}
      {m.region && <Field label="Region" value={m.region} />}
      {m.areaType && <Field label="Area type" value={m.areaType} />}
      <Field
        label="Deprivation decile (IMD 2019)"
        value={
          m.deprivationDecile != null
            ? `${m.deprivationDecile}/10${m.deprivationContext ? ` — ${m.deprivationContext}` : ''}`
            : 'Unknown'
        }
      />
      {m.deprivationRank != null && (
        <Field label="Deprivation rank (England)" value={`${m.deprivationRank} of ~32,844`} mono />
      )}
      {idx && (
        <Field
          label={`UK rental price index (${idx.time || 'latest'})`}
          value={`${idx.value} (Jan 2015 = 100)`}
          mono
        />
      )}
      <Field
        label={`Median annual earnings${m.earningsTime ? ` · ${m.earningsTime}` : ''}`}
        value={m.avgHouseholdIncome}
      />
      {m.medianWeeklyEarnings != null && (
        <Field
          label="Median weekly pay (full-time, residence)"
          value={`£${m.medianWeeklyEarnings.toFixed(2)}`}
          mono
        />
      )}
      <Field
        label={`Population trend${m.populationGrowthTrend && m.populationGrowthTrend !== 'Unknown' ? ' · 5yr window' : ''}`}
        value={m.populationGrowthTrend}
      />
      {m.populationLatest && (
        <Field label="Population (latest)" value={m.populationLatest.toLocaleString('en-GB')} mono />
      )}
      <Field
        label={`Employment rate${m.employmentTime ? ` · ${m.employmentTime}` : ''}`}
        value={m.employmentRate}
      />
      {m.unemploymentRate != null && (
        <Field label="Unemployment rate (16-64)" value={`${m.unemploymentRate.toFixed(1)}%`} mono />
      )}
      {m.economicActivityRate != null && (
        <Field
          label="Economic activity rate (16-64)"
          value={`${m.economicActivityRate.toFixed(1)}%`}
          mono
        />
      )}
      <Field label="Avg rental yield" value={m.avgRentalYield} />
      <Field label="Avg rent" value={m.avgRent} />
      <Field label="Demand rating (composite proxy)" value={m.demandRating} />
      {m.demandComponents?.length > 0 && (
        <div className="rounded-lg bg-claude-50 p-2 text-[11px] leading-relaxed text-slate-700">
          <p className="font-semibold text-claude-700">How the demand score was built</p>
          <ul className="mt-1 list-disc pl-4">
            {m.demandComponents.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          {m.demandNote && <p className="mt-1.5 italic text-slate-500">{m.demandNote}</p>}
        </div>
      )}
      <div className="space-y-1.5 border-t border-cream-200 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">
          Authoritative sources
        </p>
        {report.onsAreaProfile && (
          <a
            href={report.onsAreaProfile.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg bg-cream-50 p-2 text-xs hover:bg-cream-100"
          >
            <span className="font-semibold text-claude-700">
              📊 {report.onsAreaProfile.name} ↗
            </span>
            <span className="block text-slate-600">{report.onsAreaProfile.note}</span>
          </a>
        )}
        {idx?.sourceUrl && (
          <a
            href={idx.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg bg-cream-50 p-2 text-xs hover:bg-cream-100"
          >
            <span className="font-semibold text-claude-700">
              📈 ONS — Index of Private Housing Rental Prices ↗
            </span>
            <span className="block text-slate-600">UK headline rental price index, monthly.</span>
          </a>
        )}
      </div>

      <div className="border-t border-cream-200 pt-3 text-[11px] leading-relaxed text-slate-500">
        <p className="font-semibold uppercase tracking-wider text-slate-500">Data freshness</p>
        <p className="mt-1">
          Earnings (ASHE) updated annually each Nov · Employment (APS) updated quarterly · Population
          updated annually each Jun/Jul · IMD 2019 is the latest published; IMD 2025 not yet released.
        </p>
      </div>
    </CardShell>
  );
}

function CompanyProfileCard({ report }) {
  const c = report.companyProfile || {};
  return (
    <CardShell title="Company profile" source="Source: Companies House">
      <Field label="Official name" value={c.officialName} />
      <Field label="Company number" value={c.companyNumber} mono />
      <Field label="Type" value={c.companyType} />
      <Field label="Status" value={c.status} />
      <Field label="Incorporated" value={c.incorporatedDate} />
      <Field label="Trading age" value={c.tradingAge} />
      <Field label="Registered address" value={c.registeredAddress} />
      {c.sicCodes && c.sicCodes.length > 0 && (
        <BulletList
          label="SIC codes"
          items={c.sicCodes.map((s) => `${s.code} — ${s.description}`)}
          empty="None"
        />
      )}
    </CardShell>
  );
}

function OwnershipStructureCard({ report }) {
  const o = report.ownership || {};
  const tone = o.ownershipStructureRisk === 'Simple'
    ? 'ok'
    : o.ownershipStructureRisk === 'Moderate'
    ? 'info'
    : o.ownershipStructureRisk === 'Complex'
    ? 'warn'
    : o.ownershipStructureRisk === 'Opaque'
    ? 'crit'
    : 'neutral';
  return (
    <CardShell title="Ownership structure" source="Source: Companies House PSC register">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Structure complexity</span>
        <span className={`pill-${tone}`}>
          <DotIcon tone={tone} />
          {o.ownershipStructureRisk || 'Unknown'}
        </span>
      </div>
      <div className="space-y-2 border-t border-slate-100 pt-3">
        {(o.personsOfSignificantControl || []).length === 0 && (
          <p className="text-sm text-slate-500">No PSC records.</p>
        )}
        {(o.personsOfSignificantControl || []).map((p, idx) => (
          <div key={`${p.name}-${idx}`} className="rounded-xl bg-slate-50 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold text-ink">{p.name}</p>
              <span className="pill-info">{p.ownershipBand}</span>
            </div>
            <p className="text-xs text-slate-500">
              {p.type} · {p.nationality} · resident in {p.countryOfResidence}
            </p>
            {p.natureOfControl && (
              <p className="mt-1 text-xs text-slate-600">{p.natureOfControl.join(', ')}</p>
            )}
            {p.riskFlag && (
              <p className="mt-1 text-xs font-semibold text-crit-text">⚠ {p.riskFlag}</p>
            )}
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function DirectorsCard({ report }) {
  const directors = report.directors || [];
  return (
    <CardShell
      title={`Directors & officers (${directors.length})`}
      source="Source: Companies House"
      className="lg:col-span-2"
    >
      {directors.length === 0 ? (
        <p className="text-sm text-slate-500">No officer records.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {directors.map((d, idx) => (
            <li key={`${d.name}-${idx}`} className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold text-ink">{d.name}</p>
                <span className={`pill-${d.status === 'Current' ? 'ok' : 'neutral'}`}>{d.status}</span>
              </div>
              <p className="text-xs text-slate-500">
                {d.role} · appointed {d.appointedDate || 'n/a'}
                {d.resignedDate && ` · resigned ${d.resignedDate}`}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                {d.disqualified && <span className="pill-crit">Disqualified</span>}
                {d.dissolvingsCompanies > 0 && (
                  <span className="pill-warn">{d.dissolvingsCompanies} dissolved cos</span>
                )}
                {d.otherCompanies > 0 && (
                  <span className="pill-neutral">{d.otherCompanies} other appts</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function FinancialHealthCard({ report }) {
  const f = report.financialHealth || {};
  return (
    <CardShell title="Financial health" source="Source: Companies House filings">
      <Field label="Last accounts" value={f.lastAccountsDate} />
      <Field
        label="Filed on time"
        value={
          f.accountsFiledOnTime == null
            ? 'Unknown'
            : f.accountsFiledOnTime
            ? 'Yes'
            : 'Late'
        }
      />
      <Field label="Accounts type" value={f.accountsType} />
      <Field label="Next accounts due" value={f.nextAccountsDue} />
      <Field
        label="Confirmation statement"
        value={
          f.confirmationStatementOverdue
            ? `Overdue (was ${f.confirmationStatementDue || 'unknown'})`
            : f.confirmationStatementDue
        }
      />
      <Field label="Outstanding charges" value={`${f.chargesOutstanding ?? 0} of ${f.chargesTotal ?? 0}`} mono />
      {f.insolvencyHistory && (
        <p className="rounded-lg bg-crit-bg p-3 text-sm text-crit-text">
          <strong>Insolvency history:</strong> {f.insolvencyDetails || 'See Companies House records.'}
        </p>
      )}
    </CardShell>
  );
}

function VatStatusCard({ report }) {
  const v = report.vatStatus || {};
  return (
    <CardShell title="VAT status" source="Source: HMRC VAT lookup">
      <Field
        label="Registered"
        value={v.vatRegistered == null ? 'Unknown' : v.vatRegistered ? 'Yes' : 'No'}
      />
      <Field label="VAT number" value={v.vatNumber} mono />
      <Field label="Status" value={v.vatStatus} />
      <Field label="Registered name" value={v.vatRegisteredName} />
      <Field label="Address" value={v.vatAddress} />
    </CardShell>
  );
}

function formatGBP(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value);
}
