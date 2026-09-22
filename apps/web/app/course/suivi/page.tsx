'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { ClassementEntry, CarteData } from '@/lib/api';
import 'leaflet/dist/leaflet.css';

const TEAM_COLORS = [
  '#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ec4899',
  '#06b6d4', '#eab308', '#ef4444', '#14b8a6', '#f43f5e',
  '#84cc16', '#6366f1',
];

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export default function SuiviPage() {
  const { payload } = useAuth();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);

  const [carteData, setCarteData] = useState<CarteData | null>(null);
  const [classement, setClassement] = useState<ClassementEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPanel, setShowPanel] = useState(false);
  const [visibleTeams, setVisibleTeams] = useState<Set<string>>(new Set());
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!payload) return;
    try {
      const [carte, cl] = await Promise.all([
        apiFetch<CarteData>(`/editions/${payload.editionId}/carte`),
        apiFetch<ClassementEntry[]>(`/editions/${payload.editionId}/classement`),
      ]);
      setCarteData(carte);
      setClassement(cl);
      setVisibleTeams((prev) => {
        if (prev.size === 0) return new Set(cl.map((e) => e.equipeId));
        return prev;
      });
    } catch (err) {
      console.error(err);
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
    socket.on('checkpoint:revealed', refresh);
    socket.on('checkpoint:taken', refresh);
    return () => {
      socket.off('validation:approved', refresh);
      socket.off('checkpoint:revealed', refresh);
      socket.off('checkpoint:taken', refresh);
    };
  }, [fetchData]);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    import('leaflet').then((L) => {
      if (!mapContainerRef.current || mapRef.current) return;
      const map = L.map(mapContainerRef.current, { zoomControl: false, attributionControl: false });
      L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      map.setView([46.5, 2.5], 6);
      mapRef.current = map;
    });
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Render traces
  useEffect(() => {
    if (!mapRef.current || !carteData) return;

    import('leaflet').then((L) => {
      const map = mapRef.current;
      if (!map) return;

      layersRef.current.forEach((l) => map.removeLayer(l));
      layersRef.current = [];

      const allPts: [number, number][] = [];

      // Checkpoints (small)
      for (const cp of carteData.checkpoints) {
        const color = cp.type === 'DEPART' ? '#22c55e' : cp.type === 'ARRIVEE' ? '#ef4444' : '#6b7280';
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        const m = L.marker([cp.latitude, cp.longitude], { icon, interactive: false }).addTo(map);
        layersRef.current.push(m);
        allPts.push([cp.latitude, cp.longitude]);
      }

      // Team paths
      const cpCoords = new Map(carteData.checkpoints.map((cp) => [cp.id, [cp.latitude, cp.longitude] as [number, number]]));

      // Find depart checkpoint(s)
      const departCp = carteData.checkpoints.find((cp) => cp.type === 'DEPART');
      const departCoord: [number, number] | null = departCp ? [departCp.latitude, departCp.longitude] : (carteData.depart ? [carteData.depart.lat, carteData.depart.lng] : null);

      const byEquipe = new Map<string, typeof carteData.validations>();
      for (const v of carteData.validations) {
        if (!byEquipe.has(v.equipe_id)) byEquipe.set(v.equipe_id, []);
        byEquipe.get(v.equipe_id)!.push(v);
      }

      const equipeNames = new Map(classement.map((e) => [e.equipeId, e.nom]));
      let colorIdx = 0;

      for (const [equipeId, vals] of byEquipe) {
        if (!visibleTeams.has(equipeId)) { colorIdx++; continue; }

        const sorted = [...vals].sort((a, b) => new Date(a.validated_at).getTime() - new Date(b.validated_at).getTime());
        const path: [number, number][] = [];

        // Start from depart
        if (departCoord) path.push(departCoord);

        for (const v of sorted) {
          // Use checkpoint coords from the validation data
          if (v.checkpoint?.latitude && v.checkpoint?.longitude) {
            path.push([v.checkpoint.latitude, v.checkpoint.longitude]);
          } else {
            const c = cpCoords.get(v.checkpoint_id);
            if (c) path.push(c);
          }
        }
        if (path.length <= 1) { colorIdx++; continue; }

        const color = TEAM_COLORS[colorIdx % TEAM_COLORS.length];
        const line = L.polyline(path, { color, weight: 3, opacity: 0.85, dashArray: '8 6' }).addTo(map);
        layersRef.current.push(line);

        const nom = equipeNames.get(equipeId) ?? `Equipe`;
        const initials = nom.replace(/[^A-Za-z\u00C0-\u024F ]/g, '').trim().split(' ').map((w: string) => w[0] ?? '').slice(0, 2).join('').toUpperCase() || '??';
        const teamIcon = L.divIcon({
          className: '',
          html: `<div style="width:28px;height:28px;border-radius:8px;background:${color};border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:white;box-shadow:0 2px 8px rgba(0,0,0,.55)">${initials}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const last = path[path.length - 1];
        const tm = L.marker(last, { icon: teamIcon, zIndexOffset: 1000 })
          .bindTooltip(`<b>${nom}</b><br>${sorted.length} CP`, { direction: 'top' })
          .addTo(map);
        layersRef.current.push(tm);
        colorIdx++;
      }

      if (allPts.length > 0 && !loading) {
        try { map.fitBounds(allPts, { padding: [40, 40], maxZoom: 15 }); } catch {}
      }
    });
  }, [carteData, classement, visibleTeams, loading]);

  function toggleTeam(equipeId: string) {
    setVisibleTeams((prev) => {
      const next = new Set(prev);
      if (next.has(equipeId)) next.delete(equipeId); else next.add(equipeId);
      return next;
    });
  }

  return (
    <div className="relative" style={{ height: 'calc(100dvh - 8rem)' }}>
      <div ref={mapContainerRef} className="w-full h-full" style={{ zIndex: 0 }} />

      {loading && (
        <div className="absolute inset-0 bg-zinc-950/80 flex items-center justify-center z-10">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-orange-500 rounded-full animate-spin" />
        </div>
      )}

      {/* Live indicator */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-zinc-900/90 border border-zinc-700 rounded-full px-3 py-1.5">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-xs font-semibold text-white">Live</span>
      </div>

      {/* Filter button */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="absolute top-4 right-4 z-20 w-10 h-10 bg-zinc-900 border border-zinc-700 rounded-full flex items-center justify-center text-white shadow-lg"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
      </button>

      {/* Team filter panel */}
      {showPanel && (() => {
        const formats = Array.from(
          new Map(classement.filter((e) => e.format_course).map((e) => [e.format_course!.id, e.format_course!])).values()
        );
        const filteredTeams = selectedFormat
          ? classement.filter((e) => e.format_course?.id === selectedFormat)
          : classement;

        return (
          <div className="absolute top-16 right-4 z-20 bg-zinc-900 border border-zinc-700 rounded-xl w-56 max-h-[70vh] overflow-auto shadow-xl">
            {/* Format filter */}
            {formats.length > 1 && (
              <div className="p-3 border-b border-zinc-800">
                <p className="text-xs font-bold text-zinc-400 uppercase mb-2">Format</p>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => {
                      setSelectedFormat(null);
                      setVisibleTeams(new Set(classement.map((e) => e.equipeId)));
                    }}
                    className={`px-2 py-1 text-[10px] font-bold rounded-full ${!selectedFormat ? 'bg-brand-pink text-white' : 'bg-zinc-800 text-zinc-400'}`}
                  >
                    Tous
                  </button>
                  {formats.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        setSelectedFormat(f.id);
                        setVisibleTeams(new Set(classement.filter((e) => e.format_course?.id === f.id).map((e) => e.equipeId)));
                      }}
                      className={`px-2 py-1 text-[10px] font-bold rounded-full ${selectedFormat === f.id ? 'bg-brand-pink text-white' : 'bg-zinc-800 text-zinc-400'}`}
                    >
                      {f.nom}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Teams */}
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-xs font-bold text-zinc-400 uppercase">Equipes</p>
              <div className="flex gap-1">
                <button
                  onClick={() => setVisibleTeams(new Set(filteredTeams.map((e) => e.equipeId)))}
                  className="text-[10px] text-zinc-500 hover:text-white"
                >
                  Tout
                </button>
                <span className="text-zinc-700">|</span>
                <button
                  onClick={() => setVisibleTeams(new Set())}
                  className="text-[10px] text-zinc-500 hover:text-white"
                >
                  Rien
                </button>
              </div>
            </div>
            <div className="p-2 space-y-1">
              {filteredTeams.map((entry, i) => (
                <button
                  key={entry.equipeId}
                  onClick={() => toggleTeam(entry.equipeId)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-left"
                >
                  <div
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{
                      backgroundColor: visibleTeams.has(entry.equipeId) ? TEAM_COLORS[i % TEAM_COLORS.length] : '#3f3f46',
                    }}
                  />
                  <span className={`text-xs truncate ${visibleTeams.has(entry.equipeId) ? 'text-white' : 'text-zinc-600'}`}>
                    {entry.nom}
                  </span>
                  {entry.format_course && (
                    <span className="text-[9px] text-zinc-600 ml-auto shrink-0">{entry.format_course.nom}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
