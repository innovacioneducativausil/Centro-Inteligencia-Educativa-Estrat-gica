import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { BRAND_COLORS } from '../constants';

export interface AuthUser {
  id: string;
  nombre: string;
  nombreCompleto: string;
  correo: string;
  rol: 'admin' | 'usuario' | 'editor' | 'analista' | 'lector';
  rolLabel: string;
  iniciales: string;
  modulosPermitidos?: string[];
}

interface LoginViewProps {
  onLogin: (user: AuthUser) => void;
}

type View   = 'login' | 'forgot' | 'verify' | 'reset' | 'success';
type OtpContext = 'login' | 'reset';
type Strength = 'weak' | 'medium' | 'strong';

const RADAR_RINGS = [100, 80, 60, 40, 20];

const DATA_POINTS = [
  { top: '20%', left: '30%', opacity: 0.8 },
  { top: '65%', left: '75%', opacity: 0.6 },
  { top: '40%', left: '60%', opacity: 0.9 },
  { top: '80%', left: '45%', opacity: 0.4 },
  { top: '15%', left: '65%', opacity: 0.7 },
];


function getStrength(pwd: string): Strength | null {
  if (!pwd) return null;
  const score = [
    pwd.length >= 8,
    /[A-Z]/.test(pwd),
    /[0-9]/.test(pwd),
    /[^A-Za-z0-9]/.test(pwd),
  ].filter(Boolean).length;
  if (score <= 1) return 'weak';
  if (score <= 2) return 'medium';
  return 'strong';
}

async function postForgotPassword(correo: string) {
  const res  = await fetch('/api/auth/forgot-password', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ correo: correo.trim() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al procesar la solicitud.');
  return data;
}


const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 relative overflow-hidden"
    style={{ boxShadow: '0 16px 40px -10px rgba(0,0,0,0.1)' }}>
    <div className="absolute -right-16 -top-16 pointer-events-none" style={{
      width: 200, height: 200, border: '36px solid #f8fafc', borderRadius: '50%', opacity: 0.5,
    }} />
    {children}
  </div>
);


