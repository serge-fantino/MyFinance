import { Routes, Route, Navigate } from "react-router-dom";

// Pages - will be implemented progressively
// import LoginPage from "./pages/auth/LoginPage";
// import RegisterPage from "./pages/auth/RegisterPage";
// import DashboardPage from "./pages/dashboard/DashboardPage";
// import AccountsPage from "./pages/accounts/AccountsPage";
// import TransactionsPage from "./pages/transactions/TransactionsPage";
// import AnalyticsPage from "./pages/analytics/AnalyticsPage";
// import AIChatPage from "./pages/ai-chat/AIChatPage";
// import SettingsPage from "./pages/settings/SettingsPage";

function App() {
  return (
    <div className="min-h-screen bg-background">
      <Routes>
        {/* Public routes */}
        {/* <Route path="/login" element={<LoginPage />} /> */}
        {/* <Route path="/register" element={<RegisterPage />} /> */}

        {/* Protected routes (will be wrapped in AuthGuard) */}
        {/* <Route path="/dashboard" element={<DashboardPage />} /> */}
        {/* <Route path="/accounts" element={<AccountsPage />} /> */}
        {/* <Route path="/transactions" element={<TransactionsPage />} /> */}
        {/* <Route path="/analytics" element={<AnalyticsPage />} /> */}
        {/* <Route path="/ai-chat" element={<AIChatPage />} /> */}
        {/* <Route path="/settings" element={<SettingsPage />} /> */}

        {/* Placeholder while pages are not implemented */}
        <Route
          path="*"
          element={
            <div className="flex items-center justify-center min-h-screen">
              <div className="text-center">
                <h1 className="text-4xl font-bold text-primary mb-4">MyFinance</h1>
                <p className="text-muted-foreground text-lg">
                  Application en cours de developpement...
                </p>
              </div>
            </div>
          }
        />
      </Routes>
    </div>
  );
}

export default App;
