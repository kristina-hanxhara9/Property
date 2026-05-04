import { useState } from 'react';
import AgentLog from '../components/AgentLog.jsx';
import RiskBanner from '../components/RiskBanner.jsx';
import { PropertyCards, CompanyCards } from '../components/ReportCards.jsx';
import FlagsList from '../components/FlagsList.jsx';
import AISummary from '../components/AISummary.jsx';
import RecommendedSteps from '../components/RecommendedSteps.jsx';
import ActionButtons from '../components/ActionButtons.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import MarketComparables from '../components/MarketComparables.jsx';
import RawDataSection from '../components/RawDataSection.jsx';
import {
  AvmAgentCard,
  ConstructionCostAgentCard,
  AdverseMediaAgentCard,
  VatLookupAgentCard,
  CorporatePropertiesAgentCard,
  CommercialRentsAgentCard,
  HmoRentsAgentCard,
} from '../components/AiAgentCards.jsx';
import VatVerifyCard from '../components/VatVerifyCard.jsx';
import InvestmentMemoCard from '../components/InvestmentMemoCard.jsx';
import { apiUrl } from '../lib/api.js';

export default function Report({
  mode,
  query,
  steps,
  report,
  rawData,
  streamingText,
  isStreaming,
  isComplete,
  error,
  onRetry,
  onNewSearch,
}) {
  const [pendingPrompt, setPendingPrompt] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [investmentMemo, setInvestmentMemo] = useState(null);
  const [agentResults, setAgentResults] = useState({});
  const reportType = mode === 'company' ? 'company' : 'property';

  function setAgentResult(key, data) {
    setAgentResults((prev) => ({ ...prev, [key]: data }));
  }

  async function handleDownloadDocx() {
    if (!report || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(apiUrl('/api/export-docx'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report, investmentMemo, agentResults }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Server returned ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (report.queryInput || 'report')
        .replace(/[^a-z0-9-]+/gi, '_')
        .slice(0, 80);
      a.download = `propertyiq_${reportType}_${safeName}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  }

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
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={onNewSearch}>
            New search
          </button>
          {isComplete && (
            <button type="button" className="btn-soft" onClick={onRetry}>
              Re-run
            </button>
          )}
          {report && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleDownloadDocx}
              disabled={downloading}
            >
              {downloading ? 'Building Word doc…' : '📄 Download Word doc'}
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

          {reportType === 'property' && (
            <>
              <InvestmentMemoCard report={report} onMemoReady={setInvestmentMemo} />
              <MarketComparables report={report} onResult={(d) => setAgentResult('comparables', d)} />
              <AvmAgentCard report={report} onResult={(d) => setAgentResult('avm', d)} />
              <HmoRentsAgentCard report={report} onResult={(d) => setAgentResult('hmoRents', d)} />
              <CommercialRentsAgentCard report={report} onResult={(d) => setAgentResult('commercialRents', d)} />
              <ConstructionCostAgentCard report={report} onResult={(d) => setAgentResult('constructionCost', d)} />
            </>
          )}

          {reportType === 'company' && (
            <>
              <CorporatePropertiesAgentCard report={report} onResult={(d) => setAgentResult('corporateProperties', d)} />
              <AdverseMediaAgentCard report={report} onResult={(d) => setAgentResult('adverseMedia', d)} />
              <VatVerifyCard />
              <VatLookupAgentCard report={report} onResult={(d) => setAgentResult('vatLookup', d)} />
            </>
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

          <RawDataSection rawData={rawData} />
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
