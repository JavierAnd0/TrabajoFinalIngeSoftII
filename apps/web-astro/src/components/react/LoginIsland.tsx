import React, { useState } from 'react';
import {
  ShieldCheck,
  GraduationCap,
  BookOpen,
  Building2,
  Lock,
  Mail,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  MapPin,
} from 'lucide-react';
import { loginWithCredentials, saveSessionToBrowser } from '../../services/apiClient';
import { $authToken, $currentUser } from '../../stores/academicStore';

const DEMO_ACCOUNTS = [
  {
    id: 'student',
    testId: 'demo-student-btn',
    title: 'Estudiante · Ingeniería de Software',
    subtitle: 'Álvaro Javier Andrade · Cód. 20221203806',
    email: 'alvaro.andrade@usco.edu.co',
    password: 'Usco2026*',
    roleBadge: 'ESTUDIANTE · NEI',
    icon: GraduationCap,
  },
  {
    id: 'teacher',
    testId: 'demo-teacher-btn',
    title: 'Docente de Planta · Facultad de Ingeniería',
    subtitle: 'Ing. Carlos Eduardo Ramírez, M.Sc.',
    email: 'docente.software@usco.edu.co',
    password: 'Usco2026*',
    roleBadge: 'DOCENTE · NEI',
    icon: BookOpen,
  },
  {
    id: 'admin',
    testId: 'demo-admin-btn',
    title: 'Dirección de Registro y Control Académico',
    subtitle: 'Dra. María Fernanda Perdomo · Consolidado 4 Sedes',
    email: 'admin@usco.edu.co',
    password: 'Usco2026*',
    roleBadge: 'ADMIN · MULTI-SEDE',
    icon: Building2,
  },
];

const REGIONAL_NODES = [
  {
    code: 'NEI',
    city: 'Neiva (Sede Central)',
    description: 'Avenida Pastrana Borrero · Cra. 1',
    programs: 'Ingeniería, Salud, Educación, Ciencias',
  },
  {
    code: 'PIT',
    city: 'Pitalito (Sur del Huila)',
    description: 'Km 1 Vía Pitalito – San Agustín',
    programs: 'Ingeniería de Software, Administración',
  },
  {
    code: 'GAR',
    city: 'Garzón (Centro del Huila)',
    description: 'Cra. 3 No. 1-31 Vía las Termitas',
    programs: 'Ingeniería Agrícola, Derecho, Contaduría',
  },
  {
    code: 'LPL',
    city: 'La Plata (Suroccidente)',
    description: 'Km 1 Vía La Plata – Fátima',
    programs: 'Ingeniería, Gestión Empresarial',
  },
];

