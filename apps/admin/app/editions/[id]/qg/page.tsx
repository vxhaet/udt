'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch, type PendingValidation, type ConfigEdition, type CheckpointAdmin } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import ValidationCard from '@/components/ValidationCard';
import { Bell, MapPin, Loader2, X, Timer } from 'lucide-react';

export default function QGPage({ params }: { params: { id: string } }) {
  const [validations, setValidations] = useState<PendingValidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Config éphémère
  const [ephemereConfig, setEphemereConfig] = useState<Pick<ConfigEdition, 'ephemere_qg_duree_minutes' | 'ephemere_qg_points_defaut'>>({
    ephemere_qg_duree_minutes: 30,
    ephemere_qg_points_defaut: 10,
  });

  // Checkpoint éphémère actif
  const [activeEphemere, setActiveEphemere] = useState<{ id: string; expiresAt: Date } | null>(null);
  const [countdown, setCountdown] = useState('');
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Modal création éphémère
  const [ephemereModal, setEphemereModal] = useState(false);
  const [ephemerePoints, setEphemerePoints] = useState('10');
  const [ephemereNom, setEphemereNom] = useState('');
  const [ephemereCreating, setEphemereCreating] = useState(false);
  const [ephemereError, setEphemereError] = useState('');

  // Charger validations + config
  useEffect(() => {
    Promise.all([
      apiFetch<PendingValidation[]>(`/validations/pending?editionId=${params.id}`),
      apiFetch<ConfigEdition>(`/editions/${params.id}/config`),
    ])
      .then(([v, cfg]) => {
        setValidations(v);
        setEphemereConfig({
          ephemere_qg_duree_minutes: cfg.ephemere_qg_duree_minutes,
          ephemere_qg_points_defaut: cfg.ephemere_qg_points_defaut,
        });
        setEphemerePoints(String(cfg.ephemere_qg_points_defaut));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  // Countdown
  useEffect(() => {
    if (!activeEphemere) { setCountdown(''); return; }
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      const remaining = Math.max(0, activeEphemere.expiresAt.getTime() - Date.now());
      if (remaining === 0) {
        setActiveEphemere(null);
        setCountdown('');
        if (countdownRef.current) clearInterval(countdownRef.current);
        return;
      }
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [activeEphemere]);

  // Socket temps réel
  useEffect(() => {
    const socket = getSocket();
    socket.connect();
    socket.emit('join:edition', params.id);

    socket.on('validation:pending', (data: { validation: PendingValidation }) => {
      setValidations((prev) => [data.validation, ...prev]);
    });

    // Retirer de la liste quand traitée par un autre admin
    socket.on('validation:approved', (data: { validation: { id: string } }) => {
      setValidations((prev) => prev.filter((v) => v.id !== data.validation.id));
    });

    socket.on('validation:rejected', (data: { validation: { id: string } }) => {
      setValidations((prev) => prev.filter((v) => v.id !== data.validation.id));
    });

    socket.on('checkpoint:expired', (data: { checkpointId: string }) => {
      setActiveEphemere((prev) => (prev?.id === data.checkpointId ? null : prev));
    });

    return () => {
      socket.off('validation:pending');
      socket.off('validation:approved');
      socket.off('validation:rejected');
      socket.off('checkpoint:expired');
    };
  }, [params.id]);

  const handleApprove = useCallback(async (id: string, points: number) => {
    await apiFetch(`/validations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ statut: 'APPROUVE', points_accordes: points }),
    });
    setValidations((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const handleCreateEphemere = useCallback(async () => {
    setEphemereCreating(true);
    setEphemereError('');
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10_000 }),
      );
      const cp = await apiFetch<CheckpointAdmin>(`/editions/${params.id}/checkpoints/ephemere`, {
        method: 'POST',
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          points: parseInt(ephemerePoints, 10),
          nom: ephemereNom || undefined,
        }),
      });
      if (cp.expires_at) {
        setActiveEphemere({ id: cp.id, expiresAt: new Date(cp.expires_at) });
      }
      setEphemereModal(false);
      setEphemereNom('');
      setEphemerePoints(String(ephemereConfig.ephemere_qg_points_defaut));
    } catch (e: unknown) {
      setEphemereError(
        e instanceof GeolocationPositionError
          ? 'Impossible d\'obtenir la position GPS'
          : (e as Error).message,
      );
    } finally {
      setEphemereCreating(false);
    }
  }, [params.id, ephemerePoints, ephemereNom]);

  const handleDeactivateEphemere = useCallback(async () => {
    if (!activeEphemere) return;
    try {
      await apiFetch(`/editions/${params.id}/checkpoints/ephemere/${activeEphemere.id}/deactivate`, {
        method: 'PATCH',
      });
      setActiveEphemere(null);
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }, [params.id, activeEphemere]);

  const handleReject = useCallback(async (id: string, comment: string) => {
    await apiFetch(`/validations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ statut: 'REJETE', commentaire_admin: comment }),
    });
    setValidations((prev) => prev.filter((v) => v.id !== id));
  }, []);

  if (loading) {
    return <div className="text-center py-16 text-gray-500">Chargement…</div>;
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Bell className="w-5 h-5 text-gray-400" />
        <h2 className="font-semibold text-gray-200">Validations en attente</h2>
        {validations.length > 0 && (
          <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {validations.length}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setEphemereModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-orange-600/20 text-orange-400 border border-orange-600/30 hover:bg-orange-600/30 transition-colors"
          >
            <MapPin className="w-3.5 h-3.5" />
            CP éphémère
          </button>
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Temps réel
          </span>
        </span>
      </div>

      {/* Bandeau CP éphémère actif */}
      {activeEphemere && countdown && (
        <div className="flex items-center justify-between bg-orange-600/15 border border-orange-600/30 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-sm text-orange-300 font-medium">QG éphémère actif</span>
            <span className="flex items-center gap-1 text-orange-400 font-mono text-sm">
              <Timer className="w-3.5 h-3.5" />
              expire dans {countdown}
            </span>
          </div>
          <button
            onClick={handleDeactivateEphemere}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 bg-red-900/20 px-2 py-1 rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Désactiver
          </button>
        </div>
      )}

      {/* Modal checkpoint éphémère */}
      {ephemereModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm mx-4 space-y-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-400" />
              Checkpoint éphémère QG
            </h3>
            <p className="text-xs text-gray-500">
              La position GPS actuelle de votre appareil sera utilisée comme coordonnées du checkpoint.
              Il sera immédiatement diffusé aux participants et expirera automatiquement dans{' '}
              <span className="text-orange-400 font-medium">{ephemereConfig.ephemere_qg_duree_minutes} minutes</span>.
            </p>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nom (optionnel)</label>
              <input
                className="input w-full"
                placeholder="CP Éphémère QG…"
                value={ephemereNom}
                onChange={(e) => setEphemereNom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Points</label>
              <input
                className="input w-full"
                type="number"
                min={1}
                value={ephemerePoints}
                onChange={(e) => setEphemerePoints(e.target.value)}
              />
            </div>
            {ephemereError && (
              <p className="text-sm text-red-400">{ephemereError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setEphemereModal(false); setEphemereError(''); }}
                className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700"
              >
                Annuler
              </button>
              <button
                onClick={handleCreateEphemere}
                disabled={ephemereCreating}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-50"
              >
                {ephemereCreating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Créer et diffuser
              </button>
            </div>
          </div>
        </div>
      )}

      {validations.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Bell className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>Aucune validation en attente</p>
          <p className="text-xs mt-1">Elles apparaîtront ici en temps réel</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {validations.map((v) => (
            <ValidationCard
              key={v.id}
              validation={v}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
