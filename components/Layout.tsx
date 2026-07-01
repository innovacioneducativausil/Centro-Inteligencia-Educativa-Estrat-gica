import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Home, TrendingUp, Briefcase, Bell, Sun, Moon, LogOut, User, Layers, FileText, Settings2, BookOpen, BarChart3 } from 'lucide-react';
import { ThemeColors } from '../types';
import { AuthUser } from './LoginView';
import { BRAND_COLORS } from '../constants';

interface LayoutProps {
  activeView: string;
  setActiveView: (view: string) => void;
  radarTab: 'señales' | 'tendencias' | 'escenarios';
  setRadarTab: (tab: 'señales' | 'tendencias' | 'escenarios') => void;
  theme: 'light' | 'dark';
  themeColors: ThemeColors;
  toggleTheme: () => void;
  children: React.ReactNode;
  user: AuthUser;
  onLogout: () => void;
  onNotifClick: (notif: { id: string; tipo: string }) => void;
}


const NAV = {
  bg:       BRAND_COLORS.primary,
  active:   'rgba(87,196,221,0.20)',
  hover:    'rgba(255,255,255,0.06)',
  iconOn:   BRAND_COLORS.button,
  iconOff:  'rgba(255,255,255,0.45)',
  labelOn:  BRAND_COLORS.button,
  labelOff: 'rgba(255,255,255,0.35)',
};

