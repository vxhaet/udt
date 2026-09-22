'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';

interface AlbumPhoto {
  id: string;
  photoUrl: string;
  checkpointNom: string;
  equipeNom: string;
  validatedAt: string;
}

export default function AlbumPage() {
  const { payload } = useAuth();
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewIdx, setViewIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!payload) return;
    apiFetch<AlbumPhoto[]>(`/editions/${payload.editionId}/album`)
      .then(setPhotos)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [payload]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-brand-pink rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-white">Album</h1>
        <span className="text-xs text-zinc-500">{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
      </div>

      {photos.length === 0 ? (
        <div className="text-center text-zinc-600 text-sm py-16">
          Aucune photo pour le moment. Les photos apparaitront ici au fur et a mesure des validations.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setViewIdx(i)}
              className="relative aspect-square rounded-xl overflow-hidden group"
            >
              <img src={p.photoUrl} alt={p.checkpointNom} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                <div>
                  <p className="text-xs font-bold text-white truncate">{p.checkpointNom}</p>
                  <p className="text-[10px] text-zinc-300 truncate">{p.equipeNom}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Photo viewer */}
      {viewIdx !== null && photos[viewIdx] && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/80">
            <span className="text-sm text-zinc-400">{viewIdx + 1}/{photos.length}</span>
            <button onClick={() => setViewIdx(null)} className="text-white">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Image */}
          <div className="flex-1 flex items-center justify-center relative">
            <img
              src={photos[viewIdx].photoUrl}
              alt=""
              className="max-w-full max-h-full object-contain"
            />

            {/* Nav arrows */}
            {viewIdx > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setViewIdx(viewIdx - 1); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
            )}
            {viewIdx < photos.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); setViewIdx(viewIdx + 1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            )}
          </div>

          {/* Caption */}
          <div className="px-4 py-3 bg-black/80 text-center">
            <p className="text-sm font-bold text-white">{photos[viewIdx].checkpointNom}</p>
            <p className="text-xs text-zinc-400">
              {photos[viewIdx].equipeNom} · {new Date(photos[viewIdx].validatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
