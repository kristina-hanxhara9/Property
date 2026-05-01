export default function AISummary({ report, streamingText, isStreaming }) {
  const summary = report?.aiSummary;
  const text = isStreaming && streamingText
    ? extractSummaryFromStream(streamingText)
    : summary;

  return (
    <section className="card">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="card-title">Analyst summary</p>
          <h3 className="mt-1 font-display text-lg font-bold">
            What our agent thinks
          </h3>
        </div>
        {isStreaming && (
          <span className="pill-info">
            <span className="tick-pulse">●</span>
            Streaming
          </span>
        )}
      </header>

      {text ? (
        <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-700">
          {text}
          {isStreaming && <span className="ml-1 animate-pulse text-slate-400">▎</span>}
        </p>
      ) : (
        <SummarySkeleton />
      )}

      {report && (
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
          {report.keyRisks?.length > 0 && (
            <KeyList title="Key risks" items={report.keyRisks} tone="warn" />
          )}
          {report.keyOpportunities?.length > 0 && (
            <KeyList title="Key opportunities" items={report.keyOpportunities} tone="ok" />
          )}
          {report.keyPositives?.length > 0 && !report.keyOpportunities?.length && (
            <KeyList title="Key positives" items={report.keyPositives} tone="ok" />
          )}
        </div>
      )}
    </section>
  );
}

function KeyList({ title, items, tone }) {
  const dot = tone === 'ok' ? 'bg-ok-text' : tone === 'warn' ? 'bg-warn-text' : 'bg-info-text';
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <ul className="space-y-1.5 text-sm text-slate-700">
        {items.map((item, idx) => (
          <li key={`${title}-${idx}`} className="flex gap-2">
            <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function extractSummaryFromStream(stream) {
  if (!stream) return '';
  const match = stream.match(/"aiSummary"\s*:\s*"((?:\\.|[^"\\])*)/);
  if (!match) return '';
  return match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
}

function SummarySkeleton() {
  return (
    <div className="space-y-2">
      <div className="skeleton h-4 w-full rounded" />
      <div className="skeleton h-4 w-11/12 rounded" />
      <div className="skeleton h-4 w-4/5 rounded" />
      <div className="skeleton h-4 w-2/3 rounded" />
    </div>
  );
}
