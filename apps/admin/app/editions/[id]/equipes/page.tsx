'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, X, Copy, Search, Check } from 'lucide-react';
import { apiFetch, type FormatCourse } from '@/lib/api';

interface Participant {
  id: string;
  nom: string;
  prenom: string;
  email: string;
}

interface Equipe {
  id: string;
  nom: string;
  code_acces: string;
  statut: string;
  score_total: number;
  format_course: FormatCourse | null;
  participants: Participant[];
}

interface Checkpoint {
  id: string;
  nom: string;
  points: number;
  type: string;
  actif: boolean;
}

interface ValidationInfo {
  checkpoint_id: string;
}

const input = 'w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 px-3 py-2 text-sm focus:outline-none focus:border-blue-500';

export default function EquipesPage({ params }: { params: { id: string } }) {
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [formats, setFormats] = useState<FormatCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searchEquipe, setSearchEquipe] = useState('');

  // Validation manuelle
  const [selectedEquipe, setSelectedEquipe] = useState<Equipe | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [equipeValidations, setEquipeValidations] = useState<Set<string>>(new Set());
  const [searchCp, setSearchCp] = useState('');
  const [validating, setValidating] = useState<string | null>(null);

  const [form, setForm] = useState({
    nom_equipe: '',
    format_course_id: '',
    p1_prenom: '', p1_nom: '', p1_email: '',
    p2_prenom: '', p2_nom: '', p2_email: '',
    p3_prenom: '', p3_nom: '', p3_email: '',
    p4_prenom: '', p4_nom: '', p4_email: '',
  });

  const load = useCallback(async () => {
    try {
      const [eqs, fmts] = await Promise.all([
        apiFetch<Equipe[]>(`/editions/${params.id}/equipes`),
        apiFetch<FormatCourse[]>(`/editions/${params.id}/formats`),
      ]);
      setEquipes(eqs);
      setFormats(fmts);
    } catch {
      try {
        const fmts = await apiFetch<FormatCourse[]>(`/editions/${params.id}/formats`);
        setFormats(fmts);
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  async function openEquipeDetail(eq: Equipe) {
    setSelectedEquipe(eq);
    setSearchCp('');
    try {
      const [cps, vals] = await Promise.all([
        apiFetch<Checkpoint[]>(`/editions/${params.id}/checkpoints`),
        apiFetch<{ validations: Array<{ checkpointNom: string; pointsAccordes: number; validatedAt: string }> }>(`/equipes/${eq.id}/validations`),
      ]);
      setCheckpoints(cps);
      const validatedIds = new Set<string>();
      // Match by checkpoint name since we don't have checkpoint_id in the response
      for (const v of vals.validations) {
        const cp = cps.find((c) => c.nom === v.checkpointNom);
        if (cp) validatedIds.add(cp.id);
      }
      setEquipeValidations(validatedIds);
    } catch {}
  }

  async function validateManually(cp: Checkpoint) {
    if (!selectedEquipe) return;
    if (!confirm(`Valider "${cp.nom}" (${cp.points} pts) pour l'equipe "${selectedEquipe.nom}" ?`)) return;
    setValidating(cp.id);
    try {
      await apiFetch('/validations/admin', {
        method: 'POST',
        body: JSON.stringify({ checkpointId: cp.id, equipeId: selectedEquipe.id }),
      });
      setEquipeValidations((prev) => new Set([...prev, cp.id]));
      // Update score locally
      setEquipes((prev) => prev.map((e) =>
        e.id === selectedEquipe.id ? { ...e, score_total: e.score_total + cp.points } : e
      ));
      setSelectedEquipe((prev) => prev ? { ...prev, score_total: prev.score_total + cp.points } : null);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setValidating(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const participants = [
        { prenom: form.p1_prenom, nom: form.p1_nom, email: form.p1_email },
        { prenom: form.p2_prenom, nom: form.p2_nom, email: form.p2_email },
        { prenom: form.p3_prenom, nom: form.p3_nom, email: form.p3_email },
        { prenom: form.p4_prenom, nom: form.p4_nom, email: form.p4_email },
      ].filter((p) => p.email.trim());

      if (participants.length === 0) throw new Error('Au moins un participant requis');

      const body: Record<string, unknown> = { nom_equipe: form.nom_equipe, participants };
      if (form.format_course_id) body.format_course_id = form.format_course_id;

      const data = await apiFetch<{ code_acces: string }>(`/inscriptions/${params.id}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      alert(`Equipe inscrite ! Code: ${data.code_acces}\nUn email a ete envoye a chaque participant.`);
      setShowForm(false);
      setForm({
        nom_equipe: '', format_course_id: formats[0]?.id ?? '',
        p1_prenom: '', p1_nom: '', p1_email: '',
        p2_prenom: '', p2_nom: '', p2_email: '',
        p3_prenom: '', p3_nom: '', p3_email: '',
        p4_prenom: '', p4_nom: '', p4_email: '',
      });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteEquipe(id: string, nom: string) {
    if (!confirm(`Supprimer l'equipe "${nom}" et tous ses participants ?`)) return;
    try {
      await apiFetch(`/editions/${params.id}/equipes/${id}`, { method: 'DELETE' });
      setEquipes((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  if (loading) return <div className="py-16 text-center text-gray-500">Chargement...</div>;

  const filteredEquipes = searchEquipe
    ? equipes.filter((e) => e.nom.toLowerCase().includes(searchEquipe.toLowerCase()))
    : equipes;

  const filteredCps = searchCp
    ? checkpoints.filter((c) => c.nom.toLowerCase().includes(searchCp.toLowerCase()))
    : checkpoints;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-200">
          <span className="text-white">{equipes.length}</span> equipe(s)
        </h2>
        <button
          onClick={() => { setShowForm(true); setError(''); setForm((f) => ({ ...f, format_course_id: formats[0]?.id ?? '' })); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Inscrire une equipe
        </button>
      </div>

      {/* Recherche equipe */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          className="w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          placeholder="Rechercher une equipe..."
          value={searchEquipe}
          onChange={(e) => setSearchEquipe(e.target.value)}
        />
      </div>

      {/* Formulaire d'inscription */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-white">Inscrire une equipe</h3>
            <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nom de l equipe *</label>
                <input className={input} required value={form.nom_equipe} onChange={(e) => setForm({ ...form, nom_equipe: e.target.value })} />
              </div>
              {formats.length > 0 && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Format *</label>
                  <select className={input} value={form.format_course_id} onChange={(e) => setForm({ ...form, format_course_id: e.target.value })}>
                    {formats.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>
                </div>
              )}
            </div>
            {[1, 2, 3, 4].map((n) => {
              const pre = `p${n}_` as const;
              return (
                <div key={n}>
                  <label className="block text-xs text-gray-400 mb-1">Participant {n} {n === 1 ? '*' : '(optionnel)'}</label>
                  <div className="grid grid-cols-3 gap-2">
                    <input className={input} placeholder="Prenom" value={(form as any)[`${pre}prenom`]} onChange={(e) => setForm({ ...form, [`${pre}prenom`]: e.target.value })} required={n === 1} />
                    <input className={input} placeholder="Nom" value={(form as any)[`${pre}nom`]} onChange={(e) => setForm({ ...form, [`${pre}nom`]: e.target.value })} required={n === 1} />
                    <input className={input} placeholder="Email" type="email" value={(form as any)[`${pre}email`]} onChange={(e) => setForm({ ...form, [`${pre}email`]: e.target.value })} required={n === 1} />
                  </div>
                </div>
              );
            })}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700">Annuler</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50">
                {saving ? 'Inscription...' : 'Inscrire et envoyer les emails'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste des equipes */}
      {filteredEquipes.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {searchEquipe ? 'Aucune equipe trouvee.' : 'Aucune equipe inscrite.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEquipes.map((eq) => (
            <div key={eq.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => openEquipeDetail(eq)} className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-white">{eq.nom}</span>
                    {eq.format_course && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">{eq.format_course.nom}</span>
                    )}
                    <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{eq.statut}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                    <span className="font-mono text-gray-300">{eq.code_acces}</span>
                    <span>{eq.score_total} pts</span>
                    <span>{eq.participants.length} membre(s)</span>
                  </div>
                  <div className="space-y-0.5">
                    {eq.participants.map((p) => (
                      <div key={p.id} className="text-xs text-gray-400">
                        {p.prenom} {p.nom} · <span className="text-gray-500">{p.email}</span>
                      </div>
                    ))}
                  </div>
                </button>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => navigator.clipboard.writeText(eq.code_acces).catch(() => {})}
                    className="p-1.5 rounded hover:bg-gray-700 text-gray-500 hover:text-white transition-colors"
                    title="Copier le code"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteEquipe(eq.id, eq.nom)}
                    className="p-1.5 rounded hover:bg-red-900/40 text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal validation manuelle */}
      {selectedEquipe && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSelectedEquipe(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b border-gray-800 shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-white text-lg">{selectedEquipe.nom}</h3>
                  <p className="text-sm text-gray-400">{selectedEquipe.score_total} pts · {selectedEquipe.format_course?.nom ?? ''}</p>
                </div>
                <button onClick={() => setSelectedEquipe(null)} className="text-gray-500 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Recherche checkpoint */}
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Rechercher un checkpoint..."
                  value={searchCp}
                  onChange={(e) => setSearchCp(e.target.value)}
                />
              </div>
            </div>

            {/* Liste checkpoints */}
            <div className="flex-1 overflow-auto p-3 space-y-1">
              {filteredCps.map((cp) => {
                const isValidated = equipeValidations.has(cp.id);
                return (
                  <div
                    key={cp.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isValidated ? 'opacity-40' : 'hover:bg-gray-800/50'}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isValidated ? 'text-gray-500 line-through' : 'text-white'}`}>
                        {cp.nom}
                      </p>
                      <p className="text-xs text-gray-500">{cp.points} pts · {cp.type}</p>
                    </div>
                    {isValidated ? (
                      <span className="text-xs text-green-400 flex items-center gap-1 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        Valide
                      </span>
                    ) : (
                      <button
                        onClick={() => validateManually(cp)}
                        disabled={validating === cp.id}
                        className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                      >
                        {validating === cp.id ? '...' : 'Valider'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
