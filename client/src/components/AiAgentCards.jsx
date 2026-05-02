// Three AI-agent cards that partially replace expensive paid APIs:
//   - AvmAgentCard: Hometrack-style sale valuation from web listings
//   - ConstructionCostAgentCard: RICS BCIS-style build cost from web sources
//   - AdverseMediaAgentCard: Beauhurst/news-monitoring-style screening on company

import AgentRunnerCard, { formatGBP } from './AgentRunnerCard.jsx';
import { safeText } from '../lib/safeText.js';

export function AvmAgentCard({ report }) {
  const postcode = report?.queryInput?.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/i)?.[1];
  const body = {
    address: report?.queryInput,
    postcode: postcode || '',
    propertyType: report?.priceHistory?.[0]?.propertyType,
    bedrooms: null,
    lastSalePrice: report?.lastSalePrice || null,
    lastSaleDate: report?.lastSaleDate || null,
    floorAreaSqM: report?.floorAreaSqM || null,
  };
  return (
    <AgentRunnerCard
      title="AVM / Sale valuation (alternative to paid AVM)"
      subtitle="Searches Rightmove / Zoopla / OnTheMarket for similar properties for sale and produces an asking-price-based valuation. Replaces ~£300/mo Hometrack AVM for low-volume use."
      endpoint="/api/avm"
      body={body}
      eventName="avm"
      buttonLabel="Run AVM agent"
      caveats={[
        'Asking prices, not transacted prices — achieved values typically 3-8% below.',
        'Not regulated — NOT acceptable as a lender-grade AVM.',
        'For a regulated AVM (e.g. RICS-compliant), use Hometrack / PropertyData / RICS valuer.',
      ]}
      renderResult={(d) => <AvmResult data={d} />}
    />
  );
}

