'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';

export default function LoginPage() {
  const { signIn, token, loading } = useAuth();
  const router = useRouter();

  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && token) router.replace('/course/carte');
  }, [loading, token, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await apiFetch<{ token: string }>('/equipes/join', {
        method: 'POST',
        body: JSON.stringify({
          code_acces: code.trim().toUpperCase(),
          email: email.trim().toLowerCase(),
        }),
      });
      signIn(data.token);
      router.replace('/course/carte');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-brand-pink rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-5xl font-black tracking-tight text-udt-gradient">
            UDT
          </h1>
          <p className="text-zinc-500 text-sm mt-2">Connecte-toi avec ton code equipe</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Code equipe
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              maxLength={8}
              placeholder="ABCD1234"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 text-center text-2xl font-black tracking-[0.25em] text-white placeholder-zinc-700 focus:outline-none focus:ring-2 focus:ring-brand-pink focus:border-transparent"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="ton@email.com"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-brand-pink focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || code.length < 8}
            className="w-full bg-udt-gradient disabled:opacity-50 text-white font-bold text-sm py-4 rounded-2xl transition-opacity hover:opacity-90"
          >
            {submitting ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-700">
          Tu n'as pas de code ? Demande-le au capitaine de ton equipe.
        </p>
      </div>
    </div>
  );
}
