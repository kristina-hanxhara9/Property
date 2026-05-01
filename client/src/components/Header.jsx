export default function Header({ onHome }) {
  return (
    <header className="border-b border-cream-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <button
          type="button"
          onClick={onHome}
          className="flex items-center gap-3 text-left"
          aria-label="PropertyIQ home"
        >
          <span
            className="grid h-9 w-9 place-items-center rounded-xl bg-claude text-white shadow-sm"
            aria-hidden
          >
            <Logo />
          </span>
          <span>
            <span className="block font-display text-lg font-bold leading-none tracking-tight text-ink">
              PropertyIQ
            </span>
            <span className="block text-xs font-medium uppercase tracking-wider text-claude-700">
              UK Property Intelligence
            </span>
          </span>
        </button>

        <nav className="hidden items-center gap-6 text-sm text-ink/70 md:flex">
          <a href="#how-it-works" className="hover:text-claude">How it works</a>
          <a href="#data-sources" className="hover:text-claude">Data sources</a>
          <a
            href="https://platform.claude.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-claude"
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
