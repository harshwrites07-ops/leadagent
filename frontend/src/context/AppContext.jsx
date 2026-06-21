import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [dashboardStats, setDashboardStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [settings, setSettings] = useState({});
  const [emailStats, setEmailStats] = useState(null);
  const [loadingDash, setLoadingDash] = useState(true);

  // Lead Finder background state
  const [powerModeRunning, setPowerModeRunning] = useState(false);
  const [powerModeNiches, setPowerModeNiches] = useState([]);
  const [powerModeFeed, setPowerModeFeed] = useState([]);
  const [powerModeLeadsFound, setPowerModeLeadsFound] = useState(0);
  const [powerModeJobId, setPowerModeJobId] = useState(null);

  // Pitch Generator background state
  const [pitchJobRunning, setPitchJobRunning] = useState(false);
  const [pitchJobProgress, setPitchJobProgress] = useState(0);
  const [pitchJobTotal, setPitchJobTotal] = useState(0);
  const [pitchJobResults, setPitchJobResults] = useState([]);
  const [pitchJobLeadId, setPitchJobLeadId] = useState(null);

  // Global background task notifications
  const [backgroundTasks, setBackgroundTasks] = useState([]);
  const addBackgroundTask = (task) => setBackgroundTasks(prev => [...prev.filter(t => t.id !== task.id), task]);
  const removeBackgroundTask = (taskId) => setBackgroundTasks(prev => prev.filter(t => t.id !== taskId));

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
      const [adminRes, meRes] = await Promise.allSettled([
        api.get('/settings'),
        api.get('/settings/me'),
      ]);
      const adminSettings = adminRes.status === 'fulfilled' ? (adminRes.value.data.settings || {}) : {};
      const meData = meRes.status === 'fulfilled' ? meRes.value.data : {};
      setSettings({ ...adminSettings, ...meData.profile, ...meData.preferences, plan: meData.plan });
    } catch (e) {
      console.error('Settings load error:', e.message);
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
      dashboardStats, activities, settings, emailStats, loadingDash,
      refreshDashboard, loadSettings, saveSettings,
      powerModeRunning, setPowerModeRunning,
      powerModeNiches, setPowerModeNiches,
      powerModeFeed, setPowerModeFeed,
      powerModeLeadsFound, setPowerModeLeadsFound,
      powerModeJobId, setPowerModeJobId,
      pitchJobRunning, setPitchJobRunning,
      pitchJobProgress, setPitchJobProgress,
      pitchJobTotal, setPitchJobTotal,
      pitchJobResults, setPitchJobResults,
      pitchJobLeadId, setPitchJobLeadId,
      backgroundTasks, addBackgroundTask, removeBackgroundTask,
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
