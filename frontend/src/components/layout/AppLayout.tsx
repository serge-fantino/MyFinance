/**
 * Main application layout with sidebar + header + content area + footer.
 * Wraps all authenticated pages.
 */
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { useUIStore } from "../../store/ui.store";

export function AppLayout() {
  const { sidebarOpen } = useUIStore();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Sidebar />
      <Header />
      <main
        className="transition-all duration-300 p-6 flex-1"
        style={{ marginLeft: sidebarOpen ? "16rem" : "4rem" }}
      >
        <Outlet />
      </main>
      <div
        className="transition-all duration-300"
        style={{ marginLeft: sidebarOpen ? "16rem" : "4rem" }}
      >
        <Footer />
      </div>
    </div>
  );
}
