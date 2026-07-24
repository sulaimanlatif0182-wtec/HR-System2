import { useState, useEffect, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, LayoutDashboard, Users, CalendarCheck, CalendarDays, Wallet, Network, ReceiptText,
  FileSearch, UserCog, Search, ChevronDown, Settings, UserCircle, LogOut, PanelLeftClose, PanelLeftOpen, Menu, X,
  CornerDownLeft,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import NotificationsBell from './NotificationsBell';


const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'employee'] },
  { to: '/employees', label: 'Employees', icon: Users, roles: ['admin', 'manager'] },
  { to: '/profile-updates', label: 'Profile Updates', icon: UserCog, roles: ['admin', 'manager', 'employee'] },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck, roles: ['admin', 'manager', 'employee'] },
  { to: '/leave', label: 'Leave', icon: CalendarDays, roles: ['admin', 'manager', 'employee'] },
  { to: '/payroll', label: 'Payroll', icon: Wallet, roles: ['admin', 'manager', 'employee'] },
  { to: '/claims', label: 'Claims', icon: ReceiptText, roles: ['admin', 'manager', 'employee'] },
  { to: '/org-chart', label: 'Org Chart', icon: Network, roles: ['admin', 'manager', 'employee'] },
  { to: '/audit-logs', label: 'Audit Logs', icon: FileSearch, roles: ['admin'] },
];

interface EmpLite {
  id: number;
  name: string;
  email: string;
  title: string | null;
  department: string | null;
  location: string | null;
}

