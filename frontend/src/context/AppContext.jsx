import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [dashboardStats, setDashboardStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [settings, setSettings] = useState({});
  const [emailStats, setEmailStats] = useState(null);
  const [loadingDash, setLoadingDash] = useState(true);

  const refreshDashboard = useCallback(async () => {
    try {
      const [dashRes, actRes, emailRes] = await Promise.all([
        api.get('/analytics/dashboard'),
        api.get('/scraper/activities?limit=20'),
        api.get('/emails/stats'),
      ]);
      const d = dashRes.data;
      setDashboardStats({ ...d.stats, charts: d.charts, stage_distribution: d.stage_distribution });
      setActivities(actRes.data.activities || []);
      setEmailStats(emailRes.data);
    } catch (e) {
      console.error('Dashboard refresh error:', e.message);
    } finally {
      setLoadingDash(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api.get('/settings');
      setSettings(res.data.settings || {});
    } catch (e) {
      // 403 is expected for non-admin users — settings table is admin-only
      if (e.response?.status !== 403) {
        console.error('Settings load error:', e.message);
      }
    }
  }, []);

  const saveSettings = useCallback(async (updates) => {
    await api.put('/settings', updates);
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  useEffect(() => {
    refreshDashboard();
    loadSettings();

    // Refresh dashboard every 30 seconds
    const interval = setInterval(refreshDashboard, 30000);
    return () => clearInterval(interval);
  }, [refreshDashboard, loadSettings]);

  return (
    <AppContext.Provider value={{
      dashboardStats,
      activities,
      settings,
      emailStats,
      loadingDash,
      refreshDashboard,
      loadSettings,
      saveSettings,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
