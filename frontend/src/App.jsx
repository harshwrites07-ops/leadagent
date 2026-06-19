import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './styles/design-system.css';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/ui/Layout';
import Dashboard from './pages/Dashboard';
import LeadFinder from './pages/LeadFinder';
import PitchGenerator from './pages/PitchGenerator';
import EmailSender from './pages/EmailSender';
import CRM from './pages/CRM';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import ChannelAnalyzer from './pages/ChannelAnalyzer';
import Login from './pages/Login';
import Signup from './pages/Signup';
import PhoneLogin from './pages/PhoneLogin';
import Verify from './pages/Verify';
import Onboarding from './pages/Onboarding';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Admin from './pages/Admin';
import AdminSettings from './pages/AdminSettings';
import VerifyEmail from './pages/VerifyEmail';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import NotFound from './pages/NotFound';
import Landing from './pages/Landing';
import Campaigns from './pages/Campaigns';
import QualityLeads from './pages/QualityLeads';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--lime)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 1L3 7.5H7L5.5 13L11 6.5H7L8.5 1Z" fill="#0a0a0c" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-3)' }}>LOADING...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/landing" state={{ from: location }} replace />;
  if (!user.onboarding_completed && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

// Allows authed users who haven't completed onboarding
function ProtectedAllowOnboarding({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Fully public — no auth required */}
      <Route path="/landing" element={<Landing />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />

      {/* Public auth routes */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
      <Route path="/phone-login" element={<PublicRoute><PhoneLogin /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* Onboarding — requires auth but not completed onboarding */}
      <Route path="/onboarding" element={
        <ProtectedAllowOnboarding><Onboarding /></ProtectedAllowOnboarding>
      } />

      {/* Protected app routes */}
      <Route path="/*" element={
        <ProtectedRoute>
          <AppProvider>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/leads" element={<LeadFinder />} />
                <Route path="/analyzer" element={<ChannelAnalyzer />} />
                <Route path="/pitch/:leadId?" element={<PitchGenerator />} />
                <Route path="/email" element={<EmailSender />} />
                <Route path="/crm" element={<CRM />} />
                <Route path="/campaigns" element={<Campaigns />} />
                <Route path="/quality" element={<QualityLeads />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          </AppProvider>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
