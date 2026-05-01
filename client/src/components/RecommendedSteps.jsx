export default function RecommendedSteps({ report }) {
  const steps = report?.recommendedNextSteps || report?.recommendedDueDiligence || [];
  if (steps.length === 0) return null;

  return (
    <section className="card">
      <header className="mb-4">
        <p className="card-title">Recommended next steps</p>
        <h3 className="mt-1 font-display text-lg font-bold">Due diligence checklist</h3>
      </header>
      <ol className="space-y-2">
        {steps.map((step, idx) => (
          <li
            key={`${step}-${idx}`}
            className="flex gap-3 rounded-xl border border-cream-200 bg-cream-50 p-4"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-claude text-xs font-bold text-white">
              {idx + 1}
            </span>
            <p className="text-sm text-slate-700">{step}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
