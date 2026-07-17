'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CarteData } from '@/lib/api';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Validation stricte (Number.isFinite sans coercition) ──────────────────────

function safeCoords(lat: unknown, lng: unknown): [number, number] | null {
  if (lat == null || lng == null) return null;
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || la < -90 || la > 90) return null;
  if (!Number.isFinite(lo) || lo < -180 || lo > 180) return null;
  return [la, lo];
}

// ── Icônes ────────────────────────────────────────────────────────────────────

function makeCircleIcon(color: string, label: string) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${color};border:2px solid white;
      display:flex;align-items:center;justify-content:center;
      font-size:10px;font-weight:bold;color:white;
      box-shadow:0 2px 6px rgba(0,0,0,.4)
    ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

const TYPE_COLORS: Record<string, string> = {
  AUTO: '#22c55e',
  MANUELLE: '#f97316',
  MIXTE: '#3b82f6',
};

const TEAM_PALETTE = ['#e11d48','#7c3aed','#0284c7','#059669','#d97706','#db2777','#65a30d','#0891b2'];

// ── FitBounds ─────────────────────────────────────────────────────────────────

function FitBounds({ data }: { data: CarteData }) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = [];
    const dep = safeCoords(data.depart?.lat, data.depart?.lng);
    if (dep) points.push(dep);
    const arr = safeCoords(data.arrivee?.lat, data.arrivee?.lng);
    if (arr) points.push(arr);
    data.checkpoints.forEach((cp) => {
      const pos = safeCoords(cp.latitude, cp.longitude);
      if (pos) points.push(pos);
    });
    if (points.length === 0) return;
    try {
      map.fitBounds(points, { padding: [40, 40] });
    } catch {
      // Coordonnées invalides — on conserve la vue par défaut
    }
  }, [map, data]);
  return null;
}

// ── Composant principal ───────────────────────────────────────────────────────

interface Props {
  data: CarteData;
  equipes: { id: string; nom: string }[];
}

export default function LiveMap({ data, equipes }: Props) {
  // Dernière position de chaque équipe = dernier checkpoint validé
  const teamPositions = useMemo(() => {
    const byEquipe: Record<string, typeof data.validations[0]> = {};
    for (const v of data.validations) {
      const prev = byEquipe[v.equipe_id];
      if (!prev || new Date(v.validated_at) > new Date(prev.validated_at)) {
        byEquipe[v.equipe_id] = v;
      }
    }
    return byEquipe;
  }, [data.validations]);

  const cpById = useMemo(
    () => Object.fromEntries(data.checkpoints.map((cp) => [cp.id, cp])),
    [data.checkpoints],
  );

  // Checkpoints valides pré-calculés
  const validCheckpoints = useMemo(
    () =>
      data.checkpoints.flatMap((cp) => {
        const pos = safeCoords(cp.latitude, cp.longitude);
        if (!pos) return [];
        const color = TYPE_COLORS[cp.type_validation] ?? '#6b7280';
        return [{ cp, pos, color }];
      }),
    [data.checkpoints],
  );

  const departPos = safeCoords(data.depart?.lat, data.depart?.lng);
  const arriveePos = safeCoords(data.arrivee?.lat, data.arrivee?.lng);

  return (
    <MapContainer
      center={[46.5, 2.5]}
      zoom={6}
      className="w-full h-full rounded-xl"
      style={{ background: '#1f2937' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds data={data} />

      {/* Départ */}
      {departPos && (
        <Marker position={departPos} icon={makeCircleIcon('#22c55e', 'D')}>
          <Popup><strong>Départ</strong></Popup>
        </Marker>
      )}

      {/* Arrivée */}
      {arriveePos && (
        <Marker position={arriveePos} icon={makeCircleIcon('#ef4444', 'A')}>
          <Popup><strong>Arrivée</strong></Popup>
        </Marker>
      )}

      {/* Cercles de rayon des checkpoints (frères des Markers, jamais enfants) */}
      {validCheckpoints.map(({ cp, pos, color }) => (
        <Circle
          key={`circle-${cp.id}`}
          center={pos}
          radius={50}
          pathOptions={{ color, fillOpacity: 0.1, weight: 1 }}
        />
      ))}

      {/* Markers des checkpoints */}
      {validCheckpoints.map(({ cp, pos, color }) => (
        <Marker key={`marker-${cp.id}`} position={pos} icon={makeCircleIcon(color, '✓')}>
          <Popup>
            <div className="text-sm">
              <strong>{cp.nom}</strong>
              {cp.points !== undefined && (
                <div className="text-yellow-600">{cp.points} pts</div>
              )}
              <div className="text-gray-500">{cp.type_validation}</div>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Positions des équipes */}
      {equipes.map((equipe, idx) => {
        const lastValidation = teamPositions[equipe.id];
        if (!lastValidation) return null;
        const cp = cpById[lastValidation.checkpoint_id];
        if (!cp) return null;
        const pos = safeCoords(cp.latitude, cp.longitude);
        if (!pos) return null;
        const color = TEAM_PALETTE[idx % TEAM_PALETTE.length];
        return (
          <Marker key={equipe.id} position={pos} icon={makeCircleIcon(color, String(idx + 1))}>
            <Popup>
              <div className="text-sm">
                <strong>{equipe.nom}</strong>
                <div className="text-gray-500">Dernier CP : {cp.nom}</div>
                <div className="text-gray-400 text-xs">
                  {new Date(lastValidation.validated_at).toLocaleTimeString('fr-FR')}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
