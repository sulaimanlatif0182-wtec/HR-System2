import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// ── Password-recovery safety net ─────────────────────────────
// Supabase recovery links arrive with a hash like:
//   /#access_token=...&type=recovery
// If the link lands on any page other than /reset-password,
// forward the user there WITH the hash intact so the
// session can be established on the reset page.
const hash = window.location.hash;

if (
  hash.includes('type=recovery') &&
  !window.location.pathname.startsWith('/reset-password')
) {
  window.location.replace(`/reset-password${hash}`);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);