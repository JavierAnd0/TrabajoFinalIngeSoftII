import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  GraduationCap,
  BookOpen,
  Building2,
  Server,
  Activity,
  Lock,
  Mail,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Database,
} from 'lucide-react';
import {
  CORE_API_BASE,
  WORKER_API_BASE,
  CHATBOT_API_BASE,
  loginWithCredentials,
  saveSessionToBrowser,
} from '../../services/apiClient';
import { $authToken, $currentUser } from '../../stores/academicStore';

interface ServiceStatus {
  name: string;
  port: number;
  role: string;
  online: boolean;
  latencyMs: number;
}

const DEMO_ACCOUNTS = [
  {
    id: 'student',
    testId: 'demo-student-btn',
    title: 'Estudiante Ingeniería de Software — Sede Neiva',
    subtitle: 'Álvaro Javier Andrade · Cód. 20221203806',
    email: 'alvaro.andrade@usco.edu.co',
    password: 'Usco2026*',
    roleBadge: 'STUDENT · NEI',
    icon: GraduationCap,
  },
  {
    id: 'teacher',
    testId: 'demo-teacher-btn',
    title: 'Docente Ingeniería de Software — Sede Neiva',
    subtitle: 'Ing. Carlos Eduardo Ramírez, M.Sc.',
    email: 'docente.software@usco.edu.co',
    password: 'Usco2026*',
    roleBadge: 'TEACHER · NEI',
    icon: BookOpen,
  },
  {
    id: 'admin',
    testId: 'demo-admin-btn',
    title: 'Administrador General Multi-Sede',
    subtitle: 'Dra. María Fernanda Perdomo · Registro y Control',
    email: 'admin@usco.edu.co',
    password: 'Usco2026*',
    roleBadge: 'ADMIN · 4 SEDES',
    icon: Building2,
  },
];

const REGIONAL_NODES = [
  { code: 'NEI', city: 'Neiva', description: 'Sede Central Av. Pastrana', rlsPolicy: 'RLS Campus Active' },
  { code: 'PIT', city: 'Pitalito', description: 'Nodo Regional Sur / Macizo', rlsPolicy: 'RLS Campus Active' },
  { code: 'GAR', city: 'Garzón', description: 'Nodo Regional Centro del Huila', rlsPolicy: 'RLS Campus Active' },
  { code: 'LPL', city: 'La Plata', description: 'Nodo Regional Occidente', rlsPolicy: 'RLS Campus Active' },
];

