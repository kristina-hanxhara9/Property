// Comprehensive catalogue of paid third-party APIs that can be added to
// PropertyIQ. Grouped by category, with what each provides, typical pricing,
// and the integration complexity. This is the "what you can buy" page.

const CATEGORIES = [
  {
    title: 'Property identity & ownership',
    description:
      'Verify who actually owns a property, what charges sit on the title, and any restrictive covenants — beyond the free Companies House register.',
    items: [
      {
        name: 'HM Land Registry — Title Register',
        provider: 'HM Land Registry Business Gateway',
        cost: '£7 per title',
        unlocks:
          'Owner full legal name + correspondence address · title number · tenure (freehold/leasehold + years remaining) · all registered charges/mortgages with lender names · restrictive covenants · easements + rights of way · last registration date',
        link: 'https://eservices.landregistry.gov.uk/eservices/FindAProperty/view/QuickEnquiryInit.do',
      },
      {
        name: 'HM Land Registry — Title Plan',
        provider: 'HM Land Registry Business Gateway',
        cost: '£7 per title',
        unlocks: 'Boundary plan as PDF/image showing exact land extent',
        link: 'https://eservices.landregistry.gov.uk/',
      },
      {
        name: 'Coal Mining Report',
        provider: 'Mining Remediation Authority',
        cost: '~£30 per property',
        unlocks: 'Detailed mining report — past workings, shafts, remediation, claims history',
        link: 'https://www.gov.uk/check-coal-mining-reports',
      },
      {
        name: 'BGS GeoSure',
        provider: 'British Geological Survey',
        cost: '~£10-30 per property',
        unlocks:
          'Detailed ground stability hazard assessment — shrink-swell, dissolution, slope, compressible ground, with confidence scores per layer',
        link: 'https://www.bgs.ac.uk/datasets/geosure/',
      },
    ],
  },
  {
    title: 'Asking prices, asking rents & yields',
    description:
      'Live asking prices and rents from the major portals. Required for proper rental comparables.',
    items: [
      {
        name: 'PropertyData',
        provider: 'PropertyData.co.uk',
        cost: '£99–299/month',
        unlocks:
          '£/sqft averages by postcode · asking rent + sold price comparables · rental yields · supply/demand index · planning history overlays',
        link: 'https://propertydata.co.uk/api',
      },
      {
        name: 'Rightmove Plus / Rightmove Data Services',
        provider: 'Rightmove',
        cost: 'Enterprise (~£500+/mo)',
        unlocks:
          'Live asking-price feed · sold prices · rental listings · daily updates · proprietary HMO + commercial dataset',
        link: 'https://www.rightmove.co.uk/data-services',
      },
      {
        name: 'Zoopla Data Services',
        provider: 'Zoopla',
        cost: 'Enterprise',
        unlocks: 'Live listings · sold prices · area Zed-Index · rental estimates · demand metrics',
        link: 'https://www.zoopla.co.uk/data/',
      },
      {
        name: 'OnTheMarket Data Feed',
        provider: 'OnTheMarket',
        cost: 'Enterprise',
        unlocks: 'Live agent-only listings · asking prices · rental data',
        link: 'https://www.onthemarket.com/',
      },
    ],
  },
  {
    title: 'Automated valuations (AVM) & demand',
    description:
      'Statistical valuations and demand indices used by lenders. Useful for quick sanity-checks against asking prices.',
    items: [
      {
        name: 'Hometrack AVM',
        provider: 'Hometrack (Zoopla)',
        cost: '~£300+/mo, per-call pricing for high volume',
        unlocks:
          'Statistical sale + rental valuation per property · confidence band · forecast 12-month change · used by major UK lenders',
        link: 'https://www.hometrack.com/',
      },
      {
        name: 'PropertyData AVM',
        provider: 'PropertyData.co.uk',
        cost: 'Included in £299/mo plan',
        unlocks: 'Asking-price-based valuation, less authoritative but cheaper',
        link: 'https://propertydata.co.uk/',
      },
      {
        name: 'LandTech / Land Insight Sourcing',
        provider: 'LandTech',
        cost: '£100-500/mo',
        unlocks: 'Sourcing engine — find sites by criteria · ownership lookup · planning overlay',
        link: 'https://land.tech/',
      },
    ],
  },
  {
    title: 'Commercial property',
    description: 'Rents, yields, and tenant data for retail, office, industrial, restaurant, pub.',
    items: [
      {
        name: 'CoStar UK',
        provider: 'CoStar',
        cost: '£500-2,000+/mo',
        unlocks:
          'Comprehensive commercial property database — rents, lease terms, tenant identities, sale comparables, yields by sector',
        link: 'https://www.costar.com/',
      },
      {
        name: 'Realla',
        provider: 'Realla (LoopNet UK)',
        cost: 'Enterprise',
        unlocks: 'Commercial listings + rental + sale data',
        link: 'https://realla.co.uk/',
      },
      {
        name: 'Rightmove Commercial',
        provider: 'Rightmove',
        cost: 'Enterprise data feed',
        unlocks: 'Live commercial listings + yields',
        link: 'https://www.rightmove.co.uk/commercial-property.html',
      },
    ],
  },
  {
    title: 'Construction & development costs',
    description: 'Build cost benchmarks and developer-focused data.',
    items: [
      {
        name: 'RICS BCIS',
        provider: 'RICS',
        cost: '£700+/year',
        unlocks:
          'Building Cost Information Service — £/sqft new-build benchmarks by region and asset class · refurb costs · maintenance lifetimes',
        link: 'https://www.rics.org/uk/products/data-products/isurv-bcis/',
      },
      {
        name: 'AECOM / Mott MacDonald cost data',
        provider: 'AECOM / Mott MacDonald',
        cost: 'Project-level fee',
        unlocks: 'Bespoke cost reports for major schemes',
        link: 'https://www.aecom.com/',
      },
    ],
  },
  {
    title: 'Business credit & financial health',
    description:
      'Credit reports and financial monitoring on a counterparty company beyond Companies House.',
    items: [
      {
        name: 'Experian Business',
        provider: 'Experian',
        cost: '£500-2,000+/mo',
        unlocks:
          'Full credit report · risk score · payment history · directors database · tradeline data · Delphi credit limit recommendation',
        link: 'https://www.experian.co.uk/business/products/business-information/',
      },
      {
        name: 'Creditsafe UK',
        provider: 'Creditsafe',
        cost: '£200-500/mo',
        unlocks: 'Credit limit · days-to-pay · payment trends · group structure · monitoring alerts',
        link: 'https://www.creditsafe.com/',
      },
      {
        name: 'Endole',
        provider: 'Endole',
        cost: '£40-100/mo',
        unlocks: 'UK SME credit report · accounts ratios · directors track record · SME-focused',
        link: 'https://www.endole.co.uk/',
      },
      {
        name: 'Dun & Bradstreet (D&B)',
        provider: 'D&B',
        cost: 'Enterprise (DUNS-based)',
        unlocks: 'Global business credit data, supply-chain risk, PAYDEX score',
        link: 'https://www.dnb.co.uk/',
      },
      {
        name: 'Red Flag Alert',
        provider: 'Red Flag Alert',
        cost: '£99+/mo',
        unlocks:
          'Real-time insolvency alerts · risk monitoring · accounts deadlines · CCJ tracking',
        link: 'https://www.redflagalert.com/',
      },
      {
        name: 'Beauhurst',
        provider: 'Beauhurst',
        cost: '£500+/mo',
        unlocks:
          'Private company financials · funding rounds · high-growth tracking · investor relationships',
        link: 'https://www.beauhurst.com/',
      },
    ],
  },
  {
    title: 'KYC, AML & ID verification',
    description:
      'Verify a counterparty individual\'s identity, ID document authenticity and AML risk.',
    items: [
      {
        name: 'Onfido',
        provider: 'Onfido',
        cost: '£3-5 per check',
        unlocks: 'ID document scan + selfie biometric · facial similarity · sanctions screening',
        link: 'https://onfido.com/',
      },
      {
        name: 'Stripe Identity',
        provider: 'Stripe',
        cost: '£1.50 per verification',
        unlocks: 'ID + selfie verification with simple integration',
        link: 'https://stripe.com/identity',
      },
      {
        name: 'ComplyAdvantage',
        provider: 'ComplyAdvantage',
        cost: 'Enterprise',
        unlocks: 'Real-time AML/sanctions monitoring, PEP screening, adverse media',
        link: 'https://complyadvantage.com/',
      },
      {
        name: 'TruNarrative (LexisNexis)',
        provider: 'LexisNexis',
        cost: 'Enterprise',
        unlocks:
          'Full risk-engine — KYC, AML, fraud, ID&V on individuals and companies, ongoing monitoring',
        link: 'https://www.lexisnexis.com/risk/uk/en/',
      },
    ],
  },
  {
    title: 'Personal credit & affordability',
    description: 'For applicant or counterparty individuals — typically requires their consent.',
    items: [
      {
        name: 'Experian Consumer',
        provider: 'Experian',
        cost: 'Per-call pricing',
        unlocks: 'Consumer credit report (with applicant consent), risk score, affordability',
        link: 'https://www.experian.co.uk/',
      },
      {
        name: 'Equifax UK Consumer',
        provider: 'Equifax',
        cost: 'Per-call pricing',
        unlocks: 'Consumer credit report (with applicant consent)',
        link: 'https://www.equifax.co.uk/',
      },
      {
        name: 'Open Banking — TrueLayer / Plaid UK',
        provider: 'TrueLayer / Plaid',
        cost: '~£0.10-0.30 per call',
        unlocks:
          'Bank account verification · transaction history (with consent) · affordability based on AIS data',
        link: 'https://truelayer.com/',
      },
    ],
  },
];

