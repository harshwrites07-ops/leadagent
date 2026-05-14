import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/ui/Layout';
import Dashboard from './pages/Dashboard';
import LeadFinder from './pages/LeadFinder';
import PitchGenerator from './pages/PitchGenerator';
import EmailSender from './pages/EmailSender';
import CRM from './pages/CRM';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import ChannelAnalyzer from './pages/ChannelAnalyzer';

export default function App() {
  return (
    <AppProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/leads" element={<LeadFinder />} />
          <Route path="/analyzer" element={<ChannelAnalyzer />} />
          <Route path="/pitch/:leadId?" element={<PitchGenerator />} />
          <Route path="/email" element={<EmailSender />} />
          <Route path="/crm" element={<CRM />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AppProvider>
  );
}