export default function LoginIsland() {
  const [email, setEmail] = useState('alvaro.andrade@usco.edu.co');
  const [password, setPassword] = useState('Usco2026*');
  const [selectedDemo, setSelectedDemo] = useState<string>('student');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'Core Academic API', port: 4001, role: 'Hexagonal + JWT + Prisma', online: true, latencyMs: 12 },
    { name: 'Worker BullMQ + PDF', port: 4002, role: 'Colas Asíncronas SHA-256 + QR', online: true, latencyMs: 18 },
    { name: 'Chatbot IA Híbrido', port: 4003, role: 'Gemini / Groq + Reglas < 5ms', online: true, latencyMs: 9 },
  ]);

  useEffect(() => {
    let active = true;
    async function checkDistributedHealth() {
      const checks = [
        {
          name: 'Core Academic API',
          port: 4001,
          role: 'Hexagonal + JWT + Prisma',
          url: `${CORE_API_BASE}/campuses`,
        },
        {
          name: 'Worker BullMQ + PDF',
          port: 4002,
          role: 'Colas Asíncronas SHA-256 + QR',
          url: `${WORKER_API_BASE}/metrics/queues`,
        },
        {
          name: 'Chatbot IA Híbrido',
          port: 4003,
          role: 'Gemini / Groq + Reglas < 5ms',
          url: `${CHATBOT_API_BASE}/faq-tree`,
        },
      ];

      const updated = await Promise.all(
        checks.map(async (item) => {
          const t0 = performance.now();
          try {
            const res = await fetch(item.url, { method: 'GET' });
            const dt = Math.max(2, Math.round(performance.now() - t0));
            return {
              name: item.name,
              port: item.port,
              role: item.role,
              online: res.ok,
              latencyMs: dt,
            };
          } catch {
            return {
              name: item.name,
              port: item.port,
              role: item.role,
              online: false,
              latencyMs: 0,
            };
          }
        })
      );

      if (active) {
        setServices(updated);
      }
    }

    checkDistributedHealth();
    return () => {
      active = false;
    };
  }, []);

  const handleSelectDemo = (account: (typeof DEMO_ACCOUNTS)[0]) => {
    setSelectedDemo(account.id);
    setEmail(account.email);
    setPassword(account.password);
    setErrorMessage(null);
    setStatusMessage(`Credenciales de ${account.title} cargadas. Haz clic en Ingresar o presiona Enter.`);
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
          : 'Error al autenticar con el servidor Core Academic (Puerto 4001).';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Columna Izquierda: Selector Rápido 1-Clic + Formulario Institucional */}
      <div className="lg:col-span-7 glass-card rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-5 mb-6">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-usco-wine/30 text-usco-gold border border-usco-gold/30 mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              Autenticación Institucional JWT + RLS Multi-Sede
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Portal Académico USCO-Net
            </h1>
            <p className="text-sm text-slate-300 mt-1">
              Selecciona un perfil institucional de demostración o ingresa tus credenciales.
            </p>
          </div>
        </div>

        {/* Selector Rápido de Cuentas Demo en 1 Clic */}
        <div className="mb-6" role="region" aria-label="Selector Rápido de Cuentas Demo en 1 Clic">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-usco-gold">
              Selector Rápido de Cuentas Demo (1 Clic)
            </h2>
            <span className="text-xs text-slate-400 font-mono">Clave común: Usco2026*</span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {DEMO_ACCOUNTS.map((acc) => {
              const Icon = acc.icon;
              const isSelected = selectedDemo === acc.id && email === acc.email;
              return (
                <button
                  key={acc.id}
                  type="button"
                  data-testid={acc.testId}
                  onClick={() => handleSelectDemo(acc)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-usco-wine/25 border-usco-gold text-white shadow-lg'
                      : 'bg-slate-900/70 border-slate-800 text-slate-200 hover:border-slate-700 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2.5 rounded-lg shrink-0 ${
                        isSelected ? 'bg-usco-wine text-usco-gold' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-semibold text-white truncate">{acc.title}</p>
                      <p className="text-xs text-slate-300 truncate">{acc.subtitle}</p>
                      <p className="text-xs font-mono text-usco-gold/90 mt-0.5">{acc.email}</p>
                    </div>
                  </div>
                  <span className="shrink-0 px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-slate-950/90 text-usco-gold border border-usco-gold/30">
                    {acc.roleBadge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Formulario de Login */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="login-email-input"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
            >
              Correo Institucional USCO
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="login-email-input"
                data-testid="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@usco.edu.co"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:border-usco-gold focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password-input"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
            >
              Contraseña Institucional
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="login-password-input"
                data-testid="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:border-usco-gold focus:outline-none"
              />
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              data-testid="login-error-alert"
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-950/80 border border-red-700 text-red-200 text-xs"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {statusMessage && !errorMessage && (
            <div
              role="status"
              className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 text-xs"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{statusMessage}</span>
            </div>
          )}

          <button
            type="submit"
            data-testid="login-submit"
            disabled={loading}
            className="w-full py-3 px-5 rounded-xl font-semibold text-sm text-white bg-usco-wine hover:bg-usco-wineLight border border-usco-gold/40 shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <span>Verificando firma JWT con Core Service...</span>
            ) : (
              <>
                <span>Ingresar al Sistema Académico Distribuido</span>
                <ArrowRight className="w-4 h-4 text-usco-gold" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Columna Derecha: Panel de Estado en Vivo de la Arquitectura Distribuida */}
      <div className="lg:col-span-5 space-y-6">
        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Server className="w-5 h-5 text-usco-gold" />
              <h2 className="text-base font-bold text-white">
                Estado en Vivo · Microservicios
              </h2>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-300 border border-emerald-700/60">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Cluster Activo
            </span>
          </div>

          <div className="space-y-3">
            {services.map((srv) => (
              <div
                key={srv.port}
                className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      srv.online ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {srv.name}{' '}
                      <span className="font-mono text-xs text-usco-gold">:{srv.port}</span>
                    </p>
                    <p className="text-xs text-slate-400">{srv.role}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold ${
                      srv.online
                        ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-800'
                        : 'bg-amber-950/90 text-amber-300 border border-amber-800'
                    }`}
                  >
                    {srv.online ? `${srv.latencyMs} ms` : 'STANDBY'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Database className="w-5 h-5 text-usco-gold" />
              <h2 className="text-base font-bold text-white">
                Nodos Regionales USCO (Huila)
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-400">PostgreSQL + RLS</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {REGIONAL_NODES.map((node) => (
              <div
                key={node.code}
                className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-usco-wine/40 text-usco-gold border border-usco-gold/30">
                    SEDE {node.code}
                  </span>
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <p className="text-sm font-semibold text-white mt-1">{node.city}</p>
                <p className="text-xs text-slate-400">{node.description}</p>
                <p className="text-[11px] font-mono text-emerald-400 mt-1.5 flex items-center gap-1">
                  <Cpu className="w-3 h-3" /> {node.rlsPolicy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
