'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface EditionPublic {
  id: string;
  nom: string;
  description?: string | null;
  date_course: string;
  duree_minutes: number;
  nb_equipes_max: number;
  prix_equipe: number;
  statut: string;
  _count?: { equipes: number };
}

interface FormatCourse {
  id: string;
  nom: string;
  duree_minutes: number;
}

const input =
  'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-400">{label}</label>
      {children}
    </div>
  );
}

export default function InscriptionPage() {
  const { editionId } = useParams<{ editionId: string }>();
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
    Promise.all([
      fetch(`${API_URL}/editions/${editionId}`).then((r) => r.json()),
      fetch(`${API_URL}/editions/${editionId}/formats`).then((r) => r.json()),
    ])
      .then(([ed, fmts]: [EditionPublic, FormatCourse[]]) => {
        setEdition(ed);
        setFormats(Array.isArray(fmts) ? fmts : []);
      })
      .catch(() => setError('Édition introuvable'))
      .finally(() => setLoading(false));
  }, [editionId]);

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

      console.log('[Inscription] POST body:', JSON.stringify(body, null, 2));
      const res = await fetch(`${API_URL}/inscriptions/${editionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        router.push(`/inscription/${editionId}/success?code=${data.code_acces}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        Chargement…
      </div>
    );
  }

  if (!edition || edition.statut !== 'INSCRIPTION') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-center px-6">
        <div>
          <p className="text-2xl font-bold text-white mb-2">Inscriptions fermées</p>
          <p className="text-gray-400">
            Les inscriptions pour cette édition ne sont pas ouvertes.
          </p>
        </div>
      </div>
    );
  }

  const spotsLeft = edition.nb_equipes_max - (edition._count?.equipes ?? 0);
  const prixEuros = (edition.prix_equipe / 100).toFixed(2);

  return (
    <div className="min-h-screen bg-gray-950 py-12 px-4">
      <div className="max-w-lg mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-blue-700 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-black text-2xl">U</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Ultra DéTour</h1>
          <h2 className="text-lg text-gray-300">{edition.nom}</h2>
          <p className="text-sm text-gray-500">
            {new Date(edition.date_course).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            {' · '}
            {edition.duree_minutes / 60}h de course
          </p>
          <div className="flex items-center justify-center gap-4 text-sm">
            <span className="text-gray-400">
              {spotsLeft} place{spotsLeft !== 1 ? 's' : ''} restante
              {spotsLeft !== 1 ? 's' : ''}
            </span>
            <span className="text-green-400 font-semibold">
              {edition.prix_equipe === 0 ? 'Gratuit' : `${prixEuros} €`} par équipe
            </span>
          </div>
        </div>

        {/* Form */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Format de course */}
            {formats.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Format de course *
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {formats.map((fmt) => {
                    const isSelected = selectedFormat === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setSelectedFormat(fmt.id)}
                        className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500/10 text-white'
                            : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
                        }`}
                      >
                        <p className="font-semibold text-sm">{fmt.nom}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {fmt.duree_minutes / 60}h de course
                        </p>
                      </button>
                    );
                  })}
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
                className={input}
                placeholder="Les Aventuriers"
              />
            </Field>

            <div>
              <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
                Capitaine
              </p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Prénom *">
                    <input
                      name="cap_prenom"
                      value={form.cap_prenom}
                      onChange={handleChange}
                      required
                      className={input}
                      placeholder="Marie"
                    />
                  </Field>
                  <Field label="Nom *">
                    <input
                      name="cap_nom"
                      value={form.cap_nom}
                      onChange={handleChange}
                      required
                      className={input}
                      placeholder="Dupont"
                    />
                  </Field>
                </div>
                <Field label="Email *">
                  <input
                    name="cap_email"
                    value={form.cap_email}
                    onChange={handleChange}
                    required
                    type="email"
                    className={input}
                    placeholder="marie@email.com"
                  />
                </Field>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                Coéquipiers (optionnel)
              </p>
              <p className="text-xs text-gray-500 mb-3">
                Ils recevront un email avec le code d'accès pour rejoindre l'équipe.
              </p>
              <div className="space-y-2">
                <input
                  name="membre1"
                  value={form.membre1}
                  onChange={handleChange}
                  type="email"
                  className={input}
                  placeholder="coequipier1@email.com"
                />
                <input
                  name="membre2"
                  value={form.membre2}
                  onChange={handleChange}
                  type="email"
                  className={input}
                  placeholder="coequipier2@email.com"
                />
                <input
                  name="membre3"
                  value={form.membre3}
                  onChange={handleChange}
                  type="email"
                  className={input}
                  placeholder="coequipier3@email.com"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {saving
                ? 'Inscription en cours…'
                : edition.prix_equipe === 0
                ? "S'inscrire gratuitement"
                : `S'inscrire — ${prixEuros} €`}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600">
          Vous recevrez un email de confirmation avec votre code d'accès.
        </p>
      </div>
    </div>
  );
}
