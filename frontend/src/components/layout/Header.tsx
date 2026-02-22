import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useUIStore } from "../../store/ui.store";
import { Button } from "../ui/Button";

export function Header() {
  const { user, logout } = useAuth();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <header
      className="sticky top-0 z-30 flex h-16 items-center border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60"
      style={{ marginLeft: sidebarOpen ? "16rem" : "4rem" }}
    >
      <div className="flex flex-1 items-center justify-between px-6">
        {/* Left: toggle sidebar */}
        <button
          onClick={toggleSidebar}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label="Toggle sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>

        {/* Right: user profile dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/50 transition-colors"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{user?.full_name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary font-semibold text-sm">
              {user?.full_name
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2) ?? "?"}
            </div>
            <svg
              className={`w-4 h-4 text-muted-foreground transition-transform ${profileOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-1 w-48 rounded-md border bg-card py-1 shadow-lg z-50">
              <Link
                to="/account"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                Mon compte
              </Link>
              <button
                onClick={() => { setProfileOpen(false); logout(); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
