'use client';

import { useEffect, useState, useMemo } from 'react';
import { apiFetch, type ClassementEntry } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import ClassementTable from '@/components/ClassementTable';
import { RefreshCw } from 'lucide-react';

export default function ClassementPage({ params }: { params: { id: string } }) {
  const [classement, setClassement] = useState<ClassementEntry[]>([]);
  const [gelActif, setGelActif] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);

  async function fetchClassement() {
    const data = await apiFetch<ClassementEntry[]>(`/editions/${params.id}/classement`);
    setClassement(data);
    setLastUpdate(new Date());
  }

  const formats = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of classement) {
      if (e.format_course && !seen.has(e.format_course.id)) {
        seen.set(e.format_course.id, e.format_course.nom);
      }
    }
    return Array.from(seen.entries()).map(([id, nom]) => ({ id, nom }));
  }, [classement]);

  const filtered = useMemo(() => {
    if (!selectedFormat) return classement;
    return classement
      .filter((e) => e.format_course?.id === selectedFormat)
      .map((e, i) => ({ ...e, rang: i + 1 }));
  }, [classement, selectedFormat]);

  useEffect(() => {
    fetchClassement().catch(console.error).finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    const socket = getSocket();
    socket.connect();
    socket.emit('join:edition', params.id);

    // Recalcul du classement à chaque validation approuvée
    socket.on('validation:approved', () => {
      fetchClassement().catch(console.error);
    });

    // Détecter le gel via l'événement checkpoint:revealed
    socket.on('checkpoint:revealed', () => {
      // On recharge pour vérifier si le gel est actif côté server
    });

    return () => {
      socket.off('validation:approved');
      socket.off('checkpoint:revealed');
    };
  }, [params.id]);

  if (loading) {
    return <div className="text-center py-16 text-gray-500">Chargement…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-200">Classement</h2>
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Temps réel
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-gray-500">
              Mis à jour {lastUpdate.toLocaleTimeString('fr-FR')}
            </span>
          )}
          <button
            onClick={() => fetchClassement().catch(console.error)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Actualiser
          </button>
        </div>
      </div>

      {/* Filtres format */}
      {formats.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedFormat(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              !selectedFormat
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'
            }`}
          >
            Tous
          </button>
          {formats.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFormat(f.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                selectedFormat === f.id
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'
              }`}
            >
              {f.nom}
            </button>
          ))}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <ClassementTable classement={filtered} gelActif={gelActif} />
      </div>
    </div>
  );
}
