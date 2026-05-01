import { useEffect, useRef, useState } from 'react';
import { streamPostSSE } from '../lib/sseClient.js';
import { apiUrl } from '../lib/api.js';

export default function ChatPanel({ report, pendingPrompt, onPromptConsumed }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (pendingPrompt) {
      send(pendingPrompt);
      onPromptConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingText]);

  async function send(text) {
    if (!text || streaming) return;
    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);
    setStreamingText('');

    const controller = new AbortController();
    abortRef.current = controller;
    let assistantText = '';

    try {
      await streamPostSSE(
        apiUrl('/api/chat'),
        {
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          reportContext: report,
        },
        {
          delta: (data) => {
            assistantText += data.text || '';
            setStreamingText(assistantText);
          },
          done: () => {
            setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }]);
            setStreamingText('');
            setStreaming(false);
          },
          error: (data) => {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `Error: ${data.message || 'Unknown error'}`,
                isError: true,
              },
            ]);
            setStreamingText('');
            setStreaming(false);
          },
        },
        controller.signal,
      );
      if (assistantText && streaming) {
        setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }]);
        setStreamingText('');
        setStreaming(false);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${err.message}`, isError: true },
        ]);
      }
      setStreamingText('');
      setStreaming(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    send(input.trim());
  }

  return (
    <section className="card flex h-[480px] flex-col">
      <header className="mb-3">
        <p className="card-title">Follow-up chat</p>
        <h3 className="mt-1 font-display text-lg font-bold">
          Ask anything about this report
        </h3>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/60 p-4"
      >
        {messages.length === 0 && !streaming && (
          <p className="text-sm text-slate-500">
            Ask a question, or click a suggested action above.
          </p>
        )}

        {messages.map((m, idx) => (
          <Message key={idx} message={m} />
        ))}

        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200">
              {streamingText ? (
                <p className="whitespace-pre-wrap text-slate-700">
                  {streamingText}
                  <span className="ml-1 animate-pulse text-slate-400">▎</span>
                </p>
              ) : (
                <span className="tick-pulse text-slate-400">Thinking…</span>
              )}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about the report…"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
          disabled={streaming}
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={streaming || !input.trim()}
        >
          {streaming ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  );
}

function Message({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
          isUser
            ? 'bg-claude text-white'
            : message.isError
            ? 'bg-crit-bg text-crit-text ring-1 ring-crit-text/20'
            : 'bg-white text-ink ring-1 ring-cream-200'
        }`}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
      </div>
    </div>
  );
}
