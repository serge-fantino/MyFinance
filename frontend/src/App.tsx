import { Routes, Route, Navigate } from "react-router-dom";
import { AuthGuard } from "./components/auth/AuthGuard";
import { GuestGuard } from "./components/auth/GuestGuard";
import { AppLayout } from "./components/layout/AppLayout";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import AccountsPage from "./pages/accounts/AccountsPage";
import TransactionsPage from "./pages/transactions/TransactionsPage";
import ClassificationPage from "./pages/classification/ClassificationPage";
import SettingsPage from "./pages/settings/SettingsPage";
import AnalyticsPage from "./pages/analytics/AnalyticsPage";

function App() {
  return (
    <div className="min-h-screen bg-background">
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={
            <GuestGuard>
              <LoginPage />
            </GuestGuard>
          }
        />
        <Route
          path="/register"
          element={
            <GuestGuard>
              <RegisterPage />
            </GuestGuard>
          }
        />

        {/* Protected routes */}
        <Route
          element={
            <AuthGuard>
              <AppLayout />
            </AuthGuard>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/classification" element={<ClassificationPage />} />

          {/* Placeholder pages */}
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/ai-chat" element={<PlaceholderPage title="Assistant IA" description="L'assistant conversationnel IA arrive bientot." />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  );
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="rounded-full bg-primary/10 p-6 mb-6">
        <svg className="h-12 w-12 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      <p className="text-muted-foreground text-center max-w-md">{description}</p>
    </div>
  );
}

export default App;
