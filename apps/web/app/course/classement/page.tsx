'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { ClassementEntry } from '@/lib/api';

interface ValidationDetail {
  id: string;
  checkpointNom: string;
  pointsAccordes: number;
  validatedAt: string;
  photoUrl?: string | null;
}

interface TeamDetail {
  equipeId: string;
  nom: string;
  scoreTotal: number;
  validations: ValidationDetail[];
}

export default function ClassementPage() {
  const { payload } = useAuth();
  const [classement, setClassement] = useState<ClassementEntry[]>([]);
  const [gelActive, setGelActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<TeamDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [photoIdx, setPhotoIdx] = useState<number | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!payload) return;
    try {
      const [cl, ed] = await Promise.all([
        apiFetch<ClassementEntry[]>(`/editions/${payload.editionId}/classement`),
        apiFetch<{ gel_actif?: boolean; formats?: Array<{ id: string; gel_actif: boolean }> }>(`/editions/${payload.editionId}`),
      ]);
      setClassement(cl);
      // Gel is active if edition or any format is frozen
      const anyFormatGel = ed.formats?.some((f: any) => f.gel_actif) ?? false;
      setGelActive(!!ed.gel_actif || anyFormatGel);
    } catch (err) {
      console.error('Fetch classement error:', err);
    } finally {
      setLoading(false);
    }
  }, [payload]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refresh = () => fetchData();
    socket.on('validation:approved', refresh);
    socket.on('gel:deactivated', refresh);
    return () => {
      socket.off('validation:approved', refresh);
      socket.off('gel:deactivated', refresh);
    };
  }, [fetchData]);

  async function openTeamDetail(equipeId: string) {
    setDetailLoading(true);
    try {
      const data = await apiFetch<TeamDetail>(`/equipes/${equipeId}/validations`);
      setSelectedTeam(data);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-brand-pink rounded-full animate-spin" />
      </div>
    );
  }

  // Extract unique formats
  const formats = Array.from(
    new Map(classement.filter((e) => e.format_course).map((e) => [e.format_course!.id, e.format_course!])).values()
  );

  // Filter and re-rank
  const filtered = selectedFormat
    ? classement.filter((e) => e.format_course?.id === selectedFormat).map((e, i) => ({ ...e, rang: i + 1 }))
    : classement;

  const medals = ['🥇', '🥈', '🥉'];
  const top3 = filtered.slice(0, 3);
  const rest = filtered.slice(3);
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-white">Classement</h1>
        {gelActive && (
          <span className="text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-3 py-1">
            Gele
          </span>
        )}
      </div>

      {/* Format filter */}
      {formats.length > 1 && (
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedFormat(null)}
            className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors ${
              !selectedFormat ? 'bg-brand-pink text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            Tous
          </button>
          {formats.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFormat(f.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors ${
                selectedFormat === f.id ? 'bg-brand-pink text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {f.nom}
            </button>
          ))}
        </div>
      )}

      {gelActive && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-amber-300 text-sm text-center">
          Le classement est gele. Les resultats finaux seront bientot disponibles.
        </div>
      )}

      {/* Podium */}
      {top3.length >= 3 && (
        <div className="flex items-end justify-center gap-2 pt-4">
          {podiumOrder.map((entry, i) => {
            const isFirst = i === 1;
            const isMine = entry.equipeId === payload?.equipeId;
            return (
              <button
                key={entry.equipeId}
                onClick={() => openTeamDetail(entry.equipeId)}
                className={`flex flex-col items-center rounded-2xl px-3 py-4 transition-colors ${
                  isFirst ? 'bg-brand-purple/15 border border-brand-purple/30' : 'bg-zinc-900 border border-zinc-800'
                } ${isFirst ? 'w-28 pb-6' : 'w-24'}`}
              >
                <span className="text-2xl mb-1">{medals[entry.rang - 1]}</span>
                <span className={`text-xs font-bold truncate w-full text-center ${isMine ? 'text-brand-pink' : 'text-white'}`}>
                  {entry.nom}
                </span>
                <span className="text-lg font-black text-brand-pink mt-1">{entry.scoreTotal}</span>
                <span className="text-[10px] text-zinc-500">{entry.nbCheckpoints} CP</span>
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-800">
        {(top3.length < 3 ? classement : rest).map((entry) => {
          const isMine = entry.equipeId === payload?.equipeId;
          return (
            <button
              key={entry.equipeId}
              onClick={() => openTeamDetail(entry.equipeId)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-zinc-800/50 transition-colors ${
                isMine ? 'bg-brand-purple/5' : ''
              }`}
            >
              <span className="w-7 text-center text-sm font-bold text-zinc-500 shrink-0">
                {entry.rang <= 3 ? medals[entry.rang - 1] : entry.rang}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold truncate ${isMine ? 'text-brand-pink' : 'text-white'}`}>
                  {entry.nom}
                  {isMine && <span className="text-brand-purple ml-1 text-xs">(Moi)</span>}
                </p>
                <p className="text-xs text-zinc-500">
                  {entry.nbCheckpoints} CP · {entry.distanceVolOiseauKm.toFixed(1)} km
                  {entry.format_course && ` · ${entry.format_course.nom}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-black text-brand-pink">{entry.scoreTotal} pts</p>
                {entry.heureArrivee && (
                  <p className="text-[10px] text-green-400 font-semibold">
                    Arrivee {new Date(entry.heureArrivee).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </button>
          );
        })}
        {classement.length === 0 && (
          <p className="text-center text-zinc-600 text-sm py-8">Aucune equipe en course</p>
        )}
      </div>

      {/* Team detail modal */}
      {(selectedTeam || detailLoading) && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center" style={{ zIndex: 10000 }} onClick={() => { setSelectedTeam(null); setPhotoIdx(null); }}>
          <div
            className="bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[70vh] overflow-auto mb-16 sm:mb-0"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-zinc-700 border-t-brand-pink rounded-full animate-spin" />
              </div>
            ) : selectedTeam ? (
              <div className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-black text-white">{selectedTeam.nom}</h3>
                    <p className="text-sm text-brand-pink font-bold">{selectedTeam.scoreTotal} pts</p>
                  </div>
                  <button onClick={() => { setSelectedTeam(null); setPhotoIdx(null); }} className="text-zinc-500 p-1">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="divide-y divide-zinc-800">
                  {selectedTeam.validations.map((v, i) => (
                    <div key={v.id} className="flex items-center gap-3 py-3">
                      <span className="w-6 h-6 bg-zinc-800 rounded-full flex items-center justify-center text-xs font-bold text-zinc-400">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{v.checkpointNom}</p>
                        <p className="text-xs text-zinc-500">
                          {new Date(v.validatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-brand-pink">+{v.pointsAccordes}</span>
                      {v.photoUrl && (
                        <button
                          onClick={() => setPhotoIdx(i)}
                          className="w-8 h-8 rounded-lg overflow-hidden shrink-0"
                        >
                          <img src={v.photoUrl} alt="" className="w-full h-full object-cover" />
                        </button>
                      )}
                    </div>
                  ))}
                  {selectedTeam.validations.length === 0 && (
                    <p className="text-center text-zinc-600 text-sm py-6">Aucune validation</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Photo viewer */}
      {photoIdx !== null && selectedTeam && selectedTeam.validations[photoIdx]?.photoUrl && (
        <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center" onClick={() => setPhotoIdx(null)}>
          <img
            src={selectedTeam.validations[photoIdx].photoUrl!}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setPhotoIdx(null)}>
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
