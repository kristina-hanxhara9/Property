export default function Header({ onHome }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <button
          type="button"
          onClick={onHome}
          className="flex items-center gap-3 text-left"
          aria-label="PropertyIQ home"
        >
          <span
            className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-white shadow-sm"
            aria-hidden
          >
            <Logo />
          </span>
          <span>
            <span className="block font-display text-lg font-bold leading-none tracking-tight text-ink">
              PropertyIQ
            </span>
            <span className="block text-xs font-medium uppercase tracking-wider text-slate-500">
              UK Property Intelligence
            </span>
          </span>
        </button>

        <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
          <a href="#how-it-works" className="hover:text-ink">How it works</a>
          <a href="#data-sources" className="hover:text-ink">Data sources</a>
          <a
            href="https://platform.claude.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink"
          >
            Powered by Claude
          </a>
        </nav>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M4 19V8l8-4 8 4v11" />
      <path d="M9 19v-7h6v7" />
    </svg>
  );
}
