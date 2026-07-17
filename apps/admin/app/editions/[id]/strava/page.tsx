'use client';

import { useEffect, useState } from 'react';
import { apiFetch, type SegmentStrava } from '@/lib/api';
import { Activity, Plus, Trash2, RefreshCw, Clock, Trophy } from 'lucide-react';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const MEDAL = ['🥇', '🥈', '🥉'];

interface SegmentForm {
  strava_segment_id: string;
  nom: string;
  description: string;
  points_premier: string;
  points_second: string;
  points_troisieme: string;
}

const EMPTY_FORM: SegmentForm = {
  strava_segment_id: '',
  nom: '',
  description: '',
  points_premier: '10',
  points_second: '6',
  points_troisieme: '3',
};

export default function StravaPage({ params }: { params: { id: string } }) {
  const [segments, setSegments] = useState<SegmentStrava[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SegmentForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiFetch<SegmentStrava[]>(`/strava/segments/${params.id}`);
    setSegments(data);
  }

  useEffect(() => {
    load().catch(console.error).finally(() => setLoading(false));
  }, [params.id]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await apiFetch(`/strava/sync/${params.id}`, { method: 'POST' });
      await load();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleAddSegment() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/strava/segments/${params.id}`, {
        method: 'POST',
        body: JSON.stringify({
          strava_segment_id: form.strava_segment_id.trim(),
          nom: form.nom.trim(),
          description: form.description.trim() || undefined,
          points_premier: Number(form.points_premier),
          points_second: Number(form.points_second),
          points_troisieme: Number(form.points_troisieme),
        }),
      });
      await load();
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(segmentId: string) {
    if (!confirm('Supprimer ce segment et toutes ses performances ?')) return;
    try {
      await apiFetch(`/strava/segments/${segmentId}`, { method: 'DELETE' });
      setSegments((prev) => prev.filter((s) => s.id !== segmentId));
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">Chargement…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-orange-500" />
          <h2 className="text-lg font-semibold text-white">Segments Strava</h2>
          <span className="badge bg-gray-700 text-gray-300">{segments.length}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sync…' : 'Sync maintenant'}
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Ajouter un segment
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Formulaire ajout */}
      {showForm && (
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-white">Nouveau segment</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">ID Strava *</label>
              <input
                className="input w-full"
                placeholder="Ex : 12345678"
                value={form.strava_segment_id}
                onChange={(e) => setForm((f) => ({ ...f, strava_segment_id: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Nom *</label>
              <input
                className="input w-full"
                placeholder="Ex : Montée du Col de la Luère"
                value={form.nom}
                onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-gray-400">Description</label>
              <input
                className="input w-full"
                placeholder="Optionnel"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Points 1er</label>
              <input
                type="number"
                className="input w-full"
                value={form.points_premier}
                onChange={(e) => setForm((f) => ({ ...f, points_premier: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Points 2e</label>
              <input
                type="number"
                className="input w-full"
                value={form.points_second}
                onChange={(e) => setForm((f) => ({ ...f, points_second: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Points 3e</label>
              <input
                type="number"
                className="input w-full"
                value={form.points_troisieme}
                onChange={(e) => setForm((f) => ({ ...f, points_troisieme: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
              className="btn btn-secondary text-sm"
            >
              Annuler
            </button>
            <button
              onClick={handleAddSegment}
              disabled={saving || !form.strava_segment_id || !form.nom}
              className="btn btn-primary text-sm"
            >
              {saving ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}

      {/* Liste des segments */}
      {segments.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucun segment Strava configuré</p>
          <p className="text-xs text-gray-600 mt-1">
            Ajoutez des segments pour attribuer des points aux performances chronométrées.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {segments.map((segment) => (
            <div key={segment.id} className="card space-y-4">
              {/* Segment header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{segment.nom}</h3>
                    <a
                      href={`https://www.strava.com/segments/${segment.strava_segment_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-orange-400 hover:text-orange-300"
                    >
                      #{segment.strava_segment_id}
                    </a>
                  </div>
                  {segment.description && (
                    <p className="text-xs text-gray-400 mt-0.5">{segment.description}</p>
                  )}
                  <div className="flex items-center gap-1 mt-2">
                    <Trophy className="w-3 h-3 text-yellow-400" />
                    <span className="text-xs text-gray-400">
                      🥇 {segment.points_premier} pts · 🥈 {segment.points_second} pts · 🥉 {segment.points_troisieme} pts
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(segment.id)}
                  className="text-gray-500 hover:text-red-400 transition-colors p-1"
                  title="Supprimer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Classement */}
              {segment.performances.length > 0 ? (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-medium">
                    Classement ({segment.performances.length} participant{segment.performances.length > 1 ? 's' : ''})
                  </p>
                  <div className="space-y-1">
                    {segment.performances.map((perf, idx) => (
                      <div
                        key={`${perf.participant.nom}-${perf.participant.prenom}`}
                        className="flex items-center justify-between bg-gray-900/60 rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-5 text-center text-base">
                            {idx < 3 ? MEDAL[idx] : <span className="text-gray-500 text-sm">{perf.classement}</span>}
                          </span>
                          <div>
                            <span className="text-sm text-white font-medium">
                              {perf.participant.prenom} {perf.participant.nom}
                            </span>
                            <span className="text-xs text-gray-400 ml-2">
                              {perf.participant.equipe.nom}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="w-3 h-3" />
                            {formatTime(perf.temps_secondes)}
                          </span>
                          <span className="text-sm font-bold text-yellow-400 w-14 text-right">
                            +{perf.points_gagnes} pts
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-600">Aucune performance synchronisée.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
