import PriceChart from './PriceChart.jsx';

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
    </div>
  );
}

export function CompanyCards({ report }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <CompanyProfileCard report={report} />
      <OwnershipStructureCard report={report} />
      <DirectorsCard report={report} />
      <FinancialHealthCard report={report} />
      <VatStatusCard report={report} />
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
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span
        className={`font-medium text-ink ${mono ? 'tabular-nums' : ''} max-w-[60%] truncate`}
        title={typeof value === 'string' ? value : undefined}
      >
        {value == null || value === '' ? '—' : value}
      </span>
    </div>
  );
}

function OwnershipCard({ report }) {
  const t = report.titleData || {};
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

function LegalCard({ report }) {
  const t = report.titleData || {};
  const titleNotEnabled = !t.titleNumber && (!t.dataSource || /not enabled/i.test(t.dataSource));

  return (
    <CardShell title="Legal & encumbrances" source="Source: Land Registry Title Register">
      {titleNotEnabled && (
        <div className="rounded-xl border border-cream-200 bg-cream-50 p-3 text-xs text-ink/70">
          <strong className="text-claude-700">Data unavailable.</strong> Mortgages, restrictive
          covenants and easements live on the official Land Registry Title Register, which is a
          paid lookup (£7 per title) not enabled in this MVP. We can't say "none" — we just don't
          know yet.
          <a
            href="https://eservices.landregistry.gov.uk/eservices/FindAProperty/view/QuickEnquiryInit.do"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block font-semibold text-claude-700 hover:underline"
          >
            Order a Title Register from HM Land Registry ↗
          </a>
        </div>
      )}
      {!titleNotEnabled && (
        <>
          <BulletList label="Mortgages / charges" items={t.mortgages} empty="None recorded" />
          <BulletList
            label="Restrictive covenants"
            items={t.restrictiveCovenants}
            empty="None recorded"
          />
          <BulletList label="Easements" items={t.easements} empty="None recorded" />
        </>
      )}
    </CardShell>
  );
}

function BulletList({ label, items, empty }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      {!items || items.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-1 text-sm text-ink">
          {items.map((item, idx) => (
            <li key={`${label}-${idx}`} className="flex gap-2">
              <span aria-hidden className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
              <span>{item}</span>
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
  return (
    <CardShell title="Ground & environmental" source="Source: UK Radon / BGS / Coal Authority">
      <Field label="Stability rating" value={g.stabilityRating} />
      <Field label="Radon band" value={g.radonBand} />
      <Field label="Mining risk" value={g.miningRisk ? 'Possible' : 'Not flagged'} />
      {g.hazardTypes && g.hazardTypes.length > 0 && (
        <BulletList label="Hazard types" items={g.hazardTypes} empty="None" />
      )}
      {links.length > 0 && (
        <div className="space-y-1.5 border-t border-cream-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">
            Authoritative sources
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
    <CardShell title="Market context" source="Source: ONS / Land Registry HPI">
      <Field label="Local authority" value={m.localAuthority} />
      <Field
        label="Deprivation decile (IMD 2019)"
        value={
          m.deprivationDecile != null
            ? `${m.deprivationDecile}/10${m.deprivationContext ? ` — ${m.deprivationContext}` : ''}`
            : 'Unknown'
        }
      />
      {idx && (
        <Field
          label={`UK rental price index (${idx.time || 'latest'})`}
          value={`${idx.value} (Jan 2015 = 100)`}
          mono
        />
      )}
      <Field label="Avg household income" value={m.avgHouseholdIncome} />
      <Field label="Population trend" value={m.populationGrowthTrend} />
      <Field label="Employment rate" value={m.employmentRate} />
      <Field label="Avg rental yield" value={m.avgRentalYield} />
      <Field label="Avg rent" value={m.avgRent} />
      <Field label="Demand rating" value={m.demandRating} />
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
