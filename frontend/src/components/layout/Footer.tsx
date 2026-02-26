/**
 * Application footer — shows version and credits.
 */

const APP_VERSION = __APP_VERSION__;

export function Footer() {
  return (
    <footer className="text-xs text-muted-foreground text-center py-3 border-t border-border/40 mt-auto">
      <span>MyFinance v{APP_VERSION}</span>
      <span className="mx-2">|</span>
      <span>Built with React, FastAPI & AI</span>
    </footer>
  );
}
