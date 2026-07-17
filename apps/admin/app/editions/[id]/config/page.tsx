'use client';

import { useEffect, useState } from 'react';
import { apiFetch, type ConfigEdition } from '@/lib/api';
import { Settings, Save, CheckCircle } from 'lucide-react';

const FLAGS: {
  key: keyof Omit<ConfigEdition, 'edition_id'>;
  label: string;
  description: string;
}[] = [
  {
    key: 'devoilement_progressif_actif',
    label: 'Dévoilement progressif',
    description: 'Active les timestamps de dévoilement (départ, checkpoints, points). Si désactivé, tout est visible immédiatement.',
  },
  {
    key: 'gel_classement_actif',
    label: 'Gel du classement',
    description: 'Active le gel automatique du classement côté participants à l\'heure définie. Les admins voient toujours tout.',
  },
  {
    key: 'checkpoints_disparaissent_actif',
    label: 'Checkpoints éphémères (disparaît après passage)',
    description: 'Active la règle "disparait_apres_passage" : le premier à valider un CP le fait disparaître pour les autres.',
  },
  {
    key: 'checkpoint_suivant_impose_actif',
    label: 'Règle IMPOSE_SUIVANT',
    description: 'Active la contrainte de CP obligatoire suivant. Si désactivé, la règle IMPOSE_SUIVANT est ignorée.',
  },
  {
    key: 'itineraires_thematiques_actif',
    label: 'Itinéraires thématiques',
    description: 'Active les bonus de complétion d\'itinéraires. Si désactivé, les itinéraires ne rapportent pas de points.',
  },
  {
    key: 'checkpoint_ephemere_qg_actif',
    label: 'Checkpoint éphémère QG',
    description: 'Permet au QG de créer des checkpoints éphémères à la volée pendant la course.',
  },
  {
    key: 'segments_strava_actif',
    label: 'Segments Strava',
    description: 'Active l\'intégration Strava et l\'attribution de points sur les segments.',
  },
];

const DEFAULT_CONFIG: Omit<ConfigEdition, 'edition_id'> = {
  checkpoints_disparaissent_actif: true,
  checkpoint_suivant_impose_actif: true,
  itineraires_thematiques_actif: true,
  checkpoint_ephemere_qg_actif: true,
  segments_strava_actif: true,
  gel_classement_actif: true,
  devoilement_progressif_actif: true,
  ephemere_qg_duree_minutes: 1,
  ephemere_qg_points_defaut: 10,
};

export default function ConfigPage({ params }: { params: { id: string } }) {
  const [config, setConfig] = useState<Omit<ConfigEdition, 'edition_id'>>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<ConfigEdition>(`/editions/${params.id}/config`)
      .then(({ edition_id: _id, ...rest }) => setConfig(rest))
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const result = await apiFetch<ConfigEdition>(`/editions/${params.id}/config`, {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      const { edition_id: _id, ...rest } = result;
      setConfig(rest);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-16 text-center text-gray-500">Chargement…</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-200 flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-400" />
          Configuration de l'édition
        </h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {saved ? (
            <>
              <CheckCircle className="w-4 h-4" />
              Enregistré
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {FLAGS.map(({ key, label, description }) => (
          <div
            key={key}
            className="flex items-start gap-4 bg-gray-900 border border-gray-800 rounded-xl px-5 py-4"
          >
            <button
              role="switch"
              aria-checked={config[key as keyof typeof config] as boolean}
              onClick={() => setConfig((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
              className={`relative shrink-0 w-10 h-6 rounded-full transition-colors mt-0.5 ${
                config[key as keyof typeof config] ? 'bg-blue-600' : 'bg-gray-700'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  config[key as keyof typeof config] ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <div>
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Section QG éphémère — paramètres numériques */}
      <div className="bg-gray-900 border border-orange-900/40 rounded-xl px-5 py-4 space-y-4">
        <p className="text-sm font-medium text-orange-300 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
          Checkpoint éphémère QG
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-xs text-gray-400">Durée de vie (minutes)</label>
            <input
              type="number"
              min={1}
              max={1440}
              value={config.ephemere_qg_duree_minutes}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  ephemere_qg_duree_minutes: Math.max(1, parseInt(e.target.value, 10) || 1),
                }))
              }
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
            />
            <p className="text-xs text-gray-600">Après ce délai, le CP expire automatiquement</p>
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-gray-400">Points par défaut</label>
            <input
              type="number"
              min={0}
              value={config.ephemere_qg_points_defaut}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  ephemere_qg_points_defaut: Math.max(0, parseInt(e.target.value, 10) || 0),
                }))
              }
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
            />
            <p className="text-xs text-gray-600">Pré-rempli dans le modal de création QG</p>
          </div>
        </div>
      </div>
    </div>
  );
}
