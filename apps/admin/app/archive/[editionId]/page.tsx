'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, type ArchiveData, type ArchiveClassementEntry } from '@/lib/api';
import { Archive, Calendar, Clock, Trophy, MapPin, Activity, ChevronLeft, Camera } from 'lucide-react';

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_BG = [
  'bg-yellow-500/10 border-yellow-500/30',
  'bg-gray-500/10 border-gray-500/30',
  'bg-orange-800/10 border-orange-700/30',
];
const MEDAL_TEXT = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function Podium({ top3 }: { top3: ArchiveClassementEntry[] }) {
  // Ordre visuel : 2e gauche, 1er centre, 3e droite
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  return (
    <div className="flex items-end justify-center gap-3">
      {order.map((entry) => {
        const idx = entry.rang - 1;
        return (
          <div
            key={entry.equipeId}
            className={`flex-1 max-w-[180px] rounded-xl border p-4 text-center space-y-1.5 ${MEDAL_BG[idx]} ${entry.rang === 1 ? 'pb-8 pt-6' : ''}`}
          >
            <div className="text-3xl">{MEDALS[idx]}</div>
            <div className={`text-xl font-black ${MEDAL_TEXT[idx]}`}>{entry.rang}</div>
            <div className="text-white font-semibold text-sm leading-tight">{entry.nom}</div>
            <div className={`text-2xl font-black ${MEDAL_TEXT[idx]}`}>{entry.scoreTotal} pts</div>
            <div className="text-xs text-gray-500">
              {entry.nbCheckpoints} CP · {entry.distanceVolOiseauKm.toFixed(1)} km
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ArchiveDetailPage({ params }: { params: { editionId: string } }) {
  const [data, setData] = useState<ArchiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ArchiveData>(`/editions/${params.editionId}/archive-data`)
      .then(setData)
      .catch((err: unknown) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [params.editionId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500">
        Chargement…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-red-400">
        {error ?? 'Données introuvables'}
      </div>
    );
  }

  const { edition, classement, checkpoints, segments } = data;
  const top3 = classement.filter((e) => e.rang <= 3);
  const rest = classement.filter((e) => e.rang > 3);
  const photosTotal = checkpoints.reduce((acc, cp) => acc + cp.validations.filter((v) => v.photo_url).length, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Lightbox */}
      {activePhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-pointer p-4"
          onClick={() => setActivePhoto(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activePhoto} alt="Validation" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">
        {/* Back */}
        <Link href="/archive" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Toutes les archives
        </Link>

        {/* Header édition */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-yellow-400 text-xs uppercase tracking-widest font-medium">
            <Archive className="w-4 h-4" />
            Résultats finaux
          </div>
          <h1 className="text-4xl font-black text-white">{edition.nom}</h1>
          {edition.description && <p className="text-gray-400">{edition.description}</p>}
          <div className="flex flex-wrap gap-4 text-sm text-gray-500 pt-1">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {new Date(edition.date_course).toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {edition.duree_minutes / 60}h de course
            </span>
            <span className="flex items-center gap-1.5">
              <Trophy className="w-4 h-4" />
              {classement.length} équipe{classement.length > 1 ? 's' : ''}
            </span>
            {photosTotal > 0 && (
              <span className="flex items-center gap-1.5">
                <Camera className="w-4 h-4" />
                {photosTotal} photo{photosTotal > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Podium */}
        {top3.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-400" />
              Podium
            </h2>
            <Podium top3={top3} />
          </section>
        )}

        {/* Classement complet */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-gray-400" />
            Classement général
          </h2>
          <div className="card divide-y divide-gray-800 p-0 overflow-hidden">
            {classement.map((entry) => (
              <div key={entry.equipeId} className="flex items-center gap-4 px-4 py-3">
                <span className="w-8 text-center font-bold text-gray-400 text-sm">
                  {entry.rang <= 3 ? MEDALS[entry.rang - 1] : entry.rang}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-white font-medium">{entry.nom}</span>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {entry.nbCheckpoints} CP · {entry.distanceVolOiseauKm.toFixed(1)} km
                    {entry.heureArrivee && (
                      <> · Arrivée {new Date(entry.heureArrivee).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</>
                    )}
                  </div>
                </div>
                <span className="text-yellow-400 font-bold text-lg">{entry.scoreTotal} pts</span>
              </div>
            ))}
          </div>
        </section>

        {/* Checkpoints + Photos */}
        {checkpoints.some((cp) => cp.validations.some((v) => v.photo_url)) && (
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-400" />
              Photos des validations
            </h2>
            <div className="space-y-6">
              {checkpoints
                .filter((cp) => cp.validations.some((v) => v.photo_url))
                .map((cp) => (
                  <div key={cp.id}>
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin className="w-4 h-4 text-blue-400" />
                      <span className="text-white font-medium">{cp.nom}</span>
                      <span className="text-xs text-gray-500">{cp.points} pts</span>
                      <span className="text-xs text-gray-600">
                        · {cp.validations.length} équipe{cp.validations.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {cp.validations
                        .filter((v) => v.photo_url)
                        .map((v, idx) => (
                          <button
                            key={idx}
                            onClick={() => setActivePhoto(v.photo_url!)}
                            className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 hover:ring-2 hover:ring-blue-500 transition group"
                            title={v.equipe_nom}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={v.photo_url!}
                              alt={v.equipe_nom}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 opacity-0 group-hover:opacity-100 transition">
                              <p className="text-white text-[10px] font-medium truncate">{v.equipe_nom}</p>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Checkpoints sans photos — liste */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gray-400" />
            Checkpoints ({checkpoints.length})
          </h2>
          <div className="card divide-y divide-gray-800 p-0 overflow-hidden">
            {checkpoints.map((cp) => (
              <div key={cp.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-white font-medium text-sm">{cp.nom}</span>
                  <span className="text-xs text-gray-500 ml-2">{cp.points} pts</span>
                </div>
                <span className="text-xs text-gray-500">
                  {cp.validations.length} validation{cp.validations.length > 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Segments Strava */}
        {segments.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-orange-400" />
              Classements Strava
            </h2>
            <div className="space-y-4">
              {segments.map((seg) => (
                <div key={seg.id} className="card space-y-3">
                  <div>
                    <h3 className="font-semibold text-white">{seg.nom}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      🥇 {seg.points_premier} pts · 🥈 {seg.points_second} pts · 🥉 {seg.points_troisieme} pts
                    </p>
                  </div>
                  {seg.performances.length === 0 ? (
                    <p className="text-xs text-gray-600">Aucune performance enregistrée.</p>
                  ) : (
                    <div className="space-y-1">
                      {seg.performances.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-gray-900/60 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-3">
                            <span className="w-5 text-center">
                              {idx < 3 ? MEDALS[idx] : <span className="text-gray-500 text-sm">{p.classement}</span>}
                            </span>
                            <div>
                              <span className="text-sm text-white font-medium">{p.participant_nom}</span>
                              <span className="text-xs text-gray-400 ml-2">{p.equipe_nom}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-right">
                            <span className="text-xs text-gray-400">{formatTime(p.temps_secondes)}</span>
                            <span className="text-sm font-bold text-yellow-400 w-14 text-right">+{p.points_gagnes} pts</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="text-center pt-4 border-t border-gray-800">
          <Link href="/archive" className="text-sm text-gray-600 hover:text-gray-400 transition-colors">
            ← Toutes les archives
          </Link>
        </div>
      </div>
    </div>
  );
}
