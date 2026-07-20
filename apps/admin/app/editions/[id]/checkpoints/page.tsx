'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { apiFetch, type CheckpointAdmin, type ItineraireThematique, type FormatCourse } from '@/lib/api';
import type { CheckpointMapProps } from '@/components/CheckpointMap';
import {
  Plus, Trash2, Pencil, Upload, Check, X, Route, ChevronDown, ChevronUp,
  HelpCircle, FileSpreadsheet,
} from 'lucide-react';
import clsx from 'clsx';

const CheckpointMap = dynamic<CheckpointMapProps>(
  () => import('@/components/CheckpointMap'),
  { ssr: false },
);

// ─────────────────────────────────────────────────────────────────────────────
// Types locaux
// ─────────────────────────────────────────────────────────────────────────────

type CpType = 'NORMAL' | 'DEPART' | 'ARRIVEE' | 'EPHEMERE_QG';

type FormData = {
  nom: string;
  description: string;
  latitude: string;
  longitude: string;
  points: string;
  rayon_validation_metres: string;
  type_validation: 'AUTO' | 'MANUELLE' | 'MIXTE';
  disparait_apres_passage: boolean;
  type: CpType;
  tous_formats: boolean;
  format_course_ids: string[];
};

const DEFAULT_FORM: FormData = {
  nom: '',
  description: '',
  latitude: '',
  longitude: '',
  points: '10',
  rayon_validation_metres: '50',
  type_validation: 'AUTO',
  disparait_apres_passage: false,
  type: 'NORMAL',
  tous_formats: true,
  format_course_ids: [],
};

