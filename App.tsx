import React, { useEffect, useMemo, useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import RadarView from './components/RadarView';
import EmpleabilidadView from './components/EmpleabilidadView';
import CurricularView from './components/CurricularView';
import MercadoLaboralView from './components/MercadoLaboralView';
import ImpactosView from './components/ImpactosView';
import ReportsView from './components/ReportsView';
import GestionView from './components/GestionView';
import LoginView, { AuthUser } from './components/LoginView';
import { THEMES } from './constants';

type PendingNotif = { uuid: string; tipo: 'senal' | 'tendencia' | 'escenario' } | null;

const App: React.FC = () => {
  const [activeView, setActiveView] = useState('inicio');
  const [radarTab, setRadarTab] = useState<any>('señales');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [pendingNotif, setPendingNotif] = useState<PendingNotif>(null);

  const themeColors = useMemo(() => THEMES[theme], [theme]);
  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogin = (userData: AuthUser) => {
    setUser(userData);
    setActiveView('inicio');
  };

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    setUser(null);
  };

  const handleNotifClick = (notif: { id: string; tipo: string }) => {
    const tabMap: Record<string, 'señales' | 'tendencias' | 'escenarios'> = {
      senal: 'señales', tendencia: 'tendencias', escenario: 'escenarios',
    };
    setRadarTab(tabMap[notif.tipo] ?? 'señales');
    setActiveView('radar');
    setPendingNotif({ uuid: notif.id, tipo: notif.tipo as PendingNotif['tipo'] });
  };

  const renderView = () => {
    switch (activeView) {
      case 'inicio':
        return <Dashboard themeColors={themeColors} setActiveView={setActiveView} setRadarTab={setRadarTab} theme={theme} />;
      case 'radar':
        return <RadarView themeColors={themeColors} activeTabProp={radarTab} setRadarTab={setRadarTab} pendingNotif={pendingNotif} onPendingNotifConsumed={() => setPendingNotif(null)} />;
      case 'empleabilidad':
        return <EmpleabilidadView themeColors={themeColors} userRole={user?.rol} />;
      case 'curricular':
        return <CurricularView themeColors={themeColors} userRole={user?.rol} />;
      case 'mercadoLaboral':
        return <MercadoLaboralView themeColors={themeColors} />;
      case 'impactos':
        return <ImpactosView themeColors={themeColors} />;
      case 'informes':
        return <ReportsView themeColors={themeColors} />;
      case 'gestion':
        return <GestionView themeColors={themeColors} user={user!} />;
      default:
        return <Dashboard themeColors={themeColors} setActiveView={setActiveView} setRadarTab={setRadarTab} theme={theme} />;
    }
  };

  if (authLoading) {
    return (
      <div
        className="min-h-screen w-full flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0b1e20 0%, #0f2a2d 40%, #14363a 100%)' }}
      >
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-full border-2 border-[#2A9D8F] border-t-transparent animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">
            Verificando sesión...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <Layout
      activeView={activeView}
      setActiveView={setActiveView}
      radarTab={radarTab}
      setRadarTab={setRadarTab}
      theme={theme}
      themeColors={themeColors}
      toggleTheme={toggleTheme}
      user={user}
      onLogout={handleLogout}
      onNotifClick={handleNotifClick}
    >
      {renderView()}
    </Layout>
  );
};

export default App;
