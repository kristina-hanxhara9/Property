import { useCallback, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import Home from './pages/Home.jsx';
import Report from './pages/Report.jsx';
import { streamPostSSE } from './lib/sseClient.js';
import { apiUrl } from './lib/api.js';

function detectPostcode(text) {
  if (!text) return null;
  const m = String(text).toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s?(\d[A-Z]{2})\b/);
  return m ? `${m[1]} ${m[2]}` : null;
}

export default function App() {
  const [view, setView] = useState('home');
  const [mode, setMode] = useState('property');
  const [query, setQuery] = useState('');
  const [steps, setSteps] = useState([]);
  const [report, setReport] = useState(null);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const updateStep = useCallback((step) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.name === step.name);
      if (idx === -1) return [...prev, step];
      const next = [...prev];
      next[idx] = { ...next[idx], ...step };
      return next;
    });
  }, []);

  const runReport = useCallback(
    async (input, runMode) => {
      setQuery(input);
      setSteps([]);
      setReport(null);
      setStreamingText('');
      setError(null);
      setIsStreaming(true);
      setIsComplete(false);
      setView('report');

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      let endpoint = apiUrl('/api/property-check');
      let body = { address: input, postcode: detectPostcode(input) };
      if (runMode === 'company') {
        endpoint = apiUrl('/api/company-check');
        const looksLikeNumber = /^\d{8}$/.test(input.replace(/\s/g, ''));
        body = looksLikeNumber
          ? { companyNumber: input.replace(/\s/g, '') }
          : { companyName: input };
      }

      let aiBuffer = '';

      try {
        await streamPostSSE(
          endpoint,
          body,
          {
            step: (data) => updateStep(data),
            'partial-data': () => {
              // Optional: render partial card data here
            },
            'company-matched': (data) => {
              // Hint for the user about which company was matched
              updateStep({
                name: 'ch-search',
                label: `Matched: ${data.matched.title} (${data.matched.companyNumber})`,
                status: 'complete',
              });
            },
            'ai-delta': (data) => {
              aiBuffer += data.text || '';
              setStreamingText(aiBuffer);
            },
            report: (data) => {
              setReport(data);
              setIsComplete(true);
              setIsStreaming(false);
            },
            error: (data) => {
              setError(data.message || 'Unknown error');
              setIsStreaming(false);
            },
          },
          controller.signal,
        );
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Request failed');
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [updateStep],
  );

  function handleSubmit(input) {
    runReport(input, mode);
  }

  function handleRetry() {
    if (query) runReport(query, mode);
  }

  function handleNewSearch() {
    abortRef.current?.abort();
    setView('home');
    setReport(null);
    setSteps([]);
    setStreamingText('');
    setError(null);
    setIsStreaming(false);
    setIsComplete(false);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header onHome={handleNewSearch} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        {view === 'home' && (
          <Home mode={mode} onModeChange={setMode} onSubmit={handleSubmit} busy={isStreaming} />
        )}
        {view === 'report' && (
          <Report
            mode={mode}
            query={query}
            steps={steps}
            report={report}
            streamingText={streamingText}
            isStreaming={isStreaming}
            isComplete={isComplete}
            error={error}
            onRetry={handleRetry}
            onNewSearch={handleNewSearch}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 text-xs text-slate-500 sm:px-6">
          <p>
            Data from HM Land Registry, Companies House, GOV.UK Planning Data, and the
            Environment Agency under the Open Government Licence v3.0.
          </p>
          <p className="mt-1">Powered by Claude (Anthropic). Reports are stateless and not stored.</p>
        </div>
      </footer>
    </div>
  );
}
