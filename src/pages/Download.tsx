import { motion } from 'framer-motion';
import { Download as DownloadIcon, FileArchive, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Download() {
  const zipPath = '/downloads/wtec-hr-source.zip';

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg text-ink flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #F4F7FC, #E8EFFA)' }} />
      <div className="absolute inset-0 hex-pattern" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 bg-surface border border-border rounded-3xl shadow-card p-8 sm:p-10 max-w-lg w-full text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center mx-auto shadow-lg shadow-primary/30">
          <FileArchive size={28} className="text-white" />
        </div>
        <h1 className="font-display text-2xl font-bold mt-5">Download WTEC HR Source Code</h1>
        <p className="text-muted text-sm mt-2 leading-relaxed">
          Full project export — React + TypeScript frontend, Vercel API routes, and setup instructions.
          No `node_modules`, no secrets, ready to push to your own GitHub + Vercel.
        </p>

        <div className="mt-7 flex flex-col gap-3">
          <a
            href={zipPath}
            download="wtec-hr-source.zip"
            className="flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-[#0F3475] text-white py-3.5 text-sm font-semibold shadow-card hover:scale-[1.02] transition-all"
          >
            <DownloadIcon size={18} /> Download .zip (~85 KB)
          </a>
          <a
            href={zipPath}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-[#F6F9FE] py-3 text-sm font-medium hover:bg-primary-soft transition-all"
          >
            Open in new tab instead
          </a>
        </div>

        <div className="mt-6 text-left bg-[#F6F9FE] border border-border rounded-xl p-4">
          <p className="text-xs text-muted mb-2 font-mono uppercase tracking-wide">If the button doesn't work</p>
          <p className="text-xs text-muted leading-relaxed">
            Copy this path and paste it after your site's domain in a new browser tab (not inside any embedded preview frame):
          </p>
          <code className="block mt-2 text-xs bg-accent-soft rounded-lg px-3 py-2 text-accent break-all select-all">
            {zipPath}
          </code>
        </div>

        <ul className="mt-6 text-left space-y-2">
          {['39 source files', 'README with full setup guide', '.env.example template included', 'No secrets or node_modules bundled'].map((t) => (
            <li key={t} className="flex items-center gap-2 text-xs text-muted">
              <CheckCircle2 size={14} className="text-emerald shrink-0" /> {t}
            </li>
          ))}
        </ul>

        <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink mt-7 transition-colors">
          <ArrowLeft size={14} /> Back to login
        </Link>
      </motion.div>
    </div>
  );
}
