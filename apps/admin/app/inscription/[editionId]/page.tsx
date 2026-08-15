'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

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

interface ParticipantForm {
  prenom: string;
  nom: string;
  email: string;
}

const emptyParticipant = (): ParticipantForm => ({ prenom: '', nom: '', email: '' });

export default function InscriptionPage() {
  const { editionId } = useParams<{ editionId: string }>();
  const router = useRouter();
  const [edition, setEdition] = useState<EditionPublic | null>(null);
  const [formats, setFormats] = useState<FormatCourse[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [nomEquipe, setNomEquipe] = useState('');
  const [participants, setParticipants] = useState<ParticipantForm[]>([
    emptyParticipant(), emptyParticipant(), emptyParticipant(), emptyParticipant(),
  ]);

  useEffect(() => {
    Promise.all([
      apiFetch<EditionPublic>(`/editions/${editionId}`),
      apiFetch<FormatCourse[]>(`/editions/${editionId}/formats`),
    ])
      .then(([ed, fmts]) => {
        setEdition(ed);
        setFormats(Array.isArray(fmts) ? fmts : []);
      })
      .catch(() => setError('Edition introuvable'))
      .finally(() => setLoading(false));
  }, [editionId]);

  function updateParticipant(index: number, field: keyof ParticipantForm, value: string) {
    setParticipants((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formats.length > 0 && !selectedFormat) {
      setError('Veuillez choisir un format de course.');
      return;
    }

    // Filter to non-empty participants (at least 1 required)
    const filled = participants.filter((p) => p.prenom.trim() && p.nom.trim() && p.email.trim());
    if (filled.length === 0) {
      setError('Au moins un participant est requis.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        nom_equipe: nomEquipe.trim(),
        participants: filled.map((p) => ({
          prenom: p.prenom.trim(),
          nom: p.nom.trim(),
          email: p.email.trim().toLowerCase(),
        })),
      };
      if (selectedFormat) body.format_course_id = selectedFormat;

      const data = await apiFetch<{ code_acces: string }>(`/inscriptions/${editionId}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      router.push(`/inscription/${editionId}/success?code=${data.code_acces}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        Chargement...
      </div>
    );
  }

  if (!edition || edition.statut !== 'INSCRIPTION') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-center px-6">
        <div>
          <p className="text-2xl font-bold text-white mb-2">Inscriptions fermees</p>
          <p className="text-gray-400">Les inscriptions pour cette edition ne sont pas ouvertes.</p>
        </div>
      </div>
    );
  }

  const spotsLeft = edition.nb_equipes_max - (edition._count?.equipes ?? 0);

  return (
    <div className="min-h-screen bg-gray-950 py-12 px-4">
      <div className="max-w-lg mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-blue-700 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-black text-2xl">U</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{edition.nom}</h1>
          <p className="text-sm text-gray-500">
            {new Date(edition.date_course).toLocaleDateString('fr-FR', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
            {' · '}
            {spotsLeft} place{spotsLeft !== 1 ? 's' : ''} restante{spotsLeft !== 1 ? 's' : ''}
          </p>
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
                  {formats.map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setSelectedFormat(fmt.id)}
                      className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                        selectedFormat === fmt.id
                          ? 'border-blue-500 bg-blue-500/10 text-white'
                          : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      <p className="font-semibold text-sm">{fmt.nom}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmt.duree_minutes / 60}h</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Field label="Nom de l'equipe *">
              <input
                value={nomEquipe}
                onChange={(e) => setNomEquipe(e.target.value)}
                required
                minLength={2}
                maxLength={50}
                className={input}
                placeholder="Les Aventuriers"
              />
            </Field>

            {/* 4 participants */}
            {participants.map((p, i) => (
              <div key={i}>
                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
                  Participant {i + 1} {i === 0 ? '*' : '(optionnel)'}
                </p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Prenom">
                      <input
                        value={p.prenom}
                        onChange={(e) => updateParticipant(i, 'prenom', e.target.value)}
                        required={i === 0}
                        className={input}
                        placeholder="Marie"
                      />
                    </Field>
                    <Field label="Nom">
                      <input
                        value={p.nom}
                        onChange={(e) => updateParticipant(i, 'nom', e.target.value)}
                        required={i === 0}
                        className={input}
                        placeholder="Dupont"
                      />
                    </Field>
                  </div>
                  <Field label="Email">
                    <input
                      value={p.email}
                      onChange={(e) => updateParticipant(i, 'email', e.target.value)}
                      required={i === 0}
                      type="email"
                      className={input}
                      placeholder="marie@email.com"
                    />
                  </Field>
                </div>
              </div>
            ))}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {saving ? 'Inscription en cours...' : 'Inscrire l\'equipe'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
