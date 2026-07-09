import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, CalendarCheck, PlaneTakeoff, Wallet, Network,
  Sparkles, Bell, ChevronDown, Search, LogOut, Settings, Menu, X,
} from 'lucide-react';
import supabase from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager', 'employee'] },
  { to: '/employees', label: 'Employees', icon: Users, roles: ['admin', 'manager'] },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck, roles: ['admin', 'manager', 'employee'] },
  { to: '/leave', label: 'Leave', icon: PlaneTakeoff, roles: ['admin', 'manager', 'employee'] },
  { to: '/payroll', label: 'Payroll', icon: Wallet, roles: ['admin', 'manager', 'employee'] },
  { to: '/org-chart', label: 'Org Chart', icon: Network, roles: ['admin', 'manager', 'employee'] },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  const role = profile?.role ?? 'employee';
  const displayName = profile?.name ?? user?.email?.split('@')[0] ?? 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const visibleItems = navItems.filter((i) => i.roles.includes(role));

  return (
    <div className="min-h-screen bg-bg text-ink flex">
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
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
                Nimbus<span className="text-gradient">HR</span>
              </motion.span>
            )}
          </AnimatePresence>
          <button onClick={() => setMobileOpen(false)} className="ml-auto lg:hidden text-muted">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto scrollbar-thin">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                    isActive ? 'text-ink' : 'text-muted hover:text-ink hover:bg-white/5'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.div
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/25 to-accent/10 border border-primary/30"
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      />
                    )}
                    <Icon size={18} className="relative shrink-0" />
                    {!collapsed && <span className="relative whitespace-nowrap">{item.label}</span>}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/5">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-muted hover:text-ink hover:bg-white/5 transition-all text-xs"
          >
            <Menu size={16} /> {!collapsed && 'Collapse'}
          </button>
        </div>
      </motion.aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 h-20 glass-solid border-b border-white/5 flex items-center gap-4 px-4 sm:px-8">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden text-muted">
            <Menu size={22} />
          </button>

          <div className="hidden md:flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                placeholder="Search employees, requests…"
                className="w-full bg-surface border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 md:hidden" />

          <div className="flex items-center gap-3 ml-auto">
            <button className="relative w-10 h-10 rounded-xl grid place-items-center bg-white/5 hover:bg-white/10 transition-all">
              <Bell size={18} />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose animate-pulse-glow" />
            </button>

            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-white/5 transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent grid place-items-center text-xs font-bold shrink-0">
                  {initials}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-sm font-medium leading-tight">{displayName}</div>
                  <div className="text-[11px] text-muted leading-tight capitalize">{role}</div>
                </div>
                <ChevronDown size={14} className={`text-muted transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {profileOpen && (
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
                    <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:text-ink hover:bg-white/5 transition-all">
                      <Settings size={15} /> Settings
                    </button>
                    <button
                      onClick={handleSignOut}
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
