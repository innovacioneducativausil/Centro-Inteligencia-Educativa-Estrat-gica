import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { BRAND_COLORS, THEMES } from './constants';
import { logActividad } from './services/actividadService';

type PendingNotif = { uuid: string; tipo: 'senal' | 'tendencia' | 'escenario' } | null;
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_USER_MODULES = ['inicio', 'radar', 'empleabilidad', 'impactos', 'curricular', 'mercadoLaboral'];

const defaultModulesFor = (authUser?: AuthUser | null) => [
  ...DEFAULT_USER_MODULES,
  ...(authUser?.rol === 'admin' ? ['informes', 'gestion'] : []),
];

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
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);

    fetch('/api/auth/me', { credentials: 'include', signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => {
        window.clearTimeout(timeout);
        setAuthLoading(false);
      });

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const handleLogin = (userData: AuthUser) => {
    setUser(userData);
    setActiveView('inicio');

  };

  const handleLogout = useCallback((reason: 'manual' | 'inactivity' = 'manual') => {

    logActividad(reason === 'inactivity' ? 'logout_inactividad' : 'logout');
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    localStorage.removeItem('radar_token');
    setUser(null);
    setActiveView('inicio');
  }, []);

  useEffect(() => {
    if (!user) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => handleLogout('inactivity'), INACTIVITY_TIMEOUT_MS);
    };
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    resetTimer();
    activityEvents.forEach(eventName => {
      window.addEventListener(eventName, resetTimer, { passive: true });
    });

    return () => {
      window.clearTimeout(timeoutId);
      activityEvents.forEach(eventName => window.removeEventListener(eventName, resetTimer));
    };
  }, [user, handleLogout]);

  const canView = useCallback((view: string) => {
    if (!user) return false;
    const allowed = user.modulosPermitidos?.length ? user.modulosPermitidos : defaultModulesFor(user);
    return allowed.includes(view);
  }, [user]);

  const handleNavigate = (view: string) => {

    if (view === 'gestion' && user?.rol !== 'admin') return;
    if (!canView(view)) return;
    setActiveView(view);
    logActividad('nav_modulo', { modulo: view });
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

    if ((activeView === 'gestion' && user?.rol !== 'admin') || !canView(activeView)) {
      return <Dashboard themeColors={themeColors} setActiveView={handleNavigate} setRadarTab={setRadarTab} theme={theme} />;
    }
    switch (activeView) {
      case 'inicio':
        return <Dashboard themeColors={themeColors} setActiveView={handleNavigate} setRadarTab={setRadarTab} theme={theme} />;
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
        return <Dashboard themeColors={themeColors} setActiveView={handleNavigate} setRadarTab={setRadarTab} theme={theme} />;
    }
  };

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.active} 54%, ${BRAND_COLORS.button} 100%)`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 999,
              border: `2px solid ${BRAND_COLORS.button}`,
              borderTopColor: 'transparent',
              animation: 'kf-spin-slow 0.8s linear infinite',
            }}
          />
          <p style={{ margin: 0, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: 'rgba(255,255,255,0.3)' }}>
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
      setActiveView={handleNavigate}
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
