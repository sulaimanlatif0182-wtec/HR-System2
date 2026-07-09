import { motion } from 'framer-motion';
import { Download as DownloadIcon, FileArchive, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Download() {
  const zipPath = '/downloads/wtec-hr-source.zip';

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg text-ink flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 grid-noise opacity-40" />
      <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-primary/30 blur-[140px]" />
      <div className="absolute -bottom-40 -right-20 w-[480px] h-[480px] rounded-full bg-accent/20 blur-[140px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 glass rounded-3xl p-8 sm:p-10 max-w-lg w-full text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center mx-auto shadow-lg shadow-primary/30">
          <FileArchive size={28} className="text-white" />
        </div>
        <h1 className="font-display text-2xl font-bold mt-5">Download WtecHR Source Code</h1>
        <p className="text-muted text-sm mt-2 leading-relaxed">
          Full project export — React + TypeScript frontend, Vercel API routes, and setup instructions.
          No `node_modules`, no secrets, ready to push to your own GitHub + Vercel.
        </p>

        <div className="mt-7 flex flex-col gap-3">
          <a
            href={zipPath}
            download="wtec-hr-source.zip"
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-2 py-3.5 text-sm font-semibold shadow-lg shadow-primary/30 hover:scale-[1.02] transition-all"
          >
            <DownloadIcon size={18} /> Download .zip (~85 KB)
          </a>
          <a
            href={zipPath}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-3 text-sm font-medium hover:bg-white/[0.08] transition-all"
          >
            Open in new tab instead
          </a>
        </div>

        <div className="mt-6 text-left glass rounded-xl p-4">
          <p className="text-xs text-muted mb-2 font-mono uppercase tracking-wide">If the button doesn't work</p>
          <p className="text-xs text-muted leading-relaxed">
            Copy this path and paste it after your site's domain in a new browser tab (not inside any embedded preview frame):
          </p>
          <code className="block mt-2 text-xs bg-black/30 rounded-lg px-3 py-2 text-accent break-all select-all">
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