export default function LoginIsland() {
  const [email, setEmail] = useState('alvaro.andrade@usco.edu.co');
  const [password, setPassword] = useState('Usco2026*');
  const [selectedDemo, setSelectedDemo] = useState<string>('student');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);


  const handleSelectDemo = (account: (typeof DEMO_ACCOUNTS)[0]) => {
    setSelectedDemo(account.id);
    setEmail(account.email);
    setPassword(account.password);
    setErrorMessage(null);
    setStatusMessage(`Perfil seleccionado: ${account.title}. Presiona "Iniciar sesión" para continuar.`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Por favor ingresa tu correo institucional @usco.edu.co y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const { token, user } = await loginWithCredentials(email, password);
      saveSessionToBrowser(token, user);
      $authToken.set(token);
      $currentUser.set(user);

      const targetUrl =
        user.role === 'TEACHER' || user.role === 'ADMIN'
          ? '/dashboard/admin'
          : '/dashboard/estudiante';

      window.location.assign(targetUrl);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No fue posible validar las credenciales institucionales.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Columna Izquierda: Acceso Institucional */}
      <div className="lg:col-span-7 glass-card rounded-xl p-6 sm:p-8 border border-slate-800">
        <div className="border-b border-slate-800/90 pb-5 mb-6">
          <div className="flex items-center gap-2 text-xs font-mono text-usco-gold mb-2">
            <ShieldCheck className="w-4 h-4" />
            <span>SISTEMA DE INFORMACIÓN ACADÉMICA · PERIODO 2026-2</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Ingreso al Portal Universitario
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Accede con tu cuenta institucional <span className="font-mono text-slate-300">@usco.edu.co</span> o selecciona un perfil de prueba para explorar la plataforma.
          </p>
        </div>

        {/* Selector Rápido de Cuentas Demo */}
        <div className="mb-6" role="region" aria-label="Perfiles institucionales de acceso rápido">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Perfiles de Demostración (1 Clic)
            </span>
            <span className="text-[11px] text-slate-500 font-mono">Contraseña: Usco2026*</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {DEMO_ACCOUNTS.map((acc) => {
              const Icon = acc.icon;
              const isSelected = selectedDemo === acc.id && email === acc.email;
              const badgeClass = `px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-mono font-semibold border ${
                isSelected
                  ? 'bg-usco-wine/40 text-usco-gold border-usco-gold/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`;
              return (
                <button
                  key={acc.id}
                  type="button"
                  data-testid={acc.testId}
                  onClick={() => handleSelectDemo(acc)}
                  className={`w-full text-left p-3 sm:p-3.5 rounded-lg border transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-usco-wine/20 border-usco-gold/80 text-white'
                      : 'bg-slate-950/60 border-slate-800/90 text-slate-200 hover:border-slate-700 hover:bg-slate-900/70'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`p-2 rounded-lg shrink-0 border ${
                        isSelected
                          ? 'bg-usco-wine text-usco-gold border-usco-gold/40'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{acc.title}</p>
                      <p className="text-xs text-slate-400 truncate">{acc.subtitle}</p>
                      <span className={`sm:hidden inline-block mt-1.5 ${badgeClass}`}>
                        {acc.roleBadge}
                      </span>
                    </div>
                  </div>
                  <span className={`hidden sm:inline-block shrink-0 ${badgeClass}`}>
                    {acc.roleBadge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Formulario de Login */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-slate-800/80" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="login-email-input"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Correo Institucional
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-email-input"
                  data-testid="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@usco.edu.co"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-[#070A12] border border-slate-700/90 text-white placeholder-slate-500 text-sm focus:border-usco-gold focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password-input"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-password-input"
                  data-testid="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-[#070A12] border border-slate-700/90 text-white placeholder-slate-500 text-sm focus:border-usco-gold focus:outline-none"
                />
              </div>
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              data-testid="login-error-alert"
              className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {statusMessage && !errorMessage && (
            <div
              role="status"
              className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs"
            >
              <CheckCircle2 className="w-4 h-4 text-usco-gold shrink-0 mt-0.5" />
              <span>{statusMessage}</span>
            </div>
          )}

          <button
            type="submit"
            data-testid="login-submit"
            disabled={loading}
            className="w-full py-3 px-5 rounded-lg font-semibold text-sm text-white bg-usco-wine hover:bg-usco-wineLight border border-usco-gold/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <span>Autenticando sesión institucional...</span>
            ) : (
              <>
                <span>Iniciar sesión en el Portal Académico</span>
                <ArrowRight className="w-4 h-4 text-usco-gold" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Columna Derecha: Sedes Regionales y Estado de Servicios */}
      <div className="lg:col-span-5 space-y-6">
        <div className="glass-card rounded-xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-usco-gold" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Cobertura Regional USCO · Huila
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">4 Sedes Activas</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {REGIONAL_NODES.map((node) => (
              <div
                key={node.code}
                className="p-3.5 rounded-lg bg-[#070A12]/90 border border-slate-800/90 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-usco-wine/30 text-usco-gold border border-usco-gold/30">
                      SEDE {node.code}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  </div>
                  <p className="text-xs font-bold text-white">{node.city}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{node.description}</p>
                </div>
                <p className="text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-800/70">
                  {node.programs}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
