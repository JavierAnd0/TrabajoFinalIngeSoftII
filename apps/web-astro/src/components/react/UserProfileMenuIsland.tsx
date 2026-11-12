import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  User,
  Settings,
  FileText,
  LogOut,
  Sun,
  Moon,
  ShieldCheck,
  MapPin,
  Mail,
  IdCard,
  X,
  Building2,
  GraduationCap,
  BookOpen,
  Sliders,
} from 'lucide-react';
import type { SessionUser } from '../../env';
import { clearBrowserSession } from '../../services/apiClient';

interface UserProfileMenuIslandProps {
  user: SessionUser;
  activeItemsCount?: number;
}

export default function UserProfileMenuIsland({
  user,
  activeItemsCount = 4,
}: UserProfileMenuIslandProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'profile' | 'settings' | null>(
    null
  );
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [compactMode, setCompactMode] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
    const savedTheme = window.localStorage.getItem('usco_theme') as 'dark' | 'light' | null;
    const initialTheme = savedTheme === 'light' ? 'light' : 'dark';
    setTheme(initialTheme);
    applyThemeToDom(initialTheme);

    const savedCompact = window.localStorage.getItem('usco_compact_tables') === 'true';
    setCompactMode(savedCompact);
    document.documentElement.classList.toggle('compact-tables', savedCompact);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setActiveModal(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const applyThemeToDom = (nextTheme: 'dark' | 'light') => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (nextTheme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
      root.setAttribute('data-theme', 'light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    }
    try {
      window.localStorage.setItem('usco_theme', nextTheme);
    } catch {
      // Ignore storage errors
    }
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyThemeToDom(next);
  };

  const toggleCompactMode = () => {
    const next = !compactMode;
    setCompactMode(next);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('compact-tables', next);
      try {
        window.localStorage.setItem('usco_compact_tables', String(next));
      } catch {
        // Ignore storage errors
      }
    }
  };

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    clearBrowserSession();
    window.location.assign('/api/auth/logout');
  };

  const roleLabel =
    user.role === 'STUDENT'
      ? 'Estudiante'
      : user.role === 'TEACHER'
        ? 'Docente de Planta'
        : 'Dirección de Registro y Control';

  const CAMPUS_NAMES: Record<string, string> = {
    NEI: 'Sede Central Neiva',
    PIT: 'Sede Pitalito',
    GAR: 'Sede Garzón',
    LPL: 'Sede La Plata',
  };
  const campusFullName =
    CAMPUS_NAMES[user.campusCode] ||
    user.campusName?.split('-')[0]?.trim() ||
    'Sede Central Neiva';

  const jurisdictionLabel =
    user.role === 'ADMIN' ? 'Neiva, Pitalito, Garzón y La Plata' : campusFullName;

  // Accesos directos reales según el rol de la cuenta
  const roleShortcuts: { label: string; href: string; icon: typeof User }[] =
    user.role === 'STUDENT'
      ? [
          { label: 'Mis calificaciones', href: '/dashboard/estudiante#calificaciones', icon: GraduationCap },
          { label: 'Inscribir asignaturas', href: '/dashboard/estudiante#matricula', icon: BookOpen },
          { label: 'Mis certificados', href: '/dashboard/estudiante#certificados', icon: FileText },
        ]
      : user.role === 'TEACHER'
        ? [
            { label: 'Planilla de notas', href: '/dashboard/admin#planilla', icon: BookOpen },
            { label: 'Mi sede', href: '/dashboard/admin#sedes', icon: Building2 },
          ]
        : [
            { label: 'Sedes regionales', href: '/dashboard/admin#sedes', icon: Building2 },
            { label: 'Planilla consolidada', href: '/dashboard/admin#planilla', icon: BookOpen },
            { label: 'Solicitudes en proceso', href: '/dashboard/admin#colas', icon: FileText },
          ];

  const accessSummary =
    user.role === 'STUDENT'
      ? `Puedes consultar tus calificaciones, inscribir asignaturas y solicitar certificados en la ${campusFullName}.`
      : user.role === 'TEACHER'
        ? `Puedes registrar y modificar las notas de tus grupos asignados en la ${campusFullName}.`
        : 'Puedes consultar y gestionar la información académica de las cuatro sedes de la universidad.';

  const initials = user.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  // Renderizado del Modal mediante Portal en document.body para evitar el recorte
  // causado por backdrop-filter en el <header> sticky.
  const modalNode =
    mounted && activeModal && typeof document !== 'undefined'
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={activeModal === 'profile' ? 'Mi perfil' : 'Apariencia'}
            onClick={(e) => {
              if (e.target === e.currentTarget) setActiveModal(null);
            }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-950/75 backdrop-blur-sm overflow-y-auto"
          >
            <div className="glass-card w-full max-w-lg rounded-2xl border border-slate-700 overflow-hidden shadow-2xl my-auto">
              {/* Cabecera del Modal: único control de cierre (✕) */}
              <div className="usco-gradient px-5 py-4 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  {activeModal === 'profile' ? (
                    <User className="w-5 h-5 text-usco-gold shrink-0" />
                  ) : (
                    <Sliders className="w-5 h-5 text-usco-gold shrink-0" />
                  )}
                  <h3 className="text-sm sm:text-base font-bold text-white truncate">
                    {activeModal === 'profile' ? 'Mi perfil' : 'Apariencia'}
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar"
                  data-testid="modal-close-btn"
                  onClick={() => setActiveModal(null)}
                  className="btn-keep-light p-1.5 rounded-lg bg-black/25 hover:bg-black/40 text-white transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs sm:text-sm max-h-[75vh] overflow-y-auto">
                {/* Pestañas internas */}
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#070A12] border border-slate-800">
                  {(['profile', 'settings'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveModal(tab)}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold transition-colors ${
                        activeModal === tab
                          ? 'bg-usco-wine text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab === 'profile' ? 'Mi perfil' : 'Apariencia'}
                    </button>
                  ))}
                </div>

                {activeModal === 'profile' && (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-[#070A12] border border-slate-800 flex items-center gap-3.5">
                      <div className="btn-keep-light w-12 h-12 rounded-full bg-usco-wine border border-usco-gold flex items-center justify-center font-bold text-white text-base shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-white text-sm truncate">{user.fullName}</p>
                        <p className="text-xs text-slate-400 truncate">{roleLabel}</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <Mail className="w-3.5 h-3.5 text-usco-gold shrink-0" />
                          <span className="truncate">{user.email}</span>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-[#070A12] border border-slate-800">
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <IdCard className="w-3.5 h-3.5 text-usco-gold" />
                          {user.studentCode ? 'Código estudiantil' : 'Documento'}
                        </p>
                        <p className="font-mono font-bold text-white text-xs mt-1">
                          {user.studentCode || user.documentNumber}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-[#070A12] border border-slate-800">
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-usco-gold" />
                          {user.role === 'ADMIN' ? 'Sedes a cargo' : 'Sede'}
                        </p>
                        <p className="font-semibold text-white text-xs mt-1">{jurisdictionLabel}</p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#070A12] border border-slate-800 flex items-start gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-usco-gold shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-300 leading-relaxed">{accessSummary}</p>
                    </div>
                  </div>
                )}

                {activeModal === 'settings' && (
                  <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-[#070A12] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-white text-sm">Tema</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Elige entre el modo oscuro y el modo claro.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={toggleTheme}
                        className="btn-keep-light px-3.5 py-2 rounded-lg bg-usco-wine hover:bg-usco-wineLight text-white border border-usco-gold/40 text-xs font-semibold flex items-center justify-center gap-2 shrink-0 transition-colors"
                      >
                        {theme === 'dark' ? (
                          <>
                            <Sun className="w-4 h-4 text-usco-gold" />
                            <span>Cambiar a modo claro</span>
                          </>
                        ) : (
                          <>
                            <Moon className="w-4 h-4 text-usco-gold" />
                            <span>Cambiar a modo oscuro</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="p-4 rounded-xl bg-[#070A12] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-white text-sm">Tablas compactas</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Muestra más filas en pantalla reduciendo el espaciado.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={compactMode}
                        onClick={toggleCompactMode}
                        className={`px-3.5 py-2 rounded-lg border text-xs font-semibold transition-colors shrink-0 ${
                          compactMode
                            ? 'bg-emerald-950 border-emerald-700 text-emerald-300'
                            : 'bg-[#0D1322] border-slate-700 text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        {compactMode ? 'Activadas' : 'Desactivadas'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={containerRef} className="relative flex items-center gap-2 sm:gap-2.5">
      {/* Botón Rápido Modo Claro / Oscuro */}
      <button
        type="button"
        onClick={toggleTheme}
        data-testid="theme-toggle-btn"
        aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0D1322] hover:bg-slate-800/80 text-slate-200 border border-slate-800 text-xs font-medium transition-colors"
      >
        {theme === 'dark' ? (
          <>
            <Sun className="w-3.5 h-3.5 text-usco-gold" />
            <span className="hidden xl:inline">Modo claro</span>
          </>
        ) : (
          <>
            <Moon className="w-3.5 h-3.5 text-usco-wine" />
            <span className="hidden xl:inline">Modo oscuro</span>
          </>
        )}
      </button>

      {/* Avatar Trigger con Indicador En Línea */}
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        data-testid="user-profile-menu-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={`Menú de cuenta de ${user.fullName}`}
        className="group flex items-center gap-2.5 p-1 pr-1 sm:pr-2.5 rounded-full bg-[#0D1322] hover:bg-slate-800/80 border border-slate-800 hover:border-usco-gold/50 transition-all focus:outline-none"
      >
        <div className="btn-keep-light relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-usco-wine border-2 border-usco-gold/60 flex items-center justify-center shadow-sm shrink-0">
          <span className="font-sans font-bold text-xs text-white tracking-tight">
            {initials || 'US'}
          </span>
          <span
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#070A12]"
            title="En línea"
          />
        </div>
        <div className="hidden sm:block text-left pr-0.5">
          <p className="text-xs font-semibold text-white leading-tight truncate max-w-[140px]">
            {user.fullName.split(' ').slice(0, 2).join(' ')}
          </p>
          <p className="text-[10px] text-usco-gold leading-tight truncate max-w-[140px]">
            {roleLabel}
          </p>
        </div>
      </button>

      {/* Popover Flotante de Cuenta */}
      {menuOpen && (
        <div
          role="menu"
          aria-label="Opciones de cuenta"
          data-testid="user-profile-popover"
          className="user-popover-card absolute right-0 top-12 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl bg-[#151C2C] border border-slate-700/90 shadow-2xl py-2 z-50"
        >
          {/* Cabecera: Avatar + Nombre + Rol + Sede completa */}
          <div className="px-4 py-3.5 border-b border-slate-800/90 flex items-center gap-3.5">
            <div className="btn-keep-light relative w-11 h-11 rounded-full bg-usco-wine border-2 border-usco-gold/70 flex items-center justify-center shrink-0 shadow-md">
              <span className="font-sans font-extrabold text-sm text-white">{initials || 'US'}</span>
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[#151C2C]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{user.fullName}</p>
              <p className="text-xs text-slate-400 truncate">{roleLabel}</p>
              <p className="text-[11px] text-usco-gold flex items-center gap-1 mt-0.5 truncate">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {user.role === 'ADMIN' ? 'Todas las sedes' : campusFullName}
                </span>
              </p>
            </div>
          </div>

          {/* Accesos directos según el rol */}
          <div className="py-1.5 px-2 space-y-0.5 border-b border-slate-800/90">
            {roleShortcuts.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-slate-200 hover:bg-slate-800/70 transition-colors"
                >
                  <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </div>

          {/* Cuenta */}
          <div className="py-1.5 px-2 space-y-0.5">
            <button
              type="button"
              role="menuitem"
              data-testid="menu-item-profile"
              onClick={() => {
                setMenuOpen(false);
                setActiveModal('profile');
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-slate-200 hover:bg-slate-800/70 transition-colors text-left"
            >
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Mi perfil</span>
            </button>

            <button
              type="button"
              role="menuitem"
              data-testid="menu-item-settings"
              onClick={() => {
                setMenuOpen(false);
                setActiveModal('settings');
              }}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-slate-200 hover:bg-slate-800/70 transition-colors text-left"
            >
              <span className="flex items-center gap-3">
                <Settings className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Apariencia</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-[#070A12] text-usco-gold border border-slate-700">
                {theme === 'light' ? 'Claro' : 'Oscuro'}
              </span>
            </button>
          </div>

          {/* Cerrar Sesión */}
          <div className="pt-1.5 mt-1 px-2 border-t border-slate-800/90">
            <a
              href="/api/auth/logout"
              id="logout-btn"
              data-testid="logout-btn"
              role="menuitem"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-red-400 hover:bg-red-950/50 transition-colors"
            >
              <LogOut className="w-4 h-4 text-red-400 shrink-0" />
              <span>Cerrar sesión</span>
            </a>
          </div>
        </div>
      )}

      {modalNode}
    </div>
  );
}