function initialsOf(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export default function Layout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  // ── Global search state ─────────────────────────
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [allEmployees, setAllEmployees] = useState<EmpLite[]>([]);
  const [empLoaded, setEmpLoaded] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const role = profile?.role ?? 'employee';
  const displayName = profile?.name ?? user?.email?.split('@')[0] ?? 'User';
  const initials = displayName.slice(0, 2).toUpperCase();
  const items = NAV.filter((n) => n.roles.includes(role));

  // Lazy-load the employee directory the first time the user types
  useEffect(() => {
    if (query.trim() && !empLoaded) {
      fetch('/api/employees')
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setAllEmployees(d); })
        .catch(() => {})
        .finally(() => setEmpLoaded(true));
    }
  }, [query, empLoaded]);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const q = query.trim().toLowerCase();

  const employeeResults = useMemo(() => {
    if (!q) return [];
    return allEmployees
      .filter((e) =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.title ?? '').toLowerCase().includes(q) ||
        (e.department ?? '').toLowerCase().includes(q) ||
        (e.location ?? '').toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [q, allEmployees]);

  const pageResults = useMemo(() => {
    if (!q) return [];
    return items.filter((n) => n.label.toLowerCase().includes(q));
  }, [q, items]);

  const goToEmployee = (emp: EmpLite) => {
    setSearchOpen(false);
    setQuery('');
    // Employees page reads ?q= to pre-filter the directory
    navigate(`/employees?q=${encodeURIComponent(emp.name)}`);
  };

  const goToPage = (to: string) => {
    setSearchOpen(false);
    setQuery('');
    navigate(to);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const canSeeEmployees = role === 'admin' || role === 'manager';

  return (
    <div className="min-h-screen bg-bg text-ink flex">
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      <motion.aside
        animate={{ width: collapsed ? 84 : 260 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className={`fixed lg:sticky top-0 z-50 h-screen glass-solid border-r border-white/5 flex flex-col
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} transition-transform duration-300`}
      >
        <div className="flex items-center gap-3 px-5 h-20 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center shrink-0 shadow-lg shadow-primary/30">
            <Sparkles size={18} className="text-white" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }}
                className="font-display font-bold text-lg tracking-tight whitespace-nowrap overflow-hidden"
              >
                Wtec<span className="text-gradient">HR</span>
              </motion.span>
            )}
          </AnimatePresence>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto hidden lg:grid w-8 h-8 place-items-center rounded-lg text-muted hover:text-ink hover:bg-white/5 transition-all"
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <button onClick={() => setMobileOpen(false)} className="ml-auto lg:hidden text-muted">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all
                  ${isActive ? 'bg-primary/15 text-primary border border-primary/25 shadow-lg shadow-primary/10' : 'text-muted hover:text-ink hover:bg-white/5 border border-transparent'}`
                }
              >
                <Icon size={18} className="shrink-0" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }}
                      className="whitespace-nowrap overflow-hidden"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </NavLink>
            );
          })}
        </nav>

        <div className="px-3 pb-5 shrink-0">
          <div className={`glass rounded-xl p-3 flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center text-xs font-bold shrink-0">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{displayName}</p>
                <p className="text-[10px] text-muted capitalize">{role}</p>
              </div>
            )}
          </div>
        </div>
      </motion.aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 glass-solid border-b border-white/5 h-20 flex items-center gap-4 px-4 sm:px-8">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden w-10 h-10 grid place-items-center rounded-xl bg-white/5">
            <Menu size={18} />
          </button>

          {/* ── Global search ───────────────────── */}
          <div ref={searchRef} className="hidden md:block flex-1 max-w-md relative">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => { if (query.trim()) setSearchOpen(true); }}
                placeholder="Search employees, pages…"
                className="w-full bg-surface border border-white/10 rounded-xl pl-10 pr-8 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); setSearchOpen(false); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <AnimatePresence>
              {searchOpen && q && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className="absolute left-0 right-0 mt-2 glass-solid border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden max-h-[70vh] overflow-y-auto scrollbar-thin"
                >
                  {/* Pages */}
                  {pageResults.length > 0 && (
                    <div className="p-1.5">
                      <p className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted font-medium">Pages</p>
                      {pageResults.map((p) => {
                        const Icon = p.icon;
                        return (
                          <button
                            key={p.to}
                            onClick={() => goToPage(p.to)}
                            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm text-muted hover:text-ink hover:bg-white/5 transition-all"
                          >
                            <Icon size={15} className="text-primary shrink-0" />
                            {p.label}
                            <CornerDownLeft size={12} className="ml-auto opacity-40" />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Employees */}
                  {employeeResults.length > 0 && (
                    <div className="p-1.5 border-t border-white/5">
                      <p className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted font-medium">Employees</p>
                      {employeeResults.map((emp) => (
                        <button
                          key={emp.id}
                          onClick={() => (canSeeEmployees ? goToEmployee(emp) : undefined)}
                          className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-all ${canSeeEmployees ? 'text-muted hover:text-ink hover:bg-white/5 cursor-pointer' : 'text-muted cursor-default'}`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center text-[10px] font-bold shrink-0">
                            {initialsOf(emp.name)}
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="text-sm text-ink truncate">{emp.name}</p>
                            <p className="text-[11px] text-muted truncate">
                              {[emp.title, emp.department].filter(Boolean).join(' · ') || emp.email}
                            </p>
                          </div>
                          {canSeeEmployees && <CornerDownLeft size={12} className="ml-auto opacity-40 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Empty state */}
                  {pageResults.length === 0 && employeeResults.length === 0 && (
                    <div className="px-4 py-6 text-center">
                      <p className="text-sm text-muted">No results for “{query}”</p>
                      <p className="text-[11px] text-muted/60 mt-1">Try an employee name, email, title, department or page name.</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 md:hidden" />
          <div className="flex items-center gap-3 ml-auto">
            <NotificationsBell />
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-white/5 transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center text-xs font-bold shrink-0">
                  {initials}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-sm font-medium leading-tight">{displayName}</div>
                  <div className="text-[11px] text-muted leading-tight capitalize">{role}</div>
                </div>
                <ChevronDown size={14} className={`text-muted transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-52 glass rounded-xl p-1.5 shadow-2xl shadow-black/50"
                  >
                    <div className="px-3 py-2 border-b border-white/5 mb-1">
                      <p className="text-sm font-medium truncate">{user?.email}</p>
                      <p className="text-[11px] text-muted capitalize">{role} access</p>
                    </div>
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:text-ink hover:bg-white/5 transition-all"
                    >
                      <UserCircle size={15} /> My Profile
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:text-ink hover:bg-white/5 transition-all"
                    >
                      <Settings size={15} /> Settings
                    </button>
                    <button
                      onClick={signOut}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-rose hover:bg-rose/10 transition-all"
                    >
                      <LogOut size={15} /> Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-8 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}