import React, { useState, useEffect, useRef } from 'react';
import { Home, TrendingUp, Briefcase, Bell, Sun, Moon, LogOut, User, Layers, FileText, Settings2, BookOpen, BarChart3 } from 'lucide-react';
import { ThemeColors } from '../types';
import { AuthUser } from './LoginView';

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
}

// â”€â”€ Color palette (matches HTML design)
const NAV = {
  bg:       '#0F2A3F',
  active:   'rgba(13,148,136,0.18)',
  hover:    'rgba(255,255,255,0.06)',
  iconOn:   '#14B8A6',
  iconOff:  'rgba(255,255,255,0.45)',
  labelOn:  '#14B8A6',
  labelOff: 'rgba(255,255,255,0.35)',
};

const Layout: React.FC<LayoutProps> = ({
  activeView, setActiveView,
  setRadarTab,
  theme, themeColors, toggleTheme,
  children, user, onLogout,
}) => {
  const [profileOpen, setProfileOpen] = useState(false);
  const [bellOpen,    setBellOpen]    = useState(false);
  const [notifs, setNotifs] = useState<{ id: string; titulo: string; tipo: string; id_estado: number; fecha_publicacion: string | null; fecha_creacion: string }[]>([]);
  const [notifsLoaded, setNotifsLoaded] = useState(false);
  const bellRef    = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const isAdmin = user.rol === 'admin' || user.rol === 'analista';

  // Close dropdowns on outside click
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
      } catch { /* silencioso */ }
    }
  };

  const tipoColor  = (t: string) => t === 'senal' ? '#0D9488' : t === 'tendencia' ? '#3b82f6' : '#a855f7';
  const tipoLabel  = (t: string) => t === 'senal' ? 'Señal' : t === 'tendencia' ? 'Tendencia' : 'Escenario';
  const estadoLabel = (e: number) => e === 1 ? 'Publicado' : e === 2 ? 'Revisión' : e === 3 ? 'Archivado' : 'Borrador';
  const estadoColor = (e: number) => e === 1 ? '#10b981' : e === 2 ? '#f59e0b' : e === 3 ? '#94a3b8' : '#64748b';
  const fmtDate    = (d: string | null) => d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : '';

  const navItems = [
    { key: 'inicio', label: 'Inicio', icon: Home, short: 'Inicio' },
    { key: 'radar', label: 'Radar', icon: TrendingUp, short: 'Radar' },
    { key: 'empleabilidad', label: 'Empleabilidad', icon: Briefcase, short: 'Empleo' },
    { key: 'curricular', label: 'Curricular', icon: BookOpen, short: 'Curricular' },
    { key: 'mercadoLaboral', label: 'Mercado Laboral', icon: BarChart3, short: 'Mercado' },
    ...(!isAdmin ? [
      { key: 'impactos', label: 'Impactos', icon: Layers, short: 'Impactos' },
      { key: 'informes', label: 'Informes', icon: FileText, short: 'Informes' },
    ] : []),
    ...(isAdmin ? [{ name: 'Gestión', icon: Settings2, short: 'Gestión' }] : []),
  ];

  const fontStyle = { fontFamily: "'Space Grotesk', 'Inter', sans-serif" };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', ...fontStyle }}>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          ICON NAV — compact left bar
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <nav style={{ width: 72, minWidth: 72, background: NAV.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 4, zIndex: 60, flexShrink: 0 }}>

        {/* Logo */}
        <div
          title="USIL Radar Prospectivo"
          style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#0D9488,#14B8A6)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, flexShrink: 0, cursor: 'default' }}
        >
          <TrendingUp style={{ width: 18, height: 18, color: 'white' }} strokeWidth={2.5} />
        </div>

        {/* Nav buttons */}
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
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* Theme toggle */}
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

        {/* Bell */}
        <div ref={bellRef} style={{ position: 'relative' }}>
          <button
            title="Notificaciones"
            onClick={toggleBell}
            style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: bellOpen ? 'rgba(255,255,255,0.1)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', transition: 'background .15s', marginBottom: 4 }}
            onMouseEnter={e => { if (!bellOpen) (e.currentTarget as HTMLButtonElement).style.background = NAV.hover; }}
            onMouseLeave={e => { if (!bellOpen) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <Bell style={{ width: 15, height: 15, color: 'rgba(255,255,255,0.6)' }} strokeWidth={2} />
            {notifs.length > 0 && (
              <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, background: '#E76F51', borderRadius: '50%', border: '1.5px solid ' + NAV.bg }} />
            )}
          </button>

          {/* Bell dropdown */}
          {bellOpen && (
            <div style={{ position: 'absolute', left: 'calc(100% + 10px)', bottom: 0, width: 290, borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', background: theme === 'dark' ? '#1e293b' : 'white', border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,42,63,0.1)'}`, zIndex: 100, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,42,63,0.06)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: theme === 'dark' ? '#e2e8f0' : '#0F2A3F' }}>Actividad reciente</span>
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>Solo publicados</span>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {notifs.length === 0 ? (
                  <p style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>No hay actividad reciente</p>
                ) : notifs.map(n => (
                  <div key={`${n.tipo}-${n.id}`} style={{ padding: '10px 16px', borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: tipoColor(n.tipo), color: 'white' }}>{tipoLabel(n.tipo)}</span>
                      <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 100, background: estadoColor(n.id_estado) + '22', color: estadoColor(n.id_estado) }}>{estadoLabel(n.id_estado)}</span>
                      <span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 'auto' }}>{fmtDate(n.fecha_creacion)}</span>
                    </div>
                    <p style={{ fontSize: 11, fontWeight: 500, color: theme === 'dark' ? '#cbd5e1' : '#1e293b', lineHeight: 1.4 }}>{n.titulo}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User avatar */}
        <div ref={profileRef} style={{ position: 'relative', marginBottom: 4 }}>
          <button
            title={user.nombre}
            onClick={() => setProfileOpen(!profileOpen)}
            style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#0D9488,#1E3A52)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', cursor: 'pointer' }}
          >
            {user.iniciales}
          </button>

          {/* Profile dropdown */}
          {profileOpen && (
            <div style={{ position: 'absolute', left: 'calc(100% + 10px)', bottom: 0, width: 220, borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', background: 'white', border: '1px solid rgba(15,42,63,0.08)', zIndex: 100, padding: 8, overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px 8px' }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#0F2A3F', marginBottom: 2 }}>{user.nombre}</p>
                <p style={{ fontSize: 10, color: '#94A3B8', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.correo}</p>
                <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', padding: '3px 8px', borderRadius: 100, background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>{user.rolLabel}</span>
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

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          MAIN CONTENT — full height, no wrapper header
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <main
        // Only Radar manages its own internal scroll; all others scroll normally
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

