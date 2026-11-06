
'use client';

import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const supabase = createClient();

      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setError(error.message);
          return;
        }

        // Reload so Next.js server components can read the session.
        window.location.replace('/');
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setError(error.message);
          return;
        }

        if (!data.session) {
          setMessage(
            'Account created. Check your email to confirm your account, then sign in.'
          );
          setMode('signin');
          return;
        }

        window.location.replace('/');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Authentication failed.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="logo-mark">S</div>
        <div className="eyebrow">SignalBridge workspace</div>

        <h1 className="heading" style={{ fontSize: 27 }}>
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>

        <p className="subheading">
          Connect your marketing data and CRM workflows.
        </p>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              minLength={8}
              autoComplete={
                mode === 'signin' ? 'current-password' : 'new-password'
              }
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>

          {error && <div className="error">{error}</div>}

          {message && <p className="help">{message}</p>}

          <button
            type="submit"
            className="btn primary"
            style={{ width: '100%', marginTop: 16 }}
            disabled={busy}
          >
            {busy
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
            <ArrowRight size={15} />
          </button>
        </form>

        <p
          className="help"
          style={{ marginTop: 20, textAlign: 'center' }}
        >
          {mode === 'signin'
            ? 'New to SignalBridge?'
            : 'Already have an account?'}

          <button
            type="button"
            className="btn"
            style={{ padding: '5px 8px', marginLeft: 4 }}
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError('');
              setMessage('');
            }}
          >
            {mode === 'signin' ? 'Create account' : 'Sign in'}
          </button>
        </p>
      </section>
    </main>
  );
}