function formToPayload(f: FormData) {
  return {
    nom: f.nom,
    description: f.description || undefined,
    latitude: parseFloat(f.latitude),
    longitude: parseFloat(f.longitude),
    points: parseInt(f.points, 10),
    rayon_validation_metres: parseInt(f.rayon_validation_metres, 10),
    type_validation: f.type_validation,
    disparait_apres_passage: f.disparait_apres_passage,
    type: f.type,
    tous_formats: f.tous_formats,
    format_course_ids: f.tous_formats ? [] : f.format_course_ids,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export default function CheckpointsPage({ params }: { params: { id: string } }) {
  const [checkpoints, setCheckpoints] = useState<CheckpointAdmin[]>([]);
  const [itineraires, setItineraires] = useState<ItineraireThematique[]>([]);
  const [formats, setFormats] = useState<FormatCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Formulaire CP
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [pendingMarker, setPendingMarker] = useState<{ lat: number; lng: number } | null>(null);

  // Formulaire itinéraire
  const [showItinForm, setShowItinForm] = useState(false);
  const [editingItinId, setEditingItinId] = useState<string | null>(null);
  const [itinForm, setItinForm] = useState({
    nom: '', description: '', points_bonus: '0', actif: true, checkpoint_ids: [] as string[],
  });
  const [itinSaving, setItinSaving] = useState(false);
  const [showItinSection, setShowItinSection] = useState(false);
  const [showExcelHelp, setShowExcelHelp] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [cps, itins, fmts] = await Promise.all([
        apiFetch<CheckpointAdmin[]>(`/editions/${params.id}/checkpoints`),
        apiFetch<ItineraireThematique[]>(`/editions/${params.id}/itineraires`),
        apiFetch<FormatCourse[]>(`/editions/${params.id}/formats`),
      ]);
      setCheckpoints(cps);
      setItineraires(itins);
      setFormats(fmts);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  // ── Checkpoint CRUD ──────────────────────────────────────────────────────

  function startEdit(cp: CheckpointAdmin) {
    setEditingId(cp.id);
    setPendingMarker(null);
    setForm({
      nom: cp.nom,
      description: cp.description ?? '',
      latitude: String(cp.latitude),
      longitude: String(cp.longitude),
      points: String(cp.points),
      rayon_validation_metres: String(cp.rayon_validation_metres),
      type_validation: cp.type_validation,
      disparait_apres_passage: cp.disparait_apres_passage,
      type: cp.type as CpType,
      tous_formats: cp.tous_formats,
      format_course_ids: cp.formats.map((f) => f.id),
    });
    setShowForm(true);
    setFormError('');
  }

  function startCreate() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setShowForm(true);
    setFormError('');
  }

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setPendingMarker({ lat, lng });
    setEditingId(null);
    setForm((prev) => ({ ...prev, latitude: String(lat), longitude: String(lng) }));
    setShowForm(true);
    setFormError('');
  }, []);

  async function saveCheckpoint(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = formToPayload(form);
      if (editingId) {
        const updated = await apiFetch<CheckpointAdmin>(
          `/editions/${params.id}/checkpoints/${editingId}`,
          { method: 'PATCH', body: JSON.stringify(payload) },
        );
        setCheckpoints((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      } else {
        const created = await apiFetch<CheckpointAdmin>(
          `/editions/${params.id}/checkpoints`,
          { method: 'POST', body: JSON.stringify(payload) },
        );
        setCheckpoints((prev) => [...prev, created]);
      }
      setShowForm(false);
      setPendingMarker(null);
    } catch (e: unknown) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCheckpoint(id: string) {
    if (!confirm('Supprimer ce checkpoint ?')) return;
    try {
      await apiFetch(`/editions/${params.id}/checkpoints/${id}`, { method: 'DELETE' });
      setCheckpoints((prev) => prev.filter((c) => c.id !== id));
      setItineraires((prev) =>
        prev.map((itin) => ({
          ...itin,
          checkpoints: itin.checkpoints.filter((c) => c.id !== id),
        })),
      );
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  // ── Import Excel ─────────────────────────────────────────────────────────

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const XLSX = await import('xlsx');
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    let imported = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const cpType = String(row['type'] ?? 'NORMAL').toUpperCase() as CpType;
        const formatCourseRaw = String(row['format_course'] ?? '').trim();
        let tous_formats = true;
        let format_course_ids: string[] = [];
        if (formatCourseRaw && formatCourseRaw.toUpperCase() !== 'TOUS') {
          tous_formats = false;
          const noms = formatCourseRaw.split(',').map((s) => s.trim().toLowerCase());
          format_course_ids = formats
            .filter((f) => noms.includes(f.nom.toLowerCase()))
            .map((f) => f.id);
        }
        const payload = {
          nom: String(row['nom'] ?? row['Nom'] ?? ''),
          latitude: parseFloat(String(row['latitude'] ?? row['Latitude'] ?? '')),
          longitude: parseFloat(String(row['longitude'] ?? row['Longitude'] ?? '')),
          points: parseInt(String(row['points'] ?? row['Points'] ?? '10'), 10),
          rayon_validation_metres: parseInt(
            String(row['rayon_validation_metres'] ?? row['Rayon'] ?? '50'), 10,
          ),
          type_validation: String(
            row['type_validation'] ?? 'AUTO',
          ) as 'AUTO' | 'MANUELLE' | 'MIXTE',
          disparait_apres_passage:
            String(row['disparait_apres_passage'] ?? 'false').toLowerCase() === 'true',
          type: cpType,
          tous_formats,
          format_course_ids,
        };

        if (!payload.nom || isNaN(payload.latitude) || isNaN(payload.longitude)) {
          errors.push(`Ligne ignorée : données invalides`);
          continue;
        }

        const created = await apiFetch<CheckpointAdmin>(
          `/editions/${params.id}/checkpoints`,
          { method: 'POST', body: JSON.stringify(payload) },
        );
        setCheckpoints((prev) => [...prev, created]);
        imported++;
      } catch {
        errors.push(`Erreur sur une ligne`);
      }
    }

    if (errors.length) {
      alert(`${imported} checkpoint(s) importé(s).\nErreurs :\n${errors.join('\n')}`);
    } else {
      alert(`${imported} checkpoint(s) importé(s) avec succès.`);
    }

    e.target.value = '';
  }

  // ── Itinéraire CRUD ──────────────────────────────────────────────────────

  function startCreateItin() {
    setEditingItinId(null);
    setItinForm({ nom: '', description: '', points_bonus: '0', actif: true, checkpoint_ids: [] });
    setShowItinForm(true);
  }

  function startEditItin(itin: ItineraireThematique) {
    setEditingItinId(itin.id);
    setItinForm({
      nom: itin.nom,
      description: itin.description ?? '',
      points_bonus: String(itin.points_bonus),
      actif: itin.actif,
      checkpoint_ids: itin.checkpoints.map((c) => c.id),
    });
    setShowItinForm(true);
  }

  async function saveItin(e: React.FormEvent) {
    e.preventDefault();
    setItinSaving(true);
    try {
      const payload = {
        nom: itinForm.nom,
        description: itinForm.description || undefined,
        points_bonus: parseInt(itinForm.points_bonus, 10),
        actif: itinForm.actif,
        checkpoint_ids: itinForm.checkpoint_ids,
      };
      if (editingItinId) {
        const updated = await apiFetch<ItineraireThematique>(
          `/editions/${params.id}/itineraires/${editingItinId}`,
          { method: 'PATCH', body: JSON.stringify(payload) },
        );
        setItineraires((prev) => prev.map((i) => (i.id === editingItinId ? updated : i)));
      } else {
        const created = await apiFetch<ItineraireThematique>(
          `/editions/${params.id}/itineraires`,
          { method: 'POST', body: JSON.stringify(payload) },
        );
        setItineraires((prev) => [...prev, created]);
      }
      setShowItinForm(false);
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setItinSaving(false);
    }
  }

  async function deleteItin(id: string) {
    if (!confirm('Supprimer cet itinéraire ?')) return;
    try {
      await apiFetch(`/editions/${params.id}/itineraires/${id}`, { method: 'DELETE' });
      setItineraires((prev) => prev.filter((i) => i.id !== id));
    } catch (e: unknown) {
      alert((e as Error).message);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div className="py-16 text-center text-gray-500">Chargement…</div>;
  if (error) return <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-200 flex items-center gap-2">
          <span className="text-white">{checkpoints.length}</span> checkpoint(s)
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowExcelHelp((v) => !v)}
            className="flex items-center gap-1 px-2 py-1.5 text-sm rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
            title="Format du fichier Excel"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} />
          <button
            onClick={startCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouveau checkpoint
          </button>
        </div>
      </div>

      {/* Aide import Excel */}
      {showExcelHelp && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-white flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-green-400" />
              Format du fichier Excel d'import
            </h3>
            <button onClick={() => setShowExcelHelp(false)} className="text-gray-500 hover:text-gray-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-gray-400">
            La première ligne doit contenir les en-têtes de colonnes. Les colonnes obligatoires sont
            {' '}<code className="bg-gray-800 px-1 rounded text-gray-200">nom</code>,
            {' '}<code className="bg-gray-800 px-1 rounded text-gray-200">latitude</code> et
            {' '}<code className="bg-gray-800 px-1 rounded text-gray-200">longitude</code>.
          </p>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs border border-gray-700 rounded-lg overflow-hidden">
              <thead className="bg-gray-800">
                <tr>
                  {['nom', 'latitude', 'longitude', 'points', 'rayon_validation_metres', 'type_validation', 'disparait_apres_passage', 'type', 'format_course'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-gray-300 font-mono">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-800">
                  <td className="px-3 py-2 text-gray-400">Checkpoint A</td>
                  <td className="px-3 py-2 text-gray-400">50.6292</td>
                  <td className="px-3 py-2 text-gray-400">3.0573</td>
                  <td className="px-3 py-2 text-gray-400">10</td>
                  <td className="px-3 py-2 text-gray-400">50</td>
                  <td className="px-3 py-2 text-gray-400">AUTO</td>
                  <td className="px-3 py-2 text-gray-400">false</td>
                  <td className="px-3 py-2 text-gray-400">NORMAL</td>
                  <td className="px-3 py-2 text-gray-400"></td>
                </tr>
                <tr className="border-t border-gray-800 bg-gray-800/30">
                  <td className="px-3 py-2 text-gray-400">Départ 6h</td>
                  <td className="px-3 py-2 text-gray-400">50.6320</td>
                  <td className="px-3 py-2 text-gray-400">3.0601</td>
                  <td className="px-3 py-2 text-gray-400">0</td>
                  <td className="px-3 py-2 text-gray-400">50</td>
                  <td className="px-3 py-2 text-gray-400">AUTO</td>
                  <td className="px-3 py-2 text-gray-400">false</td>
                  <td className="px-3 py-2 text-green-400 font-medium">DEPART</td>
                  <td className="px-3 py-2 text-blue-400 font-mono">6h</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside mt-1">
            <li><code className="text-gray-300">type</code> : <code>NORMAL</code>, <code>DEPART</code>, <code>ARRIVEE</code> ou <code>EPHEMERE_QG</code> (défaut : NORMAL)</li>
            <li><code className="text-gray-300">format_course</code> : <code>TOUS</code> (défaut) ou noms séparés par virgule (ex : <code>6h,12h</code>) — doit correspondre aux formats définis dans l'édition</li>
            <li><code className="text-gray-300">type_validation</code> : <code>AUTO</code>, <code>MANUELLE</code> ou <code>MIXTE</code> (défaut : AUTO)</li>
            <li><code className="text-gray-300">rayon_validation_metres</code> : entre 10 et 500 (défaut : 50)</li>
            <li><code className="text-gray-300">disparait_apres_passage</code> : <code>true</code> ou <code>false</code> (défaut : false)</li>
          </ul>
        </div>
      )}

      {/* Carte */}
      <div className="rounded-xl overflow-hidden border border-gray-800 h-72">
        <CheckpointMap
          checkpoints={checkpoints}
          onMapClick={!editingId ? handleMapClick : undefined}
          pendingMarker={pendingMarker}
        />
      </div>

      {/* Formulaire CP */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h3 className="font-medium text-white mb-4">
            {editingId ? 'Modifier le checkpoint' : 'Nouveau checkpoint'}
          </h3>
          <form onSubmit={saveCheckpoint} className="grid grid-cols-2 gap-4">
            {/* Nom */}
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Nom *</label>
              <input
                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                required
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
              />
            </div>

            {/* Description */}
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Description</label>
              <input
                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            {/* Type de point */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type de point</label>
              <select
                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as CpType })}
              >
                <option value="NORMAL">Normal</option>
                <option value="DEPART">Départ</option>
                <option value="ARRIVEE">Arrivée</option>
                <option value="EPHEMERE_QG">Éphémère QG</option>
              </select>
            </div>

            {/* Formats de course — sélection par checkboxes */}
            {formats.length > 0 && (
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-2">Formats de course</label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.tous_formats}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          tous_formats: e.target.checked,
                          format_course_ids: e.target.checked ? [] : prev.format_course_ids,
                        }))
                      }
                      className="rounded border-gray-600 bg-gray-800 accent-blue-500"
                    />
                    <span className="font-medium">Tous les formats</span>
                  </label>
                  {!form.tous_formats &&
                    formats.map((fmt) => (
                      <label
                        key={fmt.id}
                        className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer pl-5"
                      >
                        <input
                          type="checkbox"
                          checked={form.format_course_ids.includes(fmt.id)}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              format_course_ids: e.target.checked
                                ? [...prev.format_course_ids, fmt.id]
                                : prev.format_course_ids.filter((id) => id !== fmt.id),
                            }))
                          }
                          className="rounded border-gray-600 bg-gray-800 accent-blue-500"
                        />
                        {fmt.nom}
                        <span className="text-gray-500 text-xs">
                          ({fmt.duree_minutes / 60}h)
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            )}

            {/* Latitude */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Latitude * <span className="text-gray-600 font-normal">(-90 à 90)</span>
              </label>
              <input
                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                type="number"
                step="any"
                min={-90}
                max={90}
                placeholder="ex : 50.6292"
                required
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              />
            </div>

            {/* Longitude */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Longitude * <span className="text-gray-600 font-normal">(-180 à 180)</span>
              </label>
              <input
                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                type="number"
                step="any"
                min={-180}
                max={180}
                placeholder="ex : 3.0573"
                required
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
              />
            </div>

            {/* Aide coordonnées */}
            <div className="col-span-2">
              <p className="text-xs text-gray-600 flex items-start gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Sur{' '}
                <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-400 underline">
                  Google Maps
                </a>
                , clic droit sur l'emplacement → les coordonnées apparaissent en premier (ex :{' '}
                <span className="font-mono">50.6292, 3.0573</span>).
                Ou cliquez directement sur la carte ci-dessus.
              </p>
            </div>

            {/* Points + Rayon */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Points *</label>
              <select
                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                required
                value={form.points}
                onChange={(e) => setForm({ ...form, points: e.target.value })}
              >
                {['10', '20', '30', '40', '50'].map((v) => (
                  <option key={v} value={v}>{v} pts</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Rayon de validation (m)</label>
              <input
                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                type="number"
                min={10}
                max={500}
                value={form.rayon_validation_metres}
                onChange={(e) => setForm({ ...form, rayon_validation_metres: e.target.value })}
              />
            </div>

            {/* Type de validation */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Validation</label>
              <select
                className="w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-100 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                value={form.type_validation}
                onChange={(e) => setForm({ ...form, type_validation: e.target.value as FormData['type_validation'] })}
              >
                <option value="AUTO">AUTO — approuvé automatiquement</option>
                <option value="MANUELLE">MANUELLE — approuvé par le QG</option>
                <option value="MIXTE">MIXTE — photo requise, QG valide</option>
              </select>
            </div>

            {/* Disparaît */}
            <div className="flex items-center gap-2 pt-5">
              <input
                id="disparait"
                type="checkbox"
                checked={form.disparait_apres_passage}
                onChange={(e) => setForm({ ...form, disparait_apres_passage: e.target.checked })}
                className="rounded border-gray-600 bg-gray-800 accent-blue-500"
              />
              <label htmlFor="disparait" className="text-sm text-gray-300">
                Disparaît après le 1er passage
              </label>
            </div>
            {formError && (
              <p className="col-span-2 text-sm text-red-400">{formError}</p>
            )}
            <div className="col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowForm(false); setPendingMarker(null); }}
                className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table checkpoints */}
      {checkpoints.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>Aucun checkpoint.</p>
          <p className="text-xs mt-1">Créez-en un ou importez un fichier Excel.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                <th className="text-left py-2 pr-3">#</th>
                <th className="text-left py-2 pr-3">Nom</th>
                <th className="text-left py-2 pr-3">Type</th>
                <th className="text-right py-2 pr-3">Points</th>
                <th className="text-left py-2 pr-3">Validation</th>
                <th className="text-right py-2 pr-3">Rayon</th>
                <th className="text-left py-2 pr-3">Lat / Lng</th>
                <th className="text-left py-2 pr-3">Options</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {checkpoints.map((cp, idx) => (
                <tr key={cp.id} className={clsx('hover:bg-gray-800/30', !cp.actif && 'opacity-40')}>
                  <td className="py-2 pr-3 text-gray-500 text-xs">{cp.ordre_affichage ?? idx + 1}</td>
                  <td className="py-2 pr-3 text-white font-medium">
                    {cp.nom}
                    {!cp.tous_formats && cp.formats.length > 0 && (
                      <span className="ml-1.5 text-xs text-gray-500 font-normal">
                        ({cp.formats.map((f) => f.nom).join(', ')})
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={clsx('badge text-xs', {
                      'bg-blue-500/20 text-blue-400':   cp.type === 'NORMAL',
                      'bg-green-500/20 text-green-400': cp.type === 'DEPART',
                      'bg-red-500/20 text-red-400':     cp.type === 'ARRIVEE',
                      'bg-orange-500/20 text-orange-400': cp.type === 'EPHEMERE_QG',
                    })}>
                      {cp.type === 'NORMAL' ? 'Normal'
                        : cp.type === 'DEPART' ? 'Départ'
                        : cp.type === 'ARRIVEE' ? 'Arrivée'
                        : 'QG éphémère'}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    <span style={{ color: cp.type === 'NORMAL' ? (
                      cp.points >= 50 ? '#7c3aed' : cp.points >= 40 ? '#f97316' : cp.points >= 30 ? '#eab308' : cp.points >= 20 ? '#06b6d4' : '#60a5fa'
                    ) : undefined }} className={cp.type !== 'NORMAL' ? 'text-blue-400' : undefined}>
                      {cp.points}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className={clsx(
                      'badge text-xs',
                      cp.type_validation === 'AUTO' && 'bg-green-500/20 text-green-400',
                      cp.type_validation === 'MANUELLE' && 'bg-yellow-500/20 text-yellow-400',
                      cp.type_validation === 'MIXTE' && 'bg-purple-500/20 text-purple-400',
                    )}>
                      {cp.type_validation}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-400 font-mono">{cp.rayon_validation_metres}m</td>
                  <td className="py-2 pr-3 text-gray-400 font-mono text-xs">
                    {cp.latitude.toFixed(5)}, {cp.longitude.toFixed(5)}
                  </td>
                  <td className="py-2 pr-3 text-gray-500 text-xs">
                    {cp.disparait_apres_passage && <span className="mr-1">disparaît</span>}
                    {!cp.actif && <span>inactif</span>}
                  </td>
                  <td className="py-2 flex gap-1 justify-end">
                    <button
                      onClick={() => startEdit(cp)}
                      className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteCheckpoint(cp.id)}
                      className="p-1.5 rounded hover:bg-red-900/40 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Itinéraires thématiques ─────────────────────────────────────────── */}
      <div className="border border-gray-800 rounded-xl">
        <button
          onClick={() => setShowItinSection((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left"
        >
          <div className="flex items-center gap-2 font-medium text-gray-200">
            <Route className="w-4 h-4 text-gray-400" />
            Itinéraires thématiques
            <span className="text-xs text-gray-500 font-normal">({itineraires.length})</span>
          </div>
          {showItinSection ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>

        {showItinSection && (
          <div className="border-t border-gray-800 p-5 space-y-4">
            <div className="flex justify-end">
              <button
                onClick={startCreateItin}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500"
              >
                <Plus className="w-4 h-4" />
                Nouvel itinéraire
              </button>
            </div>

            {/* Formulaire itinéraire */}
            {showItinForm && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <form onSubmit={saveItin} className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Nom *</label>
                    <input
                      className="input w-full"
                      required
                      value={itinForm.nom}
                      onChange={(e) => setItinForm({ ...itinForm, nom: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Description</label>
                    <input
                      className="input w-full"
                      value={itinForm.description}
                      onChange={(e) => setItinForm({ ...itinForm, description: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Points bonus</label>
                      <input
                        className="input w-full"
                        type="number"
                        min={0}
                        value={itinForm.points_bonus}
                        onChange={(e) => setItinForm({ ...itinForm, points_bonus: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end pb-1 gap-2">
                      <input
                        id="itin-actif"
                        type="checkbox"
                        checked={itinForm.actif}
                        onChange={(e) => setItinForm({ ...itinForm, actif: e.target.checked })}
                        className="rounded border-gray-600"
                      />
                      <label htmlFor="itin-actif" className="text-sm text-gray-300">Actif</label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-2">Checkpoints inclus</label>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {checkpoints.filter((c) => c.type !== 'EPHEMERE_QG').map((cp) => (
                        <label key={cp.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white">
                          <input
                            type="checkbox"
                            checked={itinForm.checkpoint_ids.includes(cp.id)}
                            onChange={(e) => {
                              setItinForm((prev) => ({
                                ...prev,
                                checkpoint_ids: e.target.checked
                                  ? [...prev.checkpoint_ids, cp.id]
                                  : prev.checkpoint_ids.filter((id) => id !== cp.id),
                              }));
                            }}
                            className="rounded border-gray-600"
                          />
                          {cp.nom} <span className="text-gray-500 text-xs">({cp.points} pts)</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowItinForm(false)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={itinSaving}
                      className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      {itinSaving ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Liste itinéraires */}
            {itineraires.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Aucun itinéraire thématique.</p>
            ) : (
              <div className="space-y-2">
                {itineraires.map((itin) => (
                  <div key={itin.id} className={clsx(
                    'bg-gray-800/40 border rounded-lg px-4 py-3',
                    itin.actif ? 'border-gray-700' : 'border-gray-800 opacity-50',
                  )}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white text-sm">{itin.nom}</span>
                          {itin.actif ? (
                            <span className="flex items-center gap-1 text-xs text-green-400"><Check className="w-3 h-3" />actif</span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-gray-500"><X className="w-3 h-3" />inactif</span>
                          )}
                          <span className="text-xs text-blue-400 font-mono">+{itin.points_bonus} pts</span>
                        </div>
                        {itin.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{itin.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {itin.checkpoints.map((cp) => (
                            <span key={cp.id} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                              {cp.nom}
                            </span>
                          ))}
                          {itin.checkpoints.length === 0 && (
                            <span className="text-xs text-gray-600">Aucun checkpoint</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => startEditItin(itin)}
                          className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteItin(itin.id)}
                          className="p-1.5 rounded hover:bg-red-900/40 text-gray-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
