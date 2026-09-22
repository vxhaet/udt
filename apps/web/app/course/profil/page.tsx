'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface TeamInfo {
  id: string;
  nom: string;
  code_acces: string;
  score_total: number;
  distance_vol_oiseau_km: number;
  statut: string;
  format_course: { id: string; nom: string; duree_minutes: number } | null;
  participants: { id: string; nom: string; prenom: string; strava_athlete_id?: string | null }[];
}

export default function ProfilPage() {
  const { payload, signOut } = useAuth();
  const router = useRouter();
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaEnabled, setStravaEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!payload) return;
    Promise.all([
      apiFetch<TeamInfo>(`/equipes/${payload.equipeId}`),
      apiFetch<{ connected: boolean }>('/strava/status').catch(() => ({ connected: false })),
      apiFetch<{ config?: { segments_strava_actif?: boolean } }>(`/editions/${payload.editionId}`).catch(() => ({ config: undefined })),
    ]).then(([t, s, ed]) => {
      setTeam(t);
      setStravaConnected(s.connected);
      setStravaEnabled(!!(ed as any).config?.segments_strava_actif);
    }).finally(() => setLoading(false));
  }, [payload]);

  function handleLogout() {
    if (confirm('Se deconnecter ?')) {
      signOut();
      router.replace('/login');
    }
  }

  function connectStrava() {
    window.location.href = `${API_URL}/strava/auth?token=${encodeURIComponent(payload?.participantId ?? '')}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-brand-pink rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
      <h1 className="text-xl font-black text-white">Profil</h1>

      {/* Team info */}
      {team && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-black text-white">{team.nom}</h2>
              <p className="text-xs text-zinc-500 mt-1">Code: <span className="font-mono text-zinc-300">{team.code_acces}</span></p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {team.format_course && (
                <span className="text-xs font-bold bg-brand-purple/15 text-brand-purple border border-brand-purple/30 rounded-full px-3 py-1">
                  {team.format_course.nom}
                </span>
              )}
              <span className="text-xs font-bold bg-brand-purple/15 text-brand-pink border border-brand-purple/30 rounded-full px-3 py-1">
                {team.statut.replace('_', ' ')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <div>
              <p className="text-zinc-500 text-xs">Score</p>
              <p className="text-xl font-black text-brand-pink">{team.score_total}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Distance</p>
              <p className="text-xl font-black text-white">{team.distance_vol_oiseau_km.toFixed(1)} km</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Membres</p>
            <div className="space-y-2">
              {team.participants.map((p) => {
                const isMe = p.id === payload?.participantId;
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-xs font-bold text-zinc-400">
                      {p.prenom[0]}{p.nom[0]}
                    </div>
                    <span className={`text-sm ${isMe ? 'text-brand-pink font-semibold' : 'text-zinc-300'}`}>
                      {p.prenom} {p.nom}
                      {isMe && <span className="text-zinc-500 ml-1">(toi)</span>}
                    </span>
                    {p.strava_athlete_id && (
                      <span className="text-[10px] text-brand-pink font-bold bg-brand-purple/10 px-2 py-0.5 rounded-full ml-auto">Strava</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Strava */}
      {stravaEnabled && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">Strava</h3>
          {stravaConnected ? (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
              Connecte
            </div>
          ) : (
            <button
              onClick={connectStrava}
              className="w-full bg-[#FC4C02] hover:bg-[#e04300] text-white font-bold text-sm py-3 rounded-xl transition-colors"
            >
              Connecter Strava
            </button>
          )}
        </div>
      )}

      {/* Share code */}
      {team && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-center space-y-3">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Partager le code equipe</p>
          <p className="text-3xl font-black tracking-[0.2em] text-brand-pink">{team.code_acces}</p>
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: 'Ultra DeTour', text: `Rejoins mon equipe ${team.nom} avec le code ${team.code_acces} !` });
              } else {
                navigator.clipboard.writeText(team.code_acces);
              }
            }}
            className="text-sm text-brand-pink hover:text-brand-purple transition-colors"
          >
            Copier / Partager
          </button>
        </div>
      )}

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full bg-zinc-900 border border-zinc-800 hover:border-red-500/30 text-red-400 font-semibold text-sm py-3.5 rounded-2xl transition-colors"
      >
        Se deconnecter
      </button>
    </div>
  );
}
