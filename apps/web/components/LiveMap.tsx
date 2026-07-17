'use client';

import { useEffect, useRef } from 'react';
import type { CarteData } from '@/lib/api';
import type { ClassementEntry } from '@/lib/api';

import 'leaflet/dist/leaflet.css';

const TEAM_COLORS = [
  '#f97316', '#3b82f6', '#22c55e', '#a855f7',
  '#ec4899', '#06b6d4', '#eab308', '#ef4444',
  '#14b8a6', '#f43f5e', '#84cc16', '#6366f1',
];

const CP_COLORS: Record<string, string> = {
  DEPART: '#22c55e',
  ARRIVEE: '#ef4444',
  EPHEMERE_QG: '#f97316',
  NORMAL: '#3b82f6',
};

interface Props {
  carteData: CarteData;
  classement: ClassementEntry[];
}

export default function LiveMap({ carteData, classement }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import('leaflet').then((L) => {
      if (!containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      map.setView([46.5, 2.5], 6);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      mapRef.current = map;

      // Checkpoints
      const allPts: [number, number][] = [];

      const allCheckpoints = [
        ...(carteData.depart ? [{ id: '__depart__', type: 'DEPART' as const, latitude: carteData.depart.lat, longitude: carteData.depart.lng, nom: 'Départ', ordre_affichage: undefined }] : []),
        ...(carteData.arrivee ? [{ id: '__arrivee__', type: 'ARRIVEE' as const, latitude: carteData.arrivee.lat, longitude: carteData.arrivee.lng, nom: 'Arrivée', ordre_affichage: undefined }] : []),
        ...carteData.checkpoints,
      ];

      for (const cp of allCheckpoints) {
        if (!cp.latitude || !cp.longitude) continue;
        const color = CP_COLORS[cp.type ?? 'NORMAL'] ?? '#3b82f6';
        const label = cp.type === 'DEPART' ? 'D' : cp.type === 'ARRIVEE' ? 'A' : String(cp.ordre_affichage ?? '');
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:white;box-shadow:0 2px 6px rgba(0,0,0,.5)">${label}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([cp.latitude, cp.longitude], { icon, zIndexOffset: 100 })
          .bindTooltip(cp.nom ?? '', { direction: 'top' })
          .addTo(map);
        allPts.push([cp.latitude, cp.longitude]);
      }

      if (allPts.length > 0) {
        try { map.fitBounds(allPts, { padding: [40, 40] }); } catch {}
      }

      // Traces équipes
      const cpCoords = new Map<string, [number, number]>();
      for (const cp of carteData.checkpoints) {
        cpCoords.set(cp.id, [cp.latitude, cp.longitude]);
      }

      const byEquipe = new Map<string, typeof carteData.validations>();
      for (const v of carteData.validations) {
        if (!byEquipe.has(v.equipe_id)) byEquipe.set(v.equipe_id, []);
        byEquipe.get(v.equipe_id)!.push(v);
      }

      const equipeNames = new Map(classement.map((e) => [e.equipeId, e.nom]));

      let colorIdx = 0;
      for (const [equipeId, validations] of byEquipe) {
        const sorted = [...validations].sort(
          (a, b) => new Date(a.validated_at).getTime() - new Date(b.validated_at).getTime(),
        );
        const path: [number, number][] = [];
        for (const v of sorted) {
          const c = cpCoords.get(v.checkpoint_id);
          if (c) path.push(c);
        }
        if (path.length === 0) continue;

        const color = TEAM_COLORS[colorIdx % TEAM_COLORS.length];
        L.polyline(path, { color, weight: 3, opacity: 0.85 }).addTo(map);

        const nom = equipeNames.get(equipeId) ?? `Équipe ${colorIdx + 1}`;
        const initials = nom.replace(/[^A-Za-z\u00C0-\u024F ]/g, '').trim().split(' ').map((w: string) => w[0] ?? '').slice(0, 2).join('').toUpperCase() || '??';
        const teamIcon = L.divIcon({
          className: '',
          html: `<div style="width:28px;height:28px;border-radius:8px;background:${color};border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:white;box-shadow:0 2px 8px rgba(0,0,0,.55)">${initials}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const last = path[path.length - 1];
        L.marker(last, { icon: teamIcon, zIndexOffset: 1000 })
          .bindTooltip(`<b>${nom}</b><br>${path.length} CP`, { direction: 'top' })
          .addTo(map);
        colorIdx++;
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map data when props change (after initial mount)
  useEffect(() => {
    // Map updates are handled by remounting via key prop from parent
  }, [carteData, classement]);

  return <div ref={containerRef} className="w-full h-full" />;
}
