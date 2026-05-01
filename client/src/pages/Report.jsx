import { useState } from 'react';
import AgentLog from '../components/AgentLog.jsx';
import RiskBanner from '../components/RiskBanner.jsx';
import { PropertyCards, CompanyCards } from '../components/ReportCards.jsx';
import FlagsList from '../components/FlagsList.jsx';
import AISummary from '../components/AISummary.jsx';
import RecommendedSteps from '../components/RecommendedSteps.jsx';
import ActionButtons from '../components/ActionButtons.jsx';
import ChatPanel from '../components/ChatPanel.jsx';

export default function Report({
  mode,
  query,
  steps,
  report,
  streamingText,
  isStreaming,
  isComplete,
  error,
  onRetry,
  onNewSearch,
}) {
  const [pendingPrompt, setPendingPrompt] = useState(null);
  const reportType = mode === 'company' ? 'company' : 'property';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {reportType === 'company' ? 'JV Partner Risk Report' : 'Deal Risk Report'}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink">
            {query || (reportType === 'company' ? 'Company analysis' : 'Property analysis')}
          </h1>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={onNewSearch}>
            New search
          </button>
          {isComplete && (
            <button type="button" className="btn-soft" onClick={onRetry}>
              Re-run
            </button>
          )}
        </div>
      </div>

      {!isComplete && <AgentLog steps={steps} />}

      {error && (
        <div className="card border-l-4 border-l-crit-text">
          <h3 className="font-display text-lg font-bold text-crit-text">Couldn't complete the report</h3>
          <p className="mt-2 text-sm text-slate-700">{error}</p>
          <button type="button" className="btn-soft mt-4" onClick={onNewSearch}>
            Back to search
          </button>
        </div>
      )}

      {report && (
        <>
          <RiskBanner report={report} />

          {reportType === 'property' ? (
            <PropertyCards report={report} />
          ) : (
            <CompanyCards report={report} />
          )}

          <FlagsList flags={report.flags} />

          <AISummary
            report={report}
            streamingText={streamingText}
            isStreaming={isStreaming && !isComplete}
          />

          <RecommendedSteps report={report} />

          <ActionButtons
            reportType={reportType}
            disabled={isStreaming}
            onAction={(prompt) => setPendingPrompt(prompt)}
          />

          <ChatPanel
            report={report}
            pendingPrompt={pendingPrompt}
            onPromptConsumed={() => setPendingPrompt(null)}
          />
        </>
      )}

      {!report && isStreaming && (
        <>
          <RiskBannerSkeleton />
          <CardsSkeleton />
        </>
      )}
    </div>
  );
}

function RiskBannerSkeleton() {
  return (
    <div className="card">
      <div className="flex items-center gap-4">
        <div className="skeleton h-20 w-20 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3 w-32 rounded" />
          <div className="skeleton h-6 w-3/4 rounded" />
        </div>
      </div>
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className="card space-y-3">
          <div className="skeleton h-3 w-32 rounded" />
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-5/6 rounded" />
          <div className="skeleton h-4 w-2/3 rounded" />
        </div>
      ))}
    </div>
  );
}
