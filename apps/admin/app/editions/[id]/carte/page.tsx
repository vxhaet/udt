'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { apiFetch, type CarteData } from '@/lib/api';
import { getSocket } from '@/lib/socket';

// Leaflet ne peut pas tourner côté serveur
const LiveMap = dynamic(() => import('@/components/LiveMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-500">
      Chargement de la carte…
    </div>
  ),
});

interface Equipe {
  id: string;
  nom: string;
}

export default function CartePage({ params }: { params: { id: string } }) {
  const [carteData, setCarteData] = useState<CarteData | null>(null);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [carte, classement] = await Promise.all([
      apiFetch<CarteData>(`/editions/${params.id}/carte`),
      apiFetch<{ equipeId: string; nom: string }[]>(`/editions/${params.id}/classement`),
    ]);
    setCarteData(carte);
    setEquipes(classement.map((e) => ({ id: e.equipeId, nom: e.nom })));
  }, [params.id]);

  useEffect(() => {
    fetchData().catch(console.error).finally(() => setLoading(false));
  }, [fetchData]);

  // Mise à jour temps réel des validations
  useEffect(() => {
    const socket = getSocket();
    socket.connect();
    socket.emit('join:edition', params.id);

    socket.on('validation:approved', () => {
      fetchData().catch(console.error);
    });

    return () => {
      socket.off('validation:approved');
    };
  }, [params.id, fetchData]);

  if (loading) {
    return <div className="text-center py-16 text-gray-500">Chargement de la carte…</div>;
  }

  if (!carteData) {
    return (
      <div className="text-center py-16 text-gray-500">
        Impossible de charger les données de la carte
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
            AUTO
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />
            MANUELLE
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
            MIXTE
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-green-400 inline-block" />
            Départ
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            Arrivée
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Live
        </span>
      </div>

      <div className="h-[calc(100vh-260px)] min-h-[400px] rounded-xl overflow-hidden border border-gray-800">
        <LiveMap data={carteData} equipes={equipes} />
      </div>

      {/* Légende équipes */}
      {equipes.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Équipes</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {equipes.map((eq, idx) => {
              const PALETTE = ['#e11d48','#7c3aed','#0284c7','#059669','#d97706','#db2777','#65a30d','#0891b2'];
              const color = PALETTE[idx % PALETTE.length];
              return (
                <div key={eq.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: color }}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-gray-300 truncate">{eq.nom}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
