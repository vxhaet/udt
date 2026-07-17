'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, type EditionPublic, type FormatCourse } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

export default function InscriptionPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [edition, setEdition] = useState<EditionPublic | null>(null);
  const [formats, setFormats] = useState<FormatCourse[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    nom_equipe: '',
    cap_prenom: '',
    cap_nom: '',
    cap_email: '',
    membre1: '',
    membre2: '',
    membre3: '',
  });

  useEffect(() => {
    apiFetch<EditionPublic>(`/editions/by-slug/${slug}`)
      .then((ed) => {
        console.log('[inscription] édition reçue :', ed);
        setEdition(ed);
        setFormats(ed.formats ?? []);
      })
      .catch(() => setError('Édition introuvable'))
      .finally(() => setLoading(false));
  }, [slug]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formats.length > 0 && !selectedFormat) {
      setError('Veuillez choisir un format de course.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const emails_membres = [form.membre1, form.membre2, form.membre3]
        .map((s) => s.trim())
        .filter(Boolean);

      const body: Record<string, unknown> = {
        nom_equipe: form.nom_equipe.trim(),
        capitaine: {
          nom: form.cap_nom.trim(),
          prenom: form.cap_prenom.trim(),
          email: form.cap_email.trim().toLowerCase(),
        },
        emails_membres,
        platform: 'web',
      };
      if (selectedFormat) body.format_course_id = selectedFormat;

      const res = await fetch(`${API_URL}/inscriptions/${edition!.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        router.push(`/${slug}/inscription/success?code=${data.code_acces}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!edition) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-center px-6">
        <div>
          <p className="text-2xl font-black text-white mb-3">Édition introuvable</p>
          <p className="text-zinc-500 mb-6">{error || 'Cette édition n\u2019existe pas.'}</p>
          <Link href="/" className="text-orange-400 hover:text-orange-300 text-sm">
            ← Retour
          </Link>
        </div>
      </div>
    );
  }

  if (edition.statut !== 'INSCRIPTION') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-center px-6">
        <div>
          <p className="text-2xl font-black text-white mb-3">Inscriptions fermées</p>
          <p className="text-zinc-500 mb-6">
            Les inscriptions pour cette édition ne sont pas ouvertes.{' '}
            <span className="text-zinc-600">(statut&nbsp;: {edition.statut})</span>
          </p>
          <Link href={`/${slug}`} className="text-orange-400 hover:text-orange-300 text-sm">
            ← Retour à l&apos;édition
          </Link>
        </div>
      </div>
    );
  }

  const spotsLeft = edition.nb_equipes_max - edition._count.equipes;
  const prixEuros = (edition.prix_equipe / 100).toFixed(2);

  return (
    <div className="min-h-screen bg-zinc-950 py-12 px-4">
      <div className="max-w-lg mx-auto space-y-8">
        {/* Header */}
        <div>
          <Link href={`/${slug}`} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
            ← {edition.nom}
          </Link>
          <h1 className="text-3xl font-black text-white mt-4 mb-1">S'inscrire</h1>
          <p className="text-zinc-500 text-sm">
            {new Date(edition.date_course).toLocaleDateString('fr-FR', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
            {' · '}{edition.duree_minutes / 60}h de course
          </p>
          <div className="flex items-center gap-4 mt-3 text-sm">
            <span className={spotsLeft <= 5 ? 'text-orange-400 font-semibold' : 'text-zinc-400'}>
              {spotsLeft} place{spotsLeft !== 1 ? 's' : ''} restante{spotsLeft !== 1 ? 's' : ''}
            </span>
            <span className="text-orange-400 font-semibold">
              {edition.prix_equipe === 0 ? 'Gratuit' : `${prixEuros} €`} / équipe
            </span>
          </div>
        </div>

        {/* Form */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Format de course */}
            {formats.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Format *</p>
                <div className="grid grid-cols-2 gap-2">
                  {formats.map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setSelectedFormat(fmt.id)}
                      className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                        selectedFormat === fmt.id
                          ? 'border-orange-500 bg-orange-500/10 text-white'
                          : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500'
                      }`}
                    >
                      <p className="font-bold text-sm">{fmt.nom}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{fmt.duree_minutes / 60}h</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Field label="Nom de l'équipe *">
              <input
                name="nom_equipe"
                value={form.nom_equipe}
                onChange={handleChange}
                required
                minLength={2}
                maxLength={50}
                className={inputCls}
                placeholder="Les Aventuriers"
              />
            </Field>

            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Capitaine</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Prénom *">
                    <input name="cap_prenom" value={form.cap_prenom} onChange={handleChange} required className={inputCls} placeholder="Marie" />
                  </Field>
                  <Field label="Nom *">
                    <input name="cap_nom" value={form.cap_nom} onChange={handleChange} required className={inputCls} placeholder="Dupont" />
                  </Field>
                </div>
                <Field label="Email *">
                  <input name="cap_email" value={form.cap_email} onChange={handleChange} required type="email" className={inputCls} placeholder="marie@email.com" />
                </Field>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Coéquipiers <span className="text-zinc-600 normal-case font-normal">(optionnel)</span>
              </p>
              <p className="text-xs text-zinc-600 mb-3">
                Ils recevront un email avec le code d'accès pour rejoindre l'équipe.
              </p>
              <div className="space-y-2">
                {(['membre1', 'membre2', 'membre3'] as const).map((k, i) => (
                  <input
                    key={k}
                    name={k}
                    value={form[k]}
                    onChange={handleChange}
                    type="email"
                    className={inputCls}
                    placeholder={`coequipier${i + 1}@email.com`}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-black text-base py-4 rounded-2xl transition-colors"
            >
              {saving
                ? 'Inscription en cours…'
                : edition.prix_equipe === 0
                ? "S'inscrire gratuitement"
                : `S'inscrire — ${prixEuros} €`}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-zinc-700">
          Un email de confirmation avec votre code d'accès vous sera envoyé.
        </p>
      </div>
    </div>
  );
}