const RadarPanel: React.FC<{ view: View }> = ({ view }) => {
  const label =
    view === 'login'   ? 'Scanning' :
    view === 'forgot'  ? 'Active'   :
    view === 'verify'  ? 'Verifying':
    view === 'success' ? 'Complete' : 'Updating';

  return (
    <div
      className="relative hidden lg:flex flex-1 items-center justify-center overflow-hidden border-r border-slate-800"
      style={{ backgroundColor: '#101622' }}
    >
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: `radial-gradient(circle, ${BRAND_COLORS.active} 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
      }} />
      <div className="relative" style={{ width: '55vh', height: '55vh', maxWidth: 480, maxHeight: 480 }}>
        {RADAR_RINGS.map((size, i) => (
          <div key={size} className="radar-ring"
            style={{ width: `${size}%`, height: `${size}%`, animationDelay: `${i * 0.8}s` }} />
        ))}
        <div className="absolute top-1/2 left-0 w-full"
          style={{ height: 1, backgroundColor: 'rgba(59,130,246,0.1)' }} />
        <div className="absolute top-0 left-1/2 h-full"
          style={{ width: 1, backgroundColor: 'rgba(59,130,246,0.1)' }} />
        <div className="radar-sweep" />
        {DATA_POINTS.map((p, i) => (
          <div key={i} className="data-point"
            style={{ top: p.top, left: p.left, opacity: p.opacity }} />
        ))}
        <div className="absolute" style={{
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 14, height: 14,
          backgroundColor: BRAND_COLORS.active,
          borderRadius: '50%',
          boxShadow: `0 0 20px ${BRAND_COLORS.active}`,
        }} />
      </div>
      <div className="absolute bottom-8 left-10 font-display">
        <div className="flex items-center gap-3 mb-1">
          <span className="relative flex" style={{ width: 10, height: 10 }}>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ backgroundColor: BRAND_COLORS.active }} />
            <span className="relative inline-flex rounded-full"
              style={{ width: 10, height: 10, backgroundColor: BRAND_COLORS.button }} />
          </span>
          <span style={{ color: '#60a5fa', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            System Status: {label}
          </span>
        </div>
        <div style={{ color: BRAND_COLORS.body, fontSize: 11 }}>LAT: -12.0673 | LONG: -76.9547</div>
      </div>
    </div>
  );
};

const USILHeader: React.FC = () => (
  <div className="flex items-center justify-between mb-5">
    <div className="flex items-center gap-3">
      <img
        src="/Usil.jpg"
        alt="USIL"
        className="h-14 w-14 rounded-xl object-cover shadow-md"
      />
      <div className="flex flex-col">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">USIL</h2>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Universidad San Ignacio de Loyola</span>
      </div>
    </div>
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200"
      style={{ backgroundColor: BRAND_COLORS.surface2 }}>
      <span className="material-symbols-outlined" style={{ color: '#16a34a', fontSize: 17 }}>lock</span>
      <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Secure Platform</span>
    </div>
  </div>
);

const PageFooter: React.FC = () => (
  <div className="mt-4 text-center space-y-2">
    <p className="text-xs font-medium text-slate-400">© 2024 Universidad San Ignacio de Loyola.</p>
    <div className="flex justify-center gap-5 text-xs">
      <a href="https://wa.link/odvsxk" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-700 underline underline-offset-2">Soporte Técnico</a>
      <span className="text-slate-300">|</span>
      <a href="#" className="text-slate-400 hover:text-blue-700 underline underline-offset-2">Política de Privacidad</a>
    </div>
  </div>
);

const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div className="mt-5 text-center">
    <button onClick={onClick}
      className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition-colors hover:underline underline-offset-4"
      onMouseEnter={e => (e.currentTarget.style.color = BRAND_COLORS.active)}
      onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}>
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
      Volver al Inicio de Sesión
    </button>
  </div>
);


const PasswordField: React.FC<{
  id: string; label: string; icon: string;
  value: string; onChange: (v: string) => void;
  show: boolean; onToggle: () => void;
  placeholder?: string;
  autoComplete?: string;
}> = ({ id, label, icon, value, onChange, show, onToggle, placeholder = '••••••••', autoComplete }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-bold text-slate-700" htmlFor={id}>{label}</label>
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
        <span className="material-symbols-outlined transition-colors"
          style={{ color: value ? BRAND_COLORS.active : BRAND_COLORS.body, fontSize: 20 }}>{icon}</span>
      </div>
      <input id={id} type={show ? 'text' : 'password'} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required
        autoComplete={autoComplete}
        className="w-full py-3 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition-all shadow-sm"
        style={{ paddingLeft: 44, paddingRight: 44, backgroundColor: BRAND_COLORS.surface,
          border: `2px solid ${value ? BRAND_COLORS.active : BRAND_COLORS.borderStrong}`, outline: 'none' }}
        onFocus={e => (e.target.style.borderColor = BRAND_COLORS.active)}
        onBlur={e  => (e.target.style.borderColor = value ? BRAND_COLORS.active : BRAND_COLORS.borderStrong)} />
      <button type="button" onClick={onToggle} tabIndex={-1}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-blue-700">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  </div>
);


const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [view, setView] = useState<View>('login');


  const [correo,       setCorreo]       = useState('');
  const [password,     setPassword]     = useState('');
  const [showPass,     setShowPass]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [remember,     setRemember]     = useState(false);
  const [loginError,   setLoginError]   = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);


  const [fpCorreo,  setFpCorreo]  = useState('');
  const [fpLoading, setFpLoading] = useState(false);
  const [fpError,   setFpError]   = useState<string | null>(null);


  const [otpDigits,         setOtpDigits]         = useState<string[]>(['','','','','','']);
  const [otpLoading,        setOtpLoading]        = useState(false);
  const [otpError,          setOtpError]          = useState<string | null>(null);
  const [otpTimer,          setOtpTimer]          = useState(0);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [otpResendLoading,  setOtpResendLoading]  = useState(false);
  const [otpContext,        setOtpContext]        = useState<OtpContext>('reset');
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);


  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass,     setShowNewPass]     = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [resetLoading,    setResetLoading]    = useState(false);
  const [resetError,      setResetError]      = useState<string | null>(null);
  const [resetToken,      setResetToken]      = useState<string>('');


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('reset_token');
    if (!token) return;


    window.history.replaceState({}, '', window.location.pathname);


    (async () => {
      try {
        const res  = await fetch(`/api/auth/verify-reset-token/${token}`);
        const data = await res.json();
        if (data.valid) {
          setResetToken(token);
          setFpCorreo(data.correo ?? '');
          setNewPassword(''); setConfirmPassword(''); setResetError(null);
          setView('reset');
        } else {

          setLoginError(data.error || 'El enlace de recuperación es inválido o ha expirado.');
          setView('login');
        }
      } catch {
        setLoginError('No se pudo validar el enlace de recuperación.');
        setView('login');
      }
    })();

  }, []);


  useEffect(() => {
    if (otpTimer <= 0) return;
    const t = setTimeout(() => setOtpTimer(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [otpTimer]);


  useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const t = setTimeout(() => setOtpResendCooldown(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [otpResendCooldown]);


  const strength = useMemo(() => getStrength(newPassword), [newPassword]);

  const requirements = useMemo(() => [
    { label: 'Mínimo 8 caracteres',     met: newPassword.length >= 8 },
    { label: 'Al menos una mayúscula',  met: /[A-Z]/.test(newPassword) },
    { label: 'Al menos un número',      met: /[0-9]/.test(newPassword) },
  ], [newPassword]);

  const strengthSegments = useMemo(() => {
    if (!strength) return ['', '', ''];
    if (strength === 'weak')   return ['active-weak',   '',              ''];
    if (strength === 'medium') return ['active-medium', 'active-medium', ''];
    return ['active-strong', 'active-strong', 'active-strong'];
  }, [strength]);

  const strengthLabel = strength === 'weak' ? { text: 'Débil',  color: BRAND_COLORS.error }
    : strength === 'medium'                 ? { text: 'Media',  color: BRAND_COLORS.warning }
    : strength === 'strong'                 ? { text: 'Fuerte', color: BRAND_COLORS.success }
    : null;


  const handleCorreoChange = (val: string) => {
    const atIdx = val.indexOf('@');
    if (atIdx === -1) { setCorreo(val); return; }
    const domain = val.slice(atIdx + 1).toLowerCase();
    if (domain === '' || 'usil.edu.pe'.startsWith(domain)) setCorreo(val);
  };

  const dominioInvalido = correo.includes('@')
    && (correo.split('@')[1]?.length ?? 0) > 0
    && !correo.toLowerCase().endsWith('@usil.edu.pe');


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null); setLoginSuccess(null);
    if (!correo.trim().toLowerCase().endsWith('@usil.edu.pe')) {
      setLoginError('Solo se permiten correos institucionales @usil.edu.pe.');
      return;
    }
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ correo: correo.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setLoginError(data.error || 'Error al iniciar sesión.'); return; }
      if (data.requiresOtp) {
        setFpCorreo(data.correo || correo.trim());
        setOtpContext('login');
        setOtpDigits(['','','','','','']);
        setOtpError(null);
        setOtpTimer(300);
        setOtpResendCooldown(60);
        setView('verify');
        setTimeout(() => otpRefs.current[0]?.focus(), 50);
        return;
      }
      if (data.token) localStorage.setItem('radar_token', data.token);
      if (remember) localStorage.setItem('radar_remember', '1');
      onLogin(data.user);
    } catch {
      setLoginError('No se pudo conectar con el servidor. Verifica que la API esté activa.');
    } finally { setLoading(false); }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setFpError(null);
    if (!fpCorreo.trim().toLowerCase().endsWith('@usil.edu.pe')) {
      setFpError('Solo se permiten correos institucionales @usil.edu.pe.');
      return;
    }
    setFpLoading(true);
    try {
      await postForgotPassword(fpCorreo);
      setOtpContext('reset');
      setOtpDigits(['','','','','','']);
      setOtpError(null);
      setOtpTimer(300);
      setOtpResendCooldown(60);
      setView('verify');
    } catch (err: unknown) {
      setFpError(err instanceof Error ? err.message : 'Error al procesar la solicitud.');
    } finally { setFpLoading(false); }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);


    if (newPassword.length < 8) {
      setResetError('La contraseña debe tener mínimo 8 caracteres.'); return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setResetError('La contraseña debe contener al menos una letra mayúscula.'); return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setResetError('La contraseña debe contener al menos un número.'); return;
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      setResetError('La contrasena debe contener al menos un simbolo.'); return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Las contraseñas no coinciden. Por favor verifica.'); return;
    }
    setResetLoading(true);
    try {
      const res  = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setResetError(data.error || 'Error al actualizar la contraseña.'); return; }
      setNewPassword(''); setConfirmPassword(''); setResetToken('');
      setView('success');
    } catch {
      setResetError('No se pudo conectar con el servidor.');
    } finally { setResetLoading(false); }
  };


  const handleOtpChange = (idx: number, val: string) => {
    if (val && !/^[0-9]$/.test(val)) return;
    const next = [...otpDigits]; next[idx] = val; setOtpDigits(next);
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowLeft'  && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = ['','','','','',''];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setOtpDigits(next);
    otpRefs.current[Math.min(text.length, 5)]?.focus();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const otp = otpDigits.join('');
    if (otp.length < 6) { setOtpError('Ingresa los 6 digitos del codigo.'); return; }
    setOtpError(null); setOtpLoading(true);
    try {
      const endpoint = otpContext === 'login' ? '/api/auth/login/verify-otp' : '/api/auth/verify-otp';
      const res  = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ correo: fpCorreo, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || 'Codigo incorrecto.');
        setOtpDigits(['','','','','','']);
        setTimeout(() => otpRefs.current[0]?.focus(), 50);
        return;
      }

      if (otpContext === 'login') {
        if (data.token) localStorage.setItem('radar_token', data.token);
        if (remember) localStorage.setItem('radar_remember', '1');
        setPassword('');
        onLogin(data.user);
        return;
      }

      setResetToken(data.token);
      setNewPassword(''); setConfirmPassword(''); setResetError(null);
      setView('reset');
    } catch {
      setOtpError('No se pudo conectar con el servidor.');
    } finally { setOtpLoading(false); }
  };

  const handleOtpResend = async () => {
    setOtpResendLoading(true);
    try {
      if (otpContext === 'login') {
        const res = await fetch('/api/auth/login/resend-otp', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ correo: fpCorreo }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo reenviar el codigo.');
      } else {
        await postForgotPassword(fpCorreo);
      }
      setOtpDigits(['','','','','','']);
      setOtpError(null);
      setOtpTimer(300);
      setOtpResendCooldown(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch {}
    finally { setOtpResendLoading(false); }
  };


  const otpTimerDisplay = otpTimer > 0
    ? `${Math.floor(otpTimer / 60)}:${String(otpTimer % 60).padStart(2, '0')}`
    : null;


  const goToForgot = () => { setFpCorreo(''); setFpError(null); setView('forgot'); };
  const goToLogin  = () => { setLoginError(null); setView('login'); };


  return (
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden"
      style={{ fontFamily: "'Space Grotesk', sans-serif" }}>

      <RadarPanel view={view} />

      <div className="flex flex-1 items-center justify-center px-6 py-4 lg:px-14 lg:py-6 bg-white overflow-y-auto">
        <div className="w-full max-w-md">
          <USILHeader />


          {view === 'login' && (
            <>
              <Card>
                <div className="mb-5 relative z-10">
                  <h1 className="text-3xl font-bold mb-2 tracking-tight text-slate-900 leading-tight">
                    Radar de <br /><span style={{ color: BRAND_COLORS.active }}>Prospección</span>
                  </h1>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Ingrese sus credenciales institucionales para acceder al sistema.
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4 relative z-10">

                  {loginSuccess && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-green-50 border border-green-200 animate-in slide-in-from-top-2 duration-300">
                      <span className="material-symbols-outlined flex-shrink-0 mt-0.5"
                        style={{ color: '#16a34a', fontSize: 16 }}>check_circle</span>
                      <p className="text-xs font-semibold text-green-700 leading-snug">{loginSuccess}</p>
                    </div>
                  )}
                  {loginError && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 animate-in slide-in-from-top-2 duration-300">
                      <AlertCircle size={15} className="text-rose-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs font-semibold text-rose-700 leading-snug">{loginError}</p>
                    </div>
                  )}


                  <div className="space-y-1.5">
                    <label className="block text-sm font-bold text-slate-800" htmlFor="email">Correo Institucional</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <span className="material-symbols-outlined transition-colors"
                          style={{ color: dominioInvalido ? BRAND_COLORS.error : correo ? BRAND_COLORS.active : BRAND_COLORS.body, fontSize: 20 }}>mail</span>
                      </div>
                      <input id="email" type="text" value={correo}
                        onChange={e => handleCorreoChange(e.target.value)}
                        placeholder="nombre@usil.edu.pe" required autoComplete="email"
                        className="w-full py-3 pr-4 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition-all shadow-sm"
                        style={{
                          paddingLeft: 44, backgroundColor: '#f8fafc', outline: 'none',
                          border: `2px solid ${dominioInvalido ? BRAND_COLORS.error : correo ? BRAND_COLORS.active : BRAND_COLORS.borderStrong}`,
                        }}
                        onFocus={e  => (e.target.style.borderColor = dominioInvalido ? BRAND_COLORS.error : BRAND_COLORS.active)}
                        onBlur={e   => (e.target.style.borderColor = dominioInvalido ? BRAND_COLORS.error : correo ? BRAND_COLORS.active : BRAND_COLORS.borderStrong)} />
                    </div>

                    {dominioInvalido && (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ef4444' }}>warning</span>
                        <p className="text-xs font-semibold" style={{ color: '#ef4444' }}>
                          Solo se permiten correos <strong>@usil.edu.pe</strong>
                        </p>
                      </div>
                    )}

                    {correo.toLowerCase().endsWith('@usil.edu.pe') && correo.split('@')[0].length > 0 && (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#16a34a' }}>check_circle</span>
                        <p className="text-xs font-semibold" style={{ color: '#16a34a' }}>Correo institucional válido</p>
                      </div>
                    )}
                  </div>


                  <PasswordField id="password" label="Contraseña" icon="lock"
                    value={password} onChange={setPassword}
                    show={showPass} onToggle={() => setShowPass(p => !p)}
                    autoComplete="new-password" />


                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2.5 cursor-pointer group rounded hover:bg-slate-50 p-1 -ml-1 transition-colors">
                      <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                        className="w-5 h-5 rounded border-2 border-slate-300 cursor-pointer"
                        style={{ accentColor: BRAND_COLORS.active }} />
                      <span className="text-sm font-medium text-slate-600 group-hover:text-slate-800 transition-colors">Recordarme</span>
                    </label>
                    <button type="button" onClick={goToForgot}
                      className="text-sm font-bold hover:underline underline-offset-4 rounded px-1 transition-colors hover:text-blue-900"
                      style={{ color: BRAND_COLORS.active }}>
                      ¿Olvidó su contraseña?
                    </button>
                  </div>

                  <button type="submit" disabled={loading || !correo || !password || dominioInvalido}
                    className="w-full text-white font-bold text-base py-3.5 px-6 rounded-xl flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: BRAND_COLORS.active, boxShadow: '0 6px 16px rgba(0,54,220,0.25)' }}
                    onMouseEnter={e => { if (!loading) e.currentTarget.style.backgroundColor = '#003a94'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = BRAND_COLORS.active; }}>
                    {loading
                      ? <><Loader2 size={18} className="animate-spin" /><span>Verificando...</span></>
                      : <><span>Iniciar Sesión</span>
                          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span></>}
                  </button>
                </form>
              </Card>
              <PageFooter />
            </>
          )}


          {view === 'forgot' && (
            <>
              <Card>
                <div className="relative z-10">
                  <div className="mb-5">
                    <h1 className="text-3xl font-bold mb-2 tracking-tight leading-tight" style={{ color: BRAND_COLORS.active }}>
                      Recuperar Contraseña
                    </h1>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Ingrese su correo institucional para recibir las instrucciones de restablecimiento.
                    </p>
                  </div>
                  <form onSubmit={handleForgot} className="space-y-4">
                    {fpError && (
                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 animate-in slide-in-from-top-2 duration-300">
                        <AlertCircle size={15} className="text-rose-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs font-semibold text-rose-700 leading-snug">{fpError}</p>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="block text-sm font-bold text-slate-800" htmlFor="fp-email">Correo Institucional</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                          <span className="material-symbols-outlined transition-colors"
                            style={{ color: fpCorreo ? BRAND_COLORS.active : BRAND_COLORS.body, fontSize: 20 }}>mail</span>
                        </div>
                        <input id="fp-email" type="email" value={fpCorreo} onChange={e => setFpCorreo(e.target.value)}
                          placeholder="nombre@usil.edu.pe" required autoComplete="email"
                          className="w-full py-3 pr-4 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 transition-all shadow-sm"
                          style={{ paddingLeft: 44, backgroundColor: BRAND_COLORS.surface, border: `2px solid ${fpCorreo ? BRAND_COLORS.active : BRAND_COLORS.borderStrong}`, outline: 'none' }}
                          onFocus={e => (e.target.style.borderColor = BRAND_COLORS.active)}
                          onBlur={e  => (e.target.style.borderColor = fpCorreo ? BRAND_COLORS.active : BRAND_COLORS.borderStrong)} />
                      </div>
                    </div>
                    <button type="submit" disabled={fpLoading || !fpCorreo}
                      className="w-full text-white font-bold text-base py-3.5 px-6 rounded-xl flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: BRAND_COLORS.active, boxShadow: '0 6px 16px rgba(0,54,220,0.25)' }}
                      onMouseEnter={e => { if (!fpLoading) e.currentTarget.style.backgroundColor = '#003a94'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = BRAND_COLORS.active; }}>
                      {fpLoading
                        ? <><Loader2 size={18} className="animate-spin" /><span>Enviando...</span></>
                        : <><span>Enviar Instrucciones</span>
                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>send</span></>}
                    </button>
                  </form>
                  <BackButton onClick={goToLogin} />
                </div>
              </Card>
              <PageFooter />
            </>
          )}


          {view === 'verify' && (
            <>
              <Card>
                <div className="relative z-10">

                  <div className="mb-5 text-center">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                      style={{ backgroundColor: '#eff6ff' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 44, color: BRAND_COLORS.active }}>
                        mark_email_read
                      </span>
                    </div>
                    <h1 className="text-2xl font-bold mb-2 tracking-tight leading-tight" style={{ color: BRAND_COLORS.active }}>
                      Verificación de Seguridad
                    </h1>
                    <p className="text-sm text-slate-600 leading-relaxed font-medium">
                      Hemos enviado un codigo de 6 digitos a tu correo institucional. Ingresalo para {otpContext === 'login' ? 'entrar a la plataforma' : 'continuar'}.
                    </p>
                  </div>

                  <form onSubmit={handleVerifyOtp} className="space-y-4">

                    {otpError && (
                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200">
                        <AlertCircle size={15} className="text-rose-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs font-semibold text-rose-700 leading-snug">{otpError}</p>
                      </div>
                    )}


                    <div className="flex justify-center gap-2">
                      {otpDigits.map((digit, i) => (
                        <input key={i}
                          ref={el => { otpRefs.current[i] = el; }}
                          type="text" inputMode="numeric" maxLength={1} value={digit}
                          onChange={e => handleOtpChange(i, e.target.value)}
                          onKeyDown={e => handleOtpKeyDown(i, e)}
                          onPaste={handleOtpPaste}
                          className="text-center text-2xl font-bold rounded-xl transition-all"
                          style={{
                            width: 48, height: 58,
                            border: `2px solid ${digit ? BRAND_COLORS.active : BRAND_COLORS.borderStrong}`,
                            backgroundColor: BRAND_COLORS.surface, color: BRAND_COLORS.active, outline: 'none',
                          }}
                          onFocus={e => (e.target.style.borderColor = BRAND_COLORS.active)}
                          onBlur={e  => (e.target.style.borderColor = digit ? BRAND_COLORS.active : BRAND_COLORS.borderStrong)}
                        />
                      ))}
                    </div>


                    <div className="p-3 rounded-xl border flex gap-3 items-start"
                      style={{ backgroundColor: 'rgba(239,246,255,0.5)', borderColor: '#dbeafe' }}>
                      <span className="material-symbols-outlined mt-0.5 flex-shrink-0"
                        style={{ color: BRAND_COLORS.active, fontSize: 18 }}>info</span>
                      {otpTimer > 0 ? (
                        <p className="text-xs text-slate-600">
                          El código expira en{' '}
                          <strong style={{ color: otpTimer <= 60 ? BRAND_COLORS.error : BRAND_COLORS.active }}>
                            {otpTimerDisplay}
                          </strong>. Si no lo encuentras, revisa tu carpeta de <strong>Spam</strong>.
                        </p>
                      ) : (
                        <p className="text-xs font-semibold" style={{ color: '#ef4444' }}>
                          El código ha expirado. Solicita uno nuevo.
                        </p>
                      )}
                    </div>


                    <button type="submit"
                      disabled={otpLoading || otpDigits.join('').length < 6 || otpTimer === 0}
                      className="w-full text-white font-bold text-base py-3.5 px-6 rounded-xl flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: BRAND_COLORS.active, boxShadow: '0 6px 16px rgba(0,54,220,0.25)' }}
                      onMouseEnter={e => { if (!otpLoading) e.currentTarget.style.backgroundColor = '#003a94'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = BRAND_COLORS.active; }}>
                      {otpLoading
                        ? <><Loader2 size={18} className="animate-spin" /><span>Validando...</span></>
                        : <span>{otpContext === 'login' ? 'Validar Codigo e Ingresar' : 'Validar Codigo y Continuar'}</span>}
                    </button>


                    <div className="text-center">
                      {otpResendCooldown > 0 ? (
                        <p className="text-xs text-slate-400 font-medium">
                          Reenviar código en {otpResendCooldown}s
                        </p>
                      ) : (
                        <button type="button" onClick={handleOtpResend} disabled={otpResendLoading}
                          className="text-sm font-bold hover:underline underline-offset-4 transition-colors disabled:opacity-50"
                          style={{ color: BRAND_COLORS.active }}>
                          {otpResendLoading ? 'Reenviando...' : '¿No recibiste el código? Reenviar'}
                        </button>
                      )}
                    </div>
                  </form>

                  <BackButton onClick={goToLogin} />
                </div>
              </Card>
              <PageFooter />
            </>
          )}


          {view === 'reset' && (
            <>
              <Card>
                <div className="relative z-10">
                  <div className="mb-5">
                    <h1 className="text-3xl font-bold mb-2 tracking-tight leading-tight" style={{ color: BRAND_COLORS.active }}>
                      Establecer nueva contraseña
                    </h1>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Cree una contraseña segura que no haya utilizado anteriormente.
                    </p>
                  </div>

                  <form onSubmit={handleReset} className="space-y-4">
                    {resetError && (
                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 animate-in slide-in-from-top-2 duration-300">
                        <AlertCircle size={15} className="text-rose-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs font-semibold text-rose-700 leading-snug">{resetError}</p>
                      </div>
                    )}


                    <div className="space-y-1.5">
                      <PasswordField id="new-password" label="Nueva contraseña" icon="lock"
                        value={newPassword} onChange={setNewPassword}
                        show={showNewPass} onToggle={() => setShowNewPass(p => !p)} />


                      {newPassword && (
                        <div className="pt-1">
                          <div className="flex gap-1.5 mb-1">
                            {strengthSegments.map((cls, i) => (
                              <div key={i} className={`strength-segment ${cls}`} />
                            ))}
                          </div>
                          <div className="flex justify-between text-xs font-medium text-slate-400">
                            <span>Débil</span>
                            {strengthLabel && (
                              <span style={{ color: strengthLabel.color }}>{strengthLabel.text}</span>
                            )}
                            <span>Fuerte</span>
                          </div>
                        </div>
                      )}
                    </div>


                    <PasswordField id="confirm-password" label="Confirmar nueva contraseña" icon="lock_reset"
                      value={confirmPassword} onChange={setConfirmPassword}
                      show={showConfirmPass} onToggle={() => setShowConfirmPass(p => !p)} />


                    <div className="p-4 rounded-xl border" style={{ backgroundColor: 'rgba(239,246,255,0.5)', borderColor: '#dbeafe' }}>
                      <h4 className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider">
                        Requisitos de la contraseña
                      </h4>
                      <ul className="space-y-2">
                        {requirements.map(req => (
                          <li key={req.label} className="flex items-center gap-2">
                            <span className="material-symbols-outlined flex-shrink-0"
                              style={{ fontSize: 17, color: req.met ? '#22c55e' : '#94a3b8' }}>
                              {req.met ? 'check_circle' : 'radio_button_unchecked'}
                            </span>
                            <span className="text-xs font-medium"
                              style={{ color: req.met ? '#15803d' : '#64748b' }}>
                              {req.label}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>


                    <button type="submit"
                      disabled={resetLoading || !newPassword || !confirmPassword}
                      className="w-full text-white font-bold text-base py-3.5 px-6 rounded-xl flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: BRAND_COLORS.active, boxShadow: '0 6px 16px rgba(0,54,220,0.25)' }}
                      onMouseEnter={e => { if (!resetLoading) e.currentTarget.style.backgroundColor = '#003a94'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = BRAND_COLORS.active; }}>
                      {resetLoading
                        ? <><Loader2 size={18} className="animate-spin" /><span>Actualizando...</span></>
                        : <><span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
                            <span>Actualizar contraseña</span></>}
                    </button>
                  </form>

                  <BackButton onClick={goToLogin} />
                </div>
              </Card>
              <PageFooter />
            </>
          )}


          {view === 'success' && (
            <>
              <Card>
                <div className="relative z-10 flex flex-col items-center text-center py-4">

                  <div className="mb-8 rounded-full flex items-center justify-center"
                    style={{ width: 112, height: 112, backgroundColor: '#eff6ff' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 64, color: BRAND_COLORS.active }}>
                      check_circle
                    </span>
                  </div>


                  <h1 className="text-3xl font-bold mb-4 tracking-tight leading-tight" style={{ color: BRAND_COLORS.active }}>
                    Contraseña actualizada
                  </h1>


                  <p className="text-lg text-slate-600 leading-relaxed font-medium mb-10 max-w-sm mx-auto">
                    Tu contraseña ha sido restablecida correctamente. Ya puedes acceder a la plataforma con tus nuevas credenciales.
                  </p>


                  <button type="button" onClick={goToLogin}
                    className="w-full text-white font-bold text-base py-4 px-6 rounded-xl flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]"
                    style={{ backgroundColor: BRAND_COLORS.active, boxShadow: '0 6px 16px rgba(0,54,220,0.3)' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#003a94')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = BRAND_COLORS.active)}>
                    <span>Ir al Inicio de Sesión</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
                  </button>
                </div>
              </Card>
              <PageFooter />
            </>
          )}

        </div>
      </div>
    </div>
  );
};

export default LoginView;
