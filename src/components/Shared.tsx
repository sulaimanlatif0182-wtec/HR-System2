import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Loader2 } from 'lucide-react';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8"
    >
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted text-sm mt-1.5">{subtitle}</p>}
      </div>
      {action}
    </motion.div>
  );
}

export function LoadingState({ label = 'Loading data…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted">
      <Loader2 size={28} className="animate-spin text-primary" />
      <p className="text-sm font-mono">{label}</p>
    </div>
  );
}

export function ErrorState({ message = 'Something went wrong.', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="w-14 h-14 rounded-2xl bg-rose/10 border border-rose/20 grid place-items-center">
        <AlertTriangle size={24} className="text-rose" />
      </div>
      <p className="text-sm text-muted max-w-xs text-center">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ label = 'No data yet.' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted">
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' }) {
  const tones: Record<string, string> = {
    default: 'bg-white/5 text-muted border-white/10',
    success: 'bg-emerald/10 text-emerald border-emerald/25',
    warning: 'bg-amber/10 text-amber border-amber/25',
    danger: 'bg-rose/10 text-rose border-rose/25',
    info: 'bg-accent/10 text-accent border-accent/25',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded-lg bg-gradient-to-r from-white/[0.04] via-white/[0.08] to-white/[0.04] animate-shimmer ${className}`} />;
}
