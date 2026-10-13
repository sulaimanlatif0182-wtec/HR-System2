import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import supabase from '../lib/supabase';

const ALLOWED_TYPES = ['signup', 'invite', 'magiclink', 'recovery', 'email_change'] as const;
type OtpType = (typeof ALLOWED_TYPES)[number];

// Handles GoTrue PKCE links: /verify?token=...&type=recovery[&redirect_to=...]
// Exchanges the token for a session, then routes recovery -> /reset-password.
export default function Verify() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    const type = params.get('type');
    if (!token || !type || !(ALLOWED_TYPES as readonly string[]).includes(type)) {
      navigate('/login', { replace: true });
      return;
    }
    supabase.auth
      .verifyOtp({ token_hash: token, type: type as OtpType })
      .then(({ error: err }) => {
        if (err) {
          setError(err.message);
          return;
        }
        navigate(type === 'recovery' ? '/reset-password' : '/', { replace: true });
      });
  }, [params, navigate]);

  return (
    <div className="min-h-screen bg-bg grid place-items-center px-4">
      <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
        {error ? (
          <>
            <h2 className="font-display text-xl font-bold">Link invalid or expired</h2>
            <p className="text-muted text-sm mt-2">{error}</p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm text-white"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin mx-auto" />
            <p className="text-muted text-sm mt-4">Verifying your link…</p>
          </>
        )}
      </div>
    </div>
  );
}
