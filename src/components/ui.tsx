import type { ReactNode, ComponentType } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Inbox } from 'lucide-react';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-2xl sm:text-3xl font-bold tracking-tight"
        >
          {title}
        </motion.h1>
        {subtitle && <p className="text-muted text-sm mt-1.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    default: 'bg-white/5 text-muted border-white/10',
    success: 'bg-emerald/10 text-emerald border-emerald/25',
    warning: 'bg-amber/10 text-amber border-amber/25',
    danger: 'bg-rose/10 text-rose border-rose/25',
    info: 'bg-accent/10 text-accent border-accent/25',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${tones[tone] ?? tones.default}`}>
      {children}
    </span>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      <p className="text-muted text-sm font-mono tracking-wide">{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <p className="text-rose text-sm bg-rose/10 border border-rose/20 rounded-xl px-4 py-2">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm hover:bg-white/10 transition-all">
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted">
      <Inbox size={28} className="opacity-50" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function InfoRow({ icon: Icon, label, value }: { icon: ComponentType<{ size?: number; className?: string }>; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 glass rounded-xl px-4 py-3">
      <Icon size={16} className="text-primary shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted">{label}</p>
        <p className="text-sm truncate">{value}</p>
      </div>
    </div>
  );
}

export function GlowCard({ children, className = '', glowColor = '139,92,246' }: { children: ReactNode; className?: string; glowColor?: string; intensity?: number }) {
  return (
    <div
      className={`glass rounded-2xl transition-all duration-300 hover:-translate-y-0.5 ${className}`}
      style={{ ['--glow' as string]: glowColor }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 40px -10px rgba(${glowColor},0.35)`; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
    >
      {children}
    </div>
  );
}