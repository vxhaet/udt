'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, ChevronRight, Users, MapPin, X, Link2, Pencil } from 'lucide-react';
import clsx from 'clsx';
import { apiFetch, type Edition } from '@/lib/api';

const STATUT: Record<string, { label: string; color: string }> = {
  BROUILLON:   { label: 'Brouillon',   color: 'bg-gray-500/20 text-gray-400' },
  INSCRIPTION: { label: 'Inscriptions', color: 'bg-blue-500/20 text-blue-400' },
  EN_COURS:    { label: 'En cours',    color: 'bg-green-500/20 text-green-400 animate-pulse' },
  TERMINE:     { label: 'Terminée',    color: 'bg-purple-500/20 text-purple-400' },
  ARCHIVE:     { label: 'Archivée',    color: 'bg-gray-500/20 text-gray-500' },
};

const EMPTY_FORM = {
  nom: '', slug: '', description: '', reglement: '',
  nb_participants_par_equipe: 4, solo_autorise: false,
  date_course: '', duree_minutes: 360, nb_equipes_max: 20, prix_equipe: 0,
  devoilement_depart: '', devoilement_checkpoints: '',
  devoilement_points: '', gel_classement: '',
};

// Convertit une date ISO en valeur compatible avec datetime-local (YYYY-MM-DDTHH:MM)
function toDatetimeLocal(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function editionToForm(ed: Edition) {
  return {
    nom: ed.nom,
    slug: ed.slug ?? '',
    description: ed.description ?? '',
    reglement: ed.reglement ?? '',
    nb_participants_par_equipe: ed.nb_participants_par_equipe ?? 4,
    solo_autorise: ed.solo_autorise ?? false,
    date_course: toDatetimeLocal(ed.date_course),
    duree_minutes: ed.duree_minutes,
    nb_equipes_max: ed.nb_equipes_max,
    prix_equipe: ed.prix_equipe / 100, // centimes → €
    devoilement_depart: toDatetimeLocal(ed.devoilement_depart),
    devoilement_checkpoints: toDatetimeLocal(ed.devoilement_checkpoints),
    devoilement_points: toDatetimeLocal(ed.devoilement_points),
    gel_classement: toDatetimeLocal(ed.gel_classement),
  };
}

interface FormatItem {
  id?: string;
  nom: string;
  duree_heures: string;
}

export default function EditionsPage() {
  const [editions, setEditions] = useState<Edition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formats, setFormats] = useState<FormatItem[]>([]);
  const [removedFormatIds, setRemovedFormatIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Edition[]>('/editions')
      .then(setEditions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormats([]);
    setRemovedFormatIds([]);
    setError('');
    setShowForm(true);
  }

  async function openEdit(ed: Edition) {
    setEditingId(ed.id);
    setForm(editionToForm(ed));
    setRemovedFormatIds([]);
    setError('');
    // Charger les formats existants
    try {
      const fmts = await apiFetch<{ id: string; nom: string; duree_minutes: number }[]>(
        `/editions/${ed.id}/formats`,
      );
      setFormats(fmts.map((f) => ({ id: f.id, nom: f.nom, duree_heures: String(f.duree_minutes / 60) })));
    } catch {
      setFormats([]);
    }
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormats([]);
    setRemovedFormatIds([]);
    setError('');
  }

  function removeFormat(i: number) {
    const fmt = formats[i];
    if (fmt.id) setRemovedFormatIds((prev) => [...prev, fmt.id!]);
    setFormats((f) => f.filter((_, j) => j !== i));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        slug: form.slug.trim() || undefined,
        reglement: form.reglement.trim() || undefined,
        duree_minutes: Number(form.duree_minutes),
        nb_equipes_max: Number(form.nb_equipes_max),
        nb_participants_par_equipe: Number(form.nb_participants_par_equipe),
        solo_autorise: form.solo_autorise,
        prix_equipe: Math.round(Number(form.prix_equipe) * 100), // € → centimes
        date_course: new Date(form.date_course).toISOString(),
        devoilement_depart: new Date(form.devoilement_depart).toISOString(),
        devoilement_checkpoints: new Date(form.devoilement_checkpoints).toISOString(),
        devoilement_points: new Date(form.devoilement_points).toISOString(),
        gel_classement: new Date(form.gel_classement).toISOString(),
      };

      if (editingId) {
        // Modifier une édition existante
        const updated = await apiFetch<Edition>(`/editions/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setEditions((prev) => prev.map((e) => (e.id === editingId ? updated : e)));

        // Supprimer les formats retirés
        for (const fmtId of removedFormatIds) {
          await apiFetch(`/editions/${editingId}/formats/${fmtId}`, { method: 'DELETE' });
        }
        // Mettre à jour les formats existants et créer les nouveaux
        for (const fmt of formats) {
          if (!fmt.nom.trim() || !fmt.duree_heures) continue;
          const data = { nom: fmt.nom.trim(), duree_minutes: Math.round(parseFloat(fmt.duree_heures) * 60) };
          if (fmt.id) {
            await apiFetch(`/editions/${editingId}/formats/${fmt.id}`, {
              method: 'PATCH',
              body: JSON.stringify(data),
            });
          } else {
            await apiFetch(`/editions/${editingId}/formats`, {
              method: 'POST',
              body: JSON.stringify(data),
            });
          }
        }
      } else {
        // Créer une nouvelle édition
        const edition = await apiFetch<Edition>('/editions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        for (const fmt of formats) {
          if (fmt.nom.trim() && fmt.duree_heures) {
            await apiFetch(`/editions/${edition.id}/formats`, {
              method: 'POST',
              body: JSON.stringify({
                nom: fmt.nom.trim(),
                duree_minutes: Math.round(parseFloat(fmt.duree_heures) * 60),
              }),
            });
          }
        }
        setEditions((prev) => [edition, ...prev]);
      }

      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Éditions</h1>
          <p className="text-gray-400 text-sm mt-0.5">Gérez les éditions de l'UDT</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvelle édition
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Chargement…</div>
      ) : editions.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p>Aucune édition pour l'instant.</p>
          <button onClick={openCreate} className="mt-3 text-blue-400 hover:text-blue-300 text-sm">
            Créer la première édition →
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {editions.map((ed) => {
            const s = STATUT[ed.statut] ?? STATUT.BROUILLON;
            return (
              <div key={ed.id} className="flex items-center gap-2 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-4 transition-colors group">
                <Link
                  href={`/editions/${ed.id}/qg`}
                  className="flex-1 flex items-center justify-between min-w-0"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white group-hover:text-blue-400 transition-colors">
                        {ed.nom}
                      </span>
                      <span className={clsx('badge', s.color)}>{s.label}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>
                        {new Date(ed.date_course).toLocaleDateString('fr-FR', {
                          day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {ed._count?.equipes ?? 0} / {ed.nb_equipes_max} équipes
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {ed._count?.checkpoints ?? 0} checkpoints
                      </span>
                      <span>{ed.duree_minutes / 60}h de course</span>
                      {ed.prix_equipe > 0 && (
                        <span className="text-green-400">{(ed.prix_equipe / 100).toFixed(2)} €</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0 ml-2" />
                </Link>
                <button
                  onClick={(e) => { e.preventDefault(); openEdit(ed); }}
                  title="Modifier l'édition"
                  className="shrink-0 p-2 text-gray-500 hover:text-yellow-400 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(`${window.location.origin}/inscription/${ed.id}`).catch(() => {});
                  }}
                  title="Copier le lien d'inscription"
                  className="shrink-0 p-2 text-gray-500 hover:text-blue-400 transition-colors"
                >
                  <Link2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-over création / modification */}
      {showForm && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/60" onClick={closeForm} />
          <div className="w-full max-w-lg bg-gray-900 border-l border-gray-800 overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingId ? 'Modifier l\'édition' : 'Nouvelle édition'}
              </h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <Field label="Nom de l'édition *">
                <input name="nom" value={form.nom} onChange={handleChange} required className={input} placeholder="UDT 2025" />
              </Field>
              <Field label="Slug URL (ex : udt-2026)">
                <input name="slug" value={form.slug} onChange={handleChange} className={input} placeholder="udt-2026" pattern="[a-z0-9-]+" />
              </Field>
              <Field label="Description">
                <textarea name="description" value={form.description} onChange={handleChange} rows={2} className={input} placeholder="Description de l'édition…" />
              </Field>
              <Field label="Règlement (Markdown)">
                <textarea name="reglement" value={form.reglement} onChange={handleChange} rows={4} className={input} placeholder="## Règlement&#10;- Règle 1&#10;- Règle 2…" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date de course *">
                  <input type="datetime-local" name="date_course" value={form.date_course} onChange={handleChange} required className={input} />
                </Field>
                <Field label="Durée (min) *">
                  <input type="number" name="duree_minutes" value={form.duree_minutes} onChange={handleChange} required min={30} className={input} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Équipes max *">
                  <input type="number" name="nb_equipes_max" value={form.nb_equipes_max} onChange={handleChange} required min={1} className={input} />
                </Field>
                <Field label="Prix équipe (€, 0 = gratuit)">
                  <input type="number" name="prix_equipe" value={form.prix_equipe} onChange={handleChange} min={0} step={0.01} className={input} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Participants / équipe">
                  <input type="number" name="nb_participants_par_equipe" value={form.nb_participants_par_equipe} onChange={handleChange} required min={1} max={10} className={input} />
                </Field>
                <div className="flex items-center gap-3 pt-5">
                  <input
                    type="checkbox"
                    id="solo_autorise"
                    checked={form.solo_autorise}
                    onChange={(e) => setForm((f) => ({ ...f, solo_autorise: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                  />
                  <label htmlFor="solo_autorise" className="text-sm text-gray-300 cursor-pointer">Solo autorisé</label>
                </div>
              </div>

              <hr className="border-gray-800" />
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Formats de course</p>
                <button
                  type="button"
                  onClick={() => setFormats((f) => [...f, { nom: '', duree_heures: '' }])}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  <Plus className="w-3 h-3" />
                  Ajouter un format
                </button>
              </div>
              {formats.length === 0 && (
                <p className="text-xs text-gray-600">
                  Aucun format. Les checkpoints s'appliqueront à tous les formats par défaut.
                </p>
              )}
              {formats.map((fmt, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    placeholder="Nom (ex : 6h, Solo…)"
                    value={fmt.nom}
                    onChange={(e) =>
                      setFormats((prev) => prev.map((f, j) => (j === i ? { ...f, nom: e.target.value } : f)))
                    }
                    className={input}
                  />
                  <input
                    type="number"
                    placeholder="Durée (h)"
                    value={fmt.duree_heures}
                    min={0.5}
                    step={0.5}
                    onChange={(e) =>
                      setFormats((prev) => prev.map((f, j) => (j === i ? { ...f, duree_heures: e.target.value } : f)))
                    }
                    className={`${input} w-28`}
                  />
                  <button
                    type="button"
                    onClick={() => removeFormat(i)}
                    className="text-gray-500 hover:text-red-400 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <hr className="border-gray-800" />
              <p className="text-xs text-gray-500 uppercase tracking-wider">Dévoilement progressif</p>
              <Field label="Dévoilement départ (J-7) *">
                <input type="datetime-local" name="devoilement_depart" value={form.devoilement_depart} onChange={handleChange} required className={input} />
              </Field>
              <Field label="Dévoilement checkpoints (J-48h) *">
                <input type="datetime-local" name="devoilement_checkpoints" value={form.devoilement_checkpoints} onChange={handleChange} required className={input} />
              </Field>
              <Field label="Dévoilement points (J-24h) *">
                <input type="datetime-local" name="devoilement_points" value={form.devoilement_points} onChange={handleChange} required className={input} />
              </Field>
              <Field label="Gel classement (T-1h) *">
                <input type="datetime-local" name="gel_classement" value={form.gel_classement} onChange={handleChange} required className={input} />
              </Field>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
                >
                  {saving
                    ? (editingId ? 'Enregistrement…' : 'Création…')
                    : (editingId ? 'Enregistrer les modifications' : 'Créer l\'édition')}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const input = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-400">{label}</label>
      {children}
    </div>
  );
}