function AvmResult({ data }) {
  const v = data.valuation || {};
  return (
    <div className="space-y-3">
      {(v.askingPriceLow || v.midPointEstimate) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Mid-point estimate" value={formatGBP(v.midPointEstimate)} />
          <Stat
            label="Asking range"
            value={`${formatGBP(v.askingPriceLow)} – ${formatGBP(v.askingPriceHigh)}`}
          />
          <Stat
            label="Likely achieved"
            value={`${formatGBP(v.achievedPriceEstimateLow)} – ${formatGBP(v.achievedPriceEstimateHigh)}`}
          />
        </div>
      )}
      {(v.pricePerSqFtLow || v.pricePerSqFtHigh) && (
        <div className="rounded-xl bg-cream-50 p-3 text-sm">
          £/sqft range:{' '}
          <strong className="text-ink">
            £{v.pricePerSqFtLow} – £{v.pricePerSqFtHigh}
          </strong>{' '}
          · Confidence:{' '}
          <span className="font-semibold text-claude-700">{safeText(data.confidence)}</span>
        </div>
      )}

      {(data.comparables || []).length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-claude-700">
            Comparable sale listings found
          </p>
          <ul className="space-y-2">
            {data.comparables.slice(0, 8).map((c, i) => (
              <li key={i} className="rounded-xl bg-cream-50 p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-ink">{safeText(c.address)}</p>
                  <span className="font-display font-bold text-claude-700 tabular-nums">
                    {formatGBP(c.askingPrice)}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  {c.bedrooms ? `${c.bedrooms}-bed ` : ''}
                  {safeText(c.propertyType, '')}
                  {c.floorAreaSqM ? ` · ${c.floorAreaSqM} m²` : ''}
                  {c.pricePerSqFt ? ` · £${c.pricePerSqFt}/sqft` : ''}
                  {' · '}
                  {safeText(c.source)}
                  {c.listedDate ? ` · listed ${c.listedDate}` : ''}
                </p>
                {c.sourceUrl && (
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs text-claude-700 hover:underline"
                  >
                    View listing ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ConstructionCostAgentCard({ report }) {
  const postcode = report?.queryInput?.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/i)?.[1];
  const body = {
    address: report?.queryInput,
    postcode: postcode || '',
    localAuthority: report?.marketContext?.localAuthority,
    region: report?.marketContext?.region,
    scope: 'New-build residential, light refurbishment, and conversion',
  };
  return (
    <AgentRunnerCard
      title="Construction cost estimate (alternative to RICS BCIS)"
      subtitle="Searches RICS press, AECOM/Mott MacDonald public reports, and construction press for current build cost benchmarks for this region. Replaces RICS BCIS (~£700/yr) for high-level estimates."
      endpoint="/api/construction-cost"
      body={body}
      eventName="construction-cost"
      buttonLabel="Run cost agent"
      caveats={[
        'Indicative only — not a substitute for project-specific QS cost planning.',
        'Public commentary on BCIS data, not the BCIS subscription itself.',
      ]}
      renderResult={(d) => <ConstructionCostResult data={d} />}
    />
  );
}

function ConstructionCostResult({ data }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Region: <strong className="text-ink">{safeText(data.location)}</strong>
      </p>
      {(data.estimates || []).map((e, i) => (
        <div key={i} className="rounded-xl border border-cream-200 bg-cream-50 p-3 text-sm">
          <p className="font-semibold text-ink">{safeText(e.scope)}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <Stat
              label="£/m² range"
              value={`£${e.ratePerSqM?.low || '?'} – £${e.ratePerSqM?.high || '?'}`}
              sub={e.ratePerSqM?.midpoint ? `mid £${e.ratePerSqM.midpoint}` : ''}
            />
            <Stat
              label="£/sqft range"
              value={`£${e.ratePerSqFt?.low || '?'} – £${e.ratePerSqFt?.high || '?'}`}
              sub={e.ratePerSqFt?.midpoint ? `mid £${e.ratePerSqFt.midpoint}` : ''}
            />
          </div>
          {e.notes && <p className="mt-2 text-xs text-slate-600">{safeText(e.notes)}</p>}
          {(e.sourcesCited || []).length > 0 && (
            <div className="mt-2 space-y-0.5 text-xs">
              {e.sourcesCited.map((s, j) => (
                <a
                  key={j}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-claude-700 hover:underline"
                >
                  {safeText(s.name)}
                  {s.publishedDate ? ` (${safeText(s.publishedDate)})` : ''} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <Stat label="Professional fees" value={safeText(data.professionalFees)} />
        <Stat label="Contingency" value={safeText(data.contingency)} />
      </div>
    </div>
  );
}

export function CorporatePropertiesAgentCard({ report }) {
  const body = {
    companyName: report?.companyProfile?.officialName || report?.queryInput,
    companyNumber: report?.companyProfile?.companyNumber,
  };
  return (
    <AgentRunnerCard
      title="UK property holdings (AI search alternative)"
      subtitle="The Land Registry CCOD/OCOD bulk datasets need session-based access not available to automated tools. This agent searches Property Week, Construction News, EG, the company's annual report, and news sources to identify properties owned, developed, leased, or managed."
      endpoint="/api/corporate-properties"
      body={body}
      eventName="corporate-properties"
      buttonLabel="Run holdings agent"
      noteCost="~$0.10–0.20 per run"
      caveats={[
        'Web-derived evidence only — surfaces the most-publicised holdings, not every title.',
        'Major housebuilders may own thousands of titles; only the headline ones are likely to appear.',
        'For a definitive title-by-title list, manually search the Land Registry CCOD CSV using the company number.',
      ]}
      renderResult={(d) => <CorporatePropertiesResult data={d} />}
    />
  );
}

function CorporatePropertiesResult({ data }) {
  if (!data.found) {
    return (
      <div className="rounded-xl border border-warn-bg bg-warn-bg/40 p-3 text-sm">
        <p className="font-semibold text-warn-text">No specific properties evidenced</p>
        <p className="mt-1 text-xs text-slate-700">{safeText(data.summary)}</p>
        {data.searchQueriesUsed && (
          <p className="mt-1 text-xs text-slate-500">
            Searched: {data.searchQueriesUsed.map((q) => `"${q}"`).join(' · ')}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-cream-50 p-3 text-sm">
        <p className="font-semibold text-ink">{data.totalFound} properties evidenced</p>
        <p className="mt-1 text-xs text-slate-700">{safeText(data.summary)}</p>
      </div>
      <ul className="space-y-2">
        {(data.properties || []).map((p, i) => (
          <li key={i} className="rounded-xl border border-cream-200 bg-white p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-ink">{safeText(p.address)}</p>
              <span className="pill-info">{safeText(p.relationship)}</span>
            </div>
            <p className="text-xs text-slate-600">
              {safeText(p.type)}
              {p.town ? ` · ${safeText(p.town)}` : ''}
              {p.postcode ? ` · ${safeText(p.postcode)}` : ''}
              {p.yearAcquired ? ` · acquired ${p.yearAcquired}` : ''}
              {p.yearDisposed ? ` · disposed ${p.yearDisposed}` : ''}
              {p.value ? ` · ${safeText(p.value)}` : ''}
            </p>
            {p.evidenceQuote && (
              <p className="mt-1 italic text-xs text-slate-600">"{safeText(p.evidenceQuote)}"</p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Source: {safeText(p.source)}{' '}
              {p.sourceUrl && (
                <a
                  href={p.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-claude-700 hover:underline"
                >
                  ↗
                </a>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VatLookupAgentCard({ report }) {
  const body = {
    companyName: report?.companyProfile?.officialName || report?.queryInput,
    companyNumber: report?.companyProfile?.companyNumber,
  };
  return (
    <AgentRunnerCard
      title="VAT registration lookup"
      subtitle="Searches gov.uk, EU VIES, and Companies House filings for the company's UK VAT registration number and current status. Replaces the empty VAT card with real data — only when found."
      endpoint="/api/vat-lookup"
      body={body}
      eventName="vat-lookup"
      buttonLabel="Run VAT lookup"
      noteCost="~$0.05–0.10 per run"
      caveats={[
        'Reports "not found" honestly — never guesses a VAT number.',
        'For authoritative real-time verification of an active VAT number, use the GOV.UK Check VAT number tool directly.',
      ]}
      renderResult={(d) => <VatLookupResult data={d} />}
    />
  );
}

function VatLookupResult({ data }) {
  if (!data.found) {
    return (
      <div className="rounded-xl border border-warn-bg bg-warn-bg/40 p-3 text-sm">
        <p className="font-semibold text-warn-text">VAT number not found</p>
        <p className="mt-1 text-xs text-slate-700">{safeText(data.explanation)}</p>
        {data.searchQueriesUsed && (
          <p className="mt-1 text-xs text-slate-500">
            Tried: {data.searchQueriesUsed.map((q) => `"${q}"`).join(' · ')}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500">VAT number</p>
          <p className="font-display text-lg font-bold tabular-nums text-ink">
            {safeText(data.vatNumber)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Status</p>
          <p className="font-semibold text-ink">
            {data.verifiedActive ? '✓ Verified active' : 'Found, not verified active'}
          </p>
        </div>
      </div>
      {data.vatRegisteredName && (
        <div className="rounded-xl bg-cream-50 p-2 text-sm">
          <p className="text-xs text-slate-500">Registered name</p>
          <p className="font-medium text-ink">{safeText(data.vatRegisteredName)}</p>
        </div>
      )}
      {data.vatAddress && (
        <div className="rounded-xl bg-cream-50 p-2 text-sm">
          <p className="text-xs text-slate-500">Registered address</p>
          <p className="font-medium text-ink">{safeText(data.vatAddress)}</p>
        </div>
      )}
      {data.explanation && (
        <p className="text-xs text-slate-600">{safeText(data.explanation)}</p>
      )}
      {(data.sources || []).length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">Sources</p>
          <ul className="space-y-0.5 text-xs">
            {data.sources.map((s, i) => (
              <li key={i}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-claude-700 hover:underline"
                >
                  {safeText(s.publisher || s.url)} ↗
                </a>
                {s.snippet && <span className="ml-1 text-slate-500">— "{safeText(s.snippet)}"</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AdverseMediaAgentCard({ report }) {
  const body = {
    companyName: report?.companyProfile?.officialName || report?.queryInput,
    companyNumber: report?.companyProfile?.companyNumber,
    directors: report?.directors || [],
  };
  return (
    <AgentRunnerCard
      title="Adverse media screening (alternative to Beauhurst / news monitoring)"
      subtitle="Searches FT, Guardian, BBC, Property Week, Reuters and others for news about the company over the last 5 years. Categorises findings as critical / warning / informational."
      endpoint="/api/adverse-media"
      body={body}
      eventName="adverse-media"
      buttonLabel="Run adverse media agent"
      noteCost="~$0.10–0.20 per run"
      caveats={[
        'Limited to publicly indexed news — not a substitute for paid news monitoring.',
        'Verify each finding against the original source before relying on it.',
      ]}
      renderResult={(d) => <AdverseMediaResult data={d} />}
    />
  );
}

function AdverseMediaResult({ data }) {
  const verdict = data.overallVerdict || 'Unknown';
  const verdictTone = /significant|material/i.test(verdict)
    ? 'crit'
    : /minor/i.test(verdict)
    ? 'warn'
    : /no concerns/i.test(verdict)
    ? 'ok'
    : 'info';

  const findings = data.findings || [];
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-cream-200 bg-cream-50 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display text-lg font-bold text-ink">{safeText(verdict)}</p>
          <span className={`pill-${verdictTone}`}>{safeText(verdict)}</span>
        </div>
        <p className="mt-1 text-sm text-slate-700">{safeText(data.summary)}</p>
        <div className="mt-2 flex gap-2 text-xs">
          {data.criticalCount > 0 && (
            <span className="pill-crit">{data.criticalCount} critical</span>
          )}
          {data.warningCount > 0 && (
            <span className="pill-warn">{data.warningCount} warning</span>
          )}
          {data.informationalCount > 0 && (
            <span className="pill-info">{data.informationalCount} informational</span>
          )}
        </div>
      </div>

      {findings.length > 0 && (
        <ul className="space-y-2">
          {findings.map((f, i) => {
            const tone =
              f.severity === 'critical'
                ? 'crit'
                : f.severity === 'warning'
                ? 'warn'
                : 'info';
            return (
              <li key={i} className="rounded-xl border border-cream-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-ink">{safeText(f.headline)}</p>
                  <span className={`pill-${tone}`}>{safeText(f.severity)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-700">{safeText(f.detail)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {safeText(f.source)} · {safeText(f.date)} ·{' '}
                  {f.verified ? '✓ Verified' : '⚠ Unverified'}
                </p>
                {f.sourceUrl && (
                  <a
                    href={f.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs text-claude-700 hover:underline"
                  >
                    Read source ↗
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-white p-2 text-center ring-1 ring-cream-200">
      <p className="text-xs uppercase tracking-wider text-slate-500">{safeText(label)}</p>
      <p className="font-display text-lg font-bold tabular-nums text-ink">{safeText(value)}</p>
      {sub && <p className="text-xs text-slate-500">{safeText(sub)}</p>}
    </div>
  );
}
