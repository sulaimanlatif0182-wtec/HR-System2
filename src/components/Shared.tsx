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
        <button onClick={onRetry} className="mt-2 text-xs px-4 py-2 rounded-lg bg-[#EEF2F9] hover:bg-primary-soft transition-all">
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
    default: 'bg-[#EEF2F9] text-muted border-border',
    success: 'bg-[#E7F6EC] text-[#16A34A] border-[#BBE5C9]',
    warning: 'bg-[#FDF2E3] text-[#D97706] border-[#F5D9A8]',
    danger: 'bg-accent-soft text-accent border-[#F5C2C4]',
    info: 'bg-primary-soft text-primary border-[#B9CDEE]',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded-lg bg-gradient-to-r from-[#E8EFFA] via-[#FFFFFF] to-[#E8EFFA] animate-shimmer ${className}`} />;
}
