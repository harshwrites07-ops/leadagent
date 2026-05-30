/* global React, ReactDOM, Sidebar, Topbar, SystemBar, Agent,
   DashboardScreen, FinderScreen, AnalyzerScreen, PitchScreen, SenderScreen,
   InboxScreen, CrmScreen, AnalyticsScreen, SettingsScreen, OnboardingOverlay */
const { useState: useStateApp, useEffect: useEffectApp } = React;

const ROUTES = {
  dashboard: { crumbs: ['Dashboard'],                                     bleed: false, label: '01 Dashboard' },
  finder:    { crumbs: ['Outreach', 'Lead Finder'],                       bleed: false, label: '02 Lead Finder' },
  analyzer:  { crumbs: ['Outreach', 'Channel Analyzer', '@MarketMavenJay'],bleed: false, label: '03 Channel Analyzer' },
  pitch:     { crumbs: ['Outreach', 'Pitch Gen'],                         bleed: false, label: '04 Pitch Gen' },
  sender:    { crumbs: ['Outreach', 'Email Sender'],                      bleed: false, label: '05 Email Sender' },
  crm:       { crumbs: ['CRM'],                                            bleed: true,  label: '06 CRM' },
  analytics: { crumbs: ['Analytics'],                                      bleed: false, label: '07 Analytics' },
  settings:  { crumbs: ['Settings'],                                       bleed: false, label: '08 Settings' },
};

const App = () => {
  const [route, setRoute] = useStateApp('dashboard');
  const [showOnb, setShowOnb] = useStateApp(false);
  const [agentOpen, setAgentOpen] = useStateApp(false);

  // ⌘K / Ctrl+K toggle agent
  useEffectApp(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAgentOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const meta = ROUTES[route] || ROUTES.dashboard;

  const screen = (() => {
    switch (route) {
      case 'dashboard': return <DashboardScreen openAgent={() => setAgentOpen(true)} goCrm={() => setRoute('crm')} goSender={() => setRoute('sender')} />;
      case 'finder':    return <FinderScreen goAnalyzer={() => setRoute('analyzer')} />;
      case 'analyzer':  return <AnalyzerScreen goPitch={() => setRoute('pitch')} />;
      case 'pitch':     return <PitchScreen goSender={() => setRoute('sender')} />;
      case 'sender':    return <SenderScreen />;
      case 'crm':       return <CrmScreen />;
      case 'analytics': return <AnalyticsScreen />;
      case 'settings':  return <SettingsScreen />;
      default:          return <DashboardScreen openAgent={() => setAgentOpen(true)} />;
    }
  })();

  return (
    <div className={`app ${agentOpen ? 'agent-open' : ''}`} data-screen-label={meta.label}>
      <Sidebar route={route} setRoute={setRoute} openAgent={() => setAgentOpen(true)} />
      <main className="main">
        <Topbar
          crumbs={meta.crumbs}
          actions={
            <>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowOnb(true)}>Onboarding</button>
              <button className="btn btn--sm" onClick={() => setAgentOpen(true)}>
                <Icon name="sparkle" size={11}/>Agent <kbd style={{fontFamily:'var(--f-mono)', fontSize:10, padding:'0 4px', borderRadius:3, background:'var(--bg-2)', border:'1px solid var(--line)', marginLeft:2}}>⌘K</kbd>
              </button>
            </>
          }
        />
        <div style={{flex: 1, minHeight: 0}}>
          {screen}
        </div>
      </main>

      <Agent open={agentOpen} onClose={() => setAgentOpen(false)} />
      <SystemBar openAgent={() => setAgentOpen(true)} />

      {showOnb && <OnboardingOverlay onClose={() => setShowOnb(false)} />}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
