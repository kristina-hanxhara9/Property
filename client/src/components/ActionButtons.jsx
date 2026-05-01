const SUGGESTED_PROMPTS = {
  property: [
    {
      key: 'memo',
      label: 'Draft investment memo',
      prompt:
        'Draft a one-page investment memo for this property suitable for an internal investment committee — cover the deal thesis, financials, risks, and our recommended structure.',
    },
    {
      key: 'negotiate',
      label: 'Negotiation points',
      prompt:
        'Based on the report, list the top 5 things we should negotiate with the seller — price, terms, and conditions — and explain the leverage we have for each.',
    },
    {
      key: 'next',
      label: 'What to check next',
      prompt:
        'List the additional due diligence checks we should commission before exchange. Be specific — name reports, professionals, and rough costs.',
    },
    {
      key: 'exit',
      label: 'Exit strategies',
      prompt:
        'Suggest three plausible exit strategies for this asset over a 3–7 year horizon, with the headline pros, cons, and realistic GDV ranges for each.',
    },
  ],
  company: [
    {
      key: 'jv',
      label: 'JV structure recommendations',
      prompt:
        'Recommend the appropriate JV structure for working with this company — covering ownership split, governance, signing thresholds, and protections we should insist on.',
    },
    {
      key: 'redflags',
      label: 'Red flag deep dive',
      prompt:
        'Take the most serious red flag in this report and explain in plain English what it means, why it matters for a JV, and what additional information we need.',
    },
    {
      key: 'questions',
      label: 'Diligence questions to ask',
      prompt:
        'Generate a list of 10 specific diligence questions to put to this company before progressing — group them by ownership, financials, track record, and references.',
    },
    {
      key: 'strengths',
      label: 'Where they add value',
      prompt:
        'Based on this report, where could this company plausibly add value to a JV with us? Be honest about both strengths and where we would carry the load.',
    },
  ],
};

export default function ActionButtons({ reportType, onAction, disabled }) {
  const prompts = SUGGESTED_PROMPTS[reportType] || SUGGESTED_PROMPTS.property;
  return (
    <section className="card">
      <header className="mb-4 flex items-baseline justify-between gap-2">
        <div>
          <p className="card-title">Take it further</p>
          <h3 className="mt-1 font-display text-lg font-bold">
            Ask the agent a follow-up
          </h3>
        </div>
        <p className="hidden text-sm text-slate-500 sm:block">
          Click a prompt — the chat panel below will respond.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {prompts.map((p) => (
          <button
            key={p.key}
            type="button"
            disabled={disabled}
            onClick={() => onAction(p.prompt, p.label)}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left text-sm font-medium text-ink transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowIcon />
            {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 text-slate-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}
