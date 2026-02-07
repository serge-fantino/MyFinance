/**
 * Main application layout with sidebar + header + content area.
 * Wraps all authenticated pages.
 */
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useUIStore } from "../../store/ui.store";

export function AppLayout() {
  const { sidebarOpen } = useUIStore();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Header />
      <main
        className="transition-all duration-300 p-6"
        style={{ marginLeft: sidebarOpen ? "16rem" : "4rem" }}
      >
        <Outlet />
      </main>
    </div>
  );
}
