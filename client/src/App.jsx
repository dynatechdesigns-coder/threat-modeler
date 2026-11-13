import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import DashboardLayout from './components/layout/DashboardLayout.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CodeVault from './pages/CodeVault.jsx';
import ActiveScan from './pages/ActiveScan.jsx';
import Reports from './pages/Reports.jsx';
import ThreatReport from './pages/ThreatReport.jsx';
import LinkChecker from './pages/LinkChecker.jsx';
import Compare from './pages/Compare.jsx';
import SharedReport from './pages/SharedReport.jsx';
import WatchedRepos from './pages/WatchedRepos.jsx';
import HeaderChecker from './pages/HeaderChecker.jsx';
import Admin from './pages/Admin.jsx';
import ApiTokens from './pages/ApiTokens.jsx';
import Billing from './pages/Billing.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/r/:token" element={<SharedReport />} />

      {/* App (requires sign-in) */}
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/vault" element={<CodeVault />} />
        <Route path="/scans/:id" element={<ActiveScan />} />
        <Route path="/links" element={<LinkChecker />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/watch" element={<WatchedRepos />} />
        <Route path="/headers" element={<HeaderChecker />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/tokens" element={<ApiTokens />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/reports/:id" element={<ThreatReport />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