export default function PremiumServices({ onBack }) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-claude-700">
            Premium services
          </p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
            Paid APIs that extend PropertyIQ
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            PropertyIQ's free integrations cover ~80% of property and JV due-diligence needs. The
            services below cost money and would each take roughly 1-2 days of integration work to
            wire in. Pricing is approximate and tier-dependent — confirm with each provider.
          </p>
        </div>
        {onBack && (
          <button type="button" className="btn-ghost" onClick={onBack}>
            ← Back
          </button>
        )}
      </div>

      <div className="space-y-6">
        {CATEGORIES.map((cat) => (
          <section key={cat.title} className="card">
            <header>
              <h2 className="font-display text-xl font-bold text-ink">{cat.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{cat.description}</p>
            </header>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {cat.items.map((item) => (
                <div
                  key={item.name}
                  className="flex flex-col gap-2 rounded-xl border border-cream-200 bg-cream-50/40 p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-semibold text-ink">{item.name}</h3>
                    <span className="pill-info shrink-0 whitespace-nowrap">{item.cost}</span>
                  </div>
                  <p className="text-xs text-slate-500">via {item.provider}</p>
                  <p className="text-sm text-slate-700">{item.unlocks}</p>
                  {item.link && (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-claude-700 hover:underline"
                    >
                      Open provider site ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="card border-l-4 border-l-claude bg-claude-50">
        <h2 className="font-display text-lg font-bold text-claude-700">Want me to integrate any of these?</h2>
        <p className="mt-2 text-sm text-slate-700">
          Each integration is roughly a focused half-day of work plus the provider sign-up. Best
          value-for-money for a property + JV diligence tool: <strong>HM Land Registry Title
          Register</strong> (replaces the "Data unavailable" Ownership card with real owner data
          for £7) and <strong>PropertyData</strong> (£99/mo unlocks asking prices, asking rents,
          and yields by postcode). Talk to the developer to wire any of these up.
        </p>
      </div>
    </div>
  );
}