const Layout: React.FC<LayoutProps> = ({
  activeView, setActiveView,
  setRadarTab,
  theme, themeColors, toggleTheme,
  children, user, onLogout, onNotifClick,
}) => {
  const [profileOpen, setProfileOpen] = useState(false);
  const [bellOpen,    setBellOpen]    = useState(false);
  const [notifs, setNotifs] = useState<{ id: string; titulo: string; tipo: string; id_estado: number; fecha_publicacion: string | null; fecha_creacion: string }[]>([]);
  const [notifsLoaded, setNotifsLoaded] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`radar_seen_${user.correo}`);
      return new Set(stored ? JSON.parse(stored) : []);
    } catch { return new Set(); }
  });
  const bellRef    = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const isAdmin = user.rol === 'admin';


  useEffect(() => {
    fetch('/api/admin/notificaciones', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { setNotifs(j.data || []); setNotifsLoaded(true); })
      .catch(() => {});
  }, []);


  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current    && !bellRef.current.contains(e.target as Node))    setBellOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleBell = async () => {
    const nextOpen = !bellOpen;
    setBellOpen(nextOpen);
    if (nextOpen) {
      try {
        const res = await fetch('/api/admin/notificaciones', { credentials: 'include' });
        if (res.ok) { const j = await res.json(); setNotifs(j.data || []); setNotifsLoaded(true); }
      } catch {}
    }
  };


  const publishedNotifs = useMemo(() =>
    notifs
      .filter(n => n.id_estado === 1 && n.fecha_publicacion)
      .sort((a, b) => new Date(b.fecha_publicacion!).getTime() - new Date(a.fecha_publicacion!).getTime()),
    [notifs]
  );

  const unreadCount = useMemo(() =>
    publishedNotifs.filter(n => !seenIds.has(n.id)).length,
    [publishedNotifs, seenIds]
  );

  const markSeen = (id: string) => {
    setSeenIds(prev => {
      const next = new Set(prev).add(id);
      try { localStorage.setItem(`radar_seen_${user.correo}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const markAllSeen = () => {
    setSeenIds(prev => {
      const next = new Set(prev);
      publishedNotifs.forEach(n => next.add(n.id));
      try { localStorage.setItem(`radar_seen_${user.correo}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const tipoColor = (t: string) => t === 'senal' ? BRAND_COLORS.turquoise : t === 'tendencia' ? BRAND_COLORS.active : BRAND_COLORS.purple;
  const tipoLabel = (t: string) => t === 'senal' ? 'Señal' : t === 'tendencia' ? 'Tendencia' : 'Escenario';
  const fmtDate   = (d: string | null) => d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : '';

  const NEW_BADGE_KEYS = new Set(['curricular', 'mercadoLaboral']);
  const defaultModules = [
    'inicio',
    'radar',
    'empleabilidad',
    'impactos',
    'curricular',
    'mercadoLaboral',
    ...(isAdmin ? ['informes', 'gestion'] : []),
  ];
  const allowedModules = new Set(user.modulosPermitidos?.length ? user.modulosPermitidos : defaultModules);

  const navItems = [
    { key: 'inicio', label: 'Inicio', icon: Home, short: 'Inicio' },
    { key: 'radar', label: 'Radar', icon: TrendingUp, short: 'Radar' },
    { key: 'empleabilidad', label: 'Empleabilidad', icon: Briefcase, short: 'Empleo' },
    { key: 'curricular', label: 'Curricular', icon: BookOpen, short: 'Curricular' },
    { key: 'mercadoLaboral', label: 'Mercado Laboral', icon: BarChart3, short: 'Mercado' },
    ...(isAdmin ? [
      { key: 'informes', label: 'Informes', icon: FileText, short: 'Informes' },
    ] : []),
    ...(isAdmin ? [{ name: 'Gestión', icon: Settings2, short: 'Gestión' }] : []),
  ].filter(item => allowedModules.has(('key' in item ? item.key : 'gestion') as string));

  const fontStyle = { fontFamily: "'Montserrat', system-ui, -apple-system, sans-serif" };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', ...fontStyle }}>


      <nav style={{ width: 72, minWidth: 72, background: NAV.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 4, zIndex: 60, flexShrink: 0 }}>


        <div
          title="USIL Radar Prospectivo"
          style={{ width: 40, height: 40, borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 18px rgba(0,0,0,0.22)', marginBottom: 16, flexShrink: 0, cursor: 'default' }}
        >
          <img
            src="/Usil.jpg"
            alt="USIL"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>


        {navItems.map(item => {
          const navKey = ('key' in item ? item.key : 'gestion') as string;
          const navLabel = 'label' in item ? item.label : 'Gestión';
          const navShort = navKey === 'gestion' ? 'Gestión' : item.short;
          const active = activeView === navKey;
          return (
            <button
              key={navKey}
              title={navLabel}
              onClick={() => { setActiveView(navKey); if (navKey === 'radar') setRadarTab('señales'); }}
              style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', border: 'none', background: active ? NAV.active : 'none', transition: 'background .18s', position: 'relative' }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = NAV.hover; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
            >
              <item.icon style={{ width: 18, height: 18, color: active ? NAV.iconOn : NAV.iconOff, transition: 'color .18s' }} strokeWidth={1.8} />
              <span style={{ fontSize: 8, fontWeight: 600, color: active ? NAV.labelOn : NAV.labelOff, letterSpacing: '0.2px', transition: 'color .18s' }}>
                {navShort}
              </span>
              {NEW_BADGE_KEYS.has(navKey) && (
                <span style={{
                  position: 'absolute', top: 2, right: 2,
                  background: `linear-gradient(135deg,${BRAND_COLORS.warning},${BRAND_COLORS.orange})`,
                  color: '#fff', fontSize: 6, fontWeight: 800,
                  padding: '1.5px 4px', borderRadius: 5,
                  letterSpacing: '0.3px', lineHeight: 1.4,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                  pointerEvents: 'none',
                }}>
                  ¡Nuevo!
                </span>
              )}
            </button>
          );
        })}

        <div style={{ flex: 1 }} />


        <button
          title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          onClick={toggleTheme}
          style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 4 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = NAV.hover; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >
          {theme === 'dark'
            ? <Sun  style={{ width: 15, height: 15, color: '#fbbf24' }} strokeWidth={2} />
            : <Moon style={{ width: 15, height: 15, color: 'rgba(255,255,255,0.55)' }} strokeWidth={2} />
          }
        </button>


        <div ref={bellRef} style={{ position: 'relative' }}>
          <button
            title="Notificaciones"
            onClick={toggleBell}
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: bellOpen ? 'rgba(255,255,255,0.1)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', transition: 'background .15s', marginBottom: 4 }}
            onMouseEnter={e => { if (!bellOpen) (e.currentTarget as HTMLButtonElement).style.background = NAV.hover; }}
            onMouseLeave={e => { if (!bellOpen) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <Bell style={{ width: 15, height: 15, color: 'rgba(255,255,255,0.6)' }} strokeWidth={2} />
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: 3, right: 3, minWidth: 14, height: 14, background: BRAND_COLORS.accent, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: 'white', padding: '0 3px', border: '1.5px solid ' + NAV.bg, lineHeight: 1 }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>


          {bellOpen && (
            <div style={{ position: 'absolute', left: 'calc(100% + 10px)', bottom: 0, width: 290, borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: theme === 'dark' ? '#1e293b' : 'white', border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,42,63,0.1)'}`, zIndex: 100, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,42,63,0.06)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: theme === 'dark' ? '#e2e8f0' : BRAND_COLORS.primary }}>Actividad reciente</span>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllSeen}
                    style={{ fontSize: 10, color: BRAND_COLORS.active, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, fontFamily: 'inherit' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.textDecoration = 'underline'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.textDecoration = 'none'; }}
                  >
                    Marcar todas como leídas
                  </button>
                )}
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {publishedNotifs.length === 0 ? (
                  <p style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: BRAND_COLORS.body }}>No hay actividad reciente</p>
                ) : publishedNotifs.map(n => {
                  const unread = !seenIds.has(n.id);
                  return (
                    <div
                      key={`${n.tipo}-${n.id}`}
                      onClick={() => { markSeen(n.id); onNotifClick({ id: n.id, tipo: n.tipo }); setBellOpen(false); }}
                      style={{ padding: '10px 16px', borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.05)' : BRAND_COLORS.border}`, cursor: 'pointer', borderLeft: unread ? `3px solid ${BRAND_COLORS.button}` : '3px solid transparent', background: unread ? (theme === 'dark' ? 'rgba(87,196,221,0.08)' : 'rgba(87,196,221,0.10)') : 'transparent', transition: 'background .15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = theme === 'dark' ? 'rgba(255,255,255,0.05)' : BRAND_COLORS.surface; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = unread ? (theme === 'dark' ? 'rgba(87,196,221,0.08)' : 'rgba(87,196,221,0.10)') : 'transparent'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: tipoColor(n.tipo), color: 'white' }}>{tipoLabel(n.tipo)}</span>
                        <span style={{ fontSize: 9, color: BRAND_COLORS.body, marginLeft: 'auto' }}>{fmtDate(n.fecha_publicacion)}</span>
                      </div>
                      <p style={{ fontSize: 11, fontWeight: unread ? 600 : 500, color: theme === 'dark' ? '#cbd5e1' : '#1e293b', lineHeight: 1.4 }}>{n.titulo}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>


        <div ref={profileRef} style={{ position: 'relative', marginBottom: 4 }}>
          <button
            title={user.nombre}
            onClick={() => setProfileOpen(!profileOpen)}
            style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${BRAND_COLORS.active},${BRAND_COLORS.primary})`, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', cursor: 'pointer' }}
          >
            {user.iniciales}
          </button>


          {profileOpen && (
            <div style={{ position: 'absolute', left: 'calc(100% + 10px)', bottom: 0, width: 220, borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', background: 'white', border: '1px solid rgba(15,42,63,0.08)', zIndex: 100, padding: 8, overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px 8px' }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: BRAND_COLORS.primary, marginBottom: 2 }}>{user.nombre}</p>
                <p style={{ fontSize: 10, color: '#94A3B8', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.correo}</p>
                <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', padding: '3px 8px', borderRadius: 100, background: 'rgba(87,196,221,0.16)', color: BRAND_COLORS.active }}>{user.rolLabel}</span>
              </div>
              <div style={{ height: 1, background: 'rgba(15,42,63,0.06)', margin: '6px 8px' }} />
              <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569', fontFamily: 'inherit' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <User style={{ width: 14, height: 14, color: '#94A3B8' }} />
                Mi Perfil
              </button>
              <div style={{ height: 1, background: 'rgba(15,42,63,0.06)', margin: '4px 8px' }} />
              <button
                onClick={() => { setProfileOpen(false); onLogout(); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#ef4444', fontFamily: 'inherit' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff0f0'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <LogOut style={{ width: 14, height: 14 }} />
                Cerrar Sesión
              </button>
            </div>
          )}
        </div>
      </nav>


      <main

        className={`${themeColors.bg} ${themeColors.text}`}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: activeView === 'radar' ? 'hidden' : 'auto' }}
        onClick={() => { if (profileOpen) setProfileOpen(false); if (bellOpen) setBellOpen(false); }}
      >
        {children}
      </main>
    </div>
  );
};

export default Layout;
