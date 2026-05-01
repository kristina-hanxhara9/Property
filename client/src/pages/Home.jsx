import SearchBar from '../components/SearchBar.jsx';

export default function Home({ mode, onModeChange, onSubmit, busy }) {
  return (
    <div className="space-y-12">
      <section>
        <div className="mb-8 max-w-3xl">
          <span className="pill-info mb-4">UK Property Intelligence</span>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            AI-powered due diligence on any UK property or JV partner.
          </h1>
          <p className="mt-3 text-lg text-slate-600">
            Enter an address or company name. PropertyIQ queries Land Registry, Companies
            House, Planning Data, and the Environment Agency in parallel, then synthesises
            the lot into a structured Deal Risk Report.
          </p>
        </div>
        <SearchBar
          mode={mode}
          onModeChange={onModeChange}
          onSubmit={onSubmit}
          busy={busy}
        />
      </section>

      <section id="how-it-works">
        <h2 className="card-title">How it works</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Step
            n={1}
            title="Search"
            body="Enter a UK property address or a company / JV partner name. The agent extracts the postcode and resolves coordinates."
          />
          <Step
            n={2}
            title="Parallel data fetch"
            body="The backend fires every relevant UK government API at once — Land Registry, Companies House, Planning Data, EA flood risk."
          />
          <Step
            n={3}
            title="AI synthesis"
            body="Claude reads the raw data and writes a structured Deal Risk Report with flags, risks, and recommended next steps."
          />
        </div>
      </section>

      <section id="data-sources">
        <h2 className="card-title">Data sources in this MVP</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Source name="HM Land Registry" detail="Price Paid Data — full transaction history" free />
          <Source name="Companies House" detail="Profile, officers, PSCs, charges, insolvency" free />
          <Source name="Planning Data GOV.UK" detail="Conservation, listed, green belt, AONB, +9 more" free />
          <Source name="Environment Agency" detail="Flood Zones 2 & 3, surface water, reservoir, historic" free />
          <Source name="Postcodes.io" detail="Postcode → coordinates + admin geography" free />
          <Source name="Claude (Anthropic)" detail="Senior-analyst-grade synthesis with streaming" />
        </div>
        <p className="mt-4 max-w-3xl text-xs text-slate-500">
          Data displayed under the Open Government Licence v3.0. Land Registry Title Register
          (paid £7/lookup), EPC Register, and BGS ground stability are planned for v1.1.
        </p>
      </section>
    </div>
  );
}

function Step({ n, title, body }) {
  return (
    <div className="card">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-ink font-display text-sm font-bold text-white">
        {n}
      </span>
      <h3 className="mt-3 font-display text-lg font-bold">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
    </div>
  );
}

function Source({ name, detail, free }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-ink">{name}</p>
        {free && <span className="pill-ok">Free</span>}
      </div>
      <p className="mt-1 text-xs text-slate-600">{detail}</p>
    </div>
  );
}
