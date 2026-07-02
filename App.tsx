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
const INACTIVITY_WARNING_MS = 60 * 1000;
const VALID_VIEWS = new Set(['inicio', 'radar', 'empleabilidad', 'impactos', 'curricular', 'mercadoLaboral', 'informes', 'gestion']);

const defaultModulesFor = (authUser?: AuthUser | null) => [
  ...DEFAULT_USER_MODULES,
  ...(authUser?.rol === 'admin' ? ['informes', 'gestion'] : []),
];

function getClickLabel(el: HTMLElement) {
  const explicit = el.getAttribute('aria-label') || el.getAttribute('title');
  if (explicit?.trim()) return explicit.replace(/\s+/g, ' ').trim();
  const readText = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (!(node instanceof HTMLElement)) return '';
    const className = node.className || '';
    const isIcon = node.tagName.toLowerCase() === 'svg'
      || node.getAttribute('aria-hidden') === 'true'
      || String(className).includes('material-symbol')
      || String(className).includes('material-icons')
      || String(className).includes('lucide');
    if (isIcon) return '';
    return Array.from(node.childNodes).map(readText).join(' ');
  };
  return cleanAuditLabel(readText(el));
}

function cleanAuditLabel(value: string) {
  const raw = value.replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const iconToken = raw.match(/^([a-z][a-z0-9_]{2,})(?=[A-ZÁÉÍÓÚÑ])/);
  if (iconToken) return raw.slice(iconToken[1].length).replace(/^[\s_-]+/, '').trim();
  return raw;
}

const App: React.FC = () => {
  const [activeView, setActiveView] = useState(() => {
    const stored = localStorage.getItem('radar_active_view');
    return stored && VALID_VIEWS.has(stored) ? stored : 'inicio';
  });
  const [radarTab, setRadarTab] = useState<any>('señales');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [pendingNotif, setPendingNotif] = useState<PendingNotif>(null);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [inactivityWarning, setInactivityWarning] = useState(false);

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
    setSessionMessage(null);
    const stored = localStorage.getItem('radar_active_view');
    setActiveView(stored && VALID_VIEWS.has(stored) ? stored : 'inicio');

  };

  const handleLogout = useCallback((reason: 'manual' | 'inactivity' = 'manual') => {

    logActividad(reason === 'inactivity' ? 'logout_inactividad' : 'logout');
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    localStorage.removeItem('radar_token');
    if (reason === 'inactivity') {
      setSessionMessage('Tu sesion se cerro por inactividad. Vuelve a iniciar sesion para continuar.');
    }
    setUser(null);
    setActiveView('inicio');
  }, []);

  useEffect(() => {
    if (!user) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let warningId: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      setInactivityWarning(false);
      window.clearTimeout(warningId);
      window.clearTimeout(timeoutId);
      warningId = window.setTimeout(() => setInactivityWarning(true), Math.max(0, INACTIVITY_TIMEOUT_MS - INACTIVITY_WARNING_MS));
      timeoutId = window.setTimeout(() => handleLogout('inactivity'), INACTIVITY_TIMEOUT_MS);
    };
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    resetTimer();
    activityEvents.forEach(eventName => {
      window.addEventListener(eventName, resetTimer, { passive: true });
    });

    return () => {
      window.clearTimeout(warningId);
      window.clearTimeout(timeoutId);
      activityEvents.forEach(eventName => window.removeEventListener(eventName, resetTimer));
    };
  }, [user, handleLogout]);

  useEffect(() => {
    if (user && VALID_VIEWS.has(activeView)) {
      localStorage.setItem('radar_active_view', activeView);
    }
  }, [user, activeView]);

  useEffect(() => {
    if (!user) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const el = target?.closest('button, a, [role="button"]') as HTMLElement | null;
      if (!el) return;
      const label = getClickLabel(el);
      if (!label) return;
      logActividad('ui_click', {
        accion: 'click',
        modulo: activeView,
        vista: activeView,
        elementoTipo: el.tagName.toLowerCase() === 'a' ? 'enlace' : 'boton',
        elementoTitulo: label.slice(0, 180),
        detalle: `Modulo ${activeView} | Vista ${activeView} | Click: ${label.slice(0, 180)}`,
        metadata: {
          vista: activeView,
          etiqueta: label.slice(0, 180),
          href: el instanceof HTMLAnchorElement ? el.href : undefined,
        },
      });
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [user, activeView]);

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
    return (
      <>
        {sessionMessage && (
          <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 2000, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 12, padding: '10px 16px', fontSize: 13, fontWeight: 800, boxShadow: '0 12px 30px rgba(15,23,42,0.12)' }}>
            {sessionMessage}
          </div>
        )}
        <LoginView onLogin={handleLogin} />
      </>
    );
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
      {inactivityWarning && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 2000, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 12, padding: '10px 14px', fontSize: 12, fontWeight: 800, boxShadow: '0 12px 30px rgba(15,23,42,0.12)' }}>
          Tu sesion se cerrara pronto por inactividad.
        </div>
      )}
      {renderView()}
    </Layout>
  );
};

export default App;
