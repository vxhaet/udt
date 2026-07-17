'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CheckpointAdmin } from '@/lib/api';
import { Maximize2, Minimize2, MousePointer2 } from 'lucide-react';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Injecter l'animation CSS pour les marqueurs éphémères (une seule fois)
if (typeof document !== 'undefined' && !document.getElementById('udt-ephemere-style')) {
  const s = document.createElement('style');
  s.id = 'udt-ephemere-style';
  s.textContent = `
    @keyframes udt-ephemere-blink {
      0%,100% { opacity: 1; }
      50%      { opacity: 0.3; }
    }
    .udt-ephemere-pulse { animation: udt-ephemere-blink 0.8s ease-in-out infinite; }
  `;
  document.head.appendChild(s);
}

// ── Validation stricte des coordonnées ───────────────────────────────────────
// On n'utilise PAS isFinite() (qui fait une coercition : isFinite(null) === true)
// mais Number.isFinite() qui rejette null, undefined, NaN et Infinity sans coercition.

function safeCoords(lat: unknown, lng: unknown): [number, number] | null {
  if (lat == null || lng == null) return null;
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || la < -90 || la > 90) return null;
  if (!Number.isFinite(lo) || lo < -180 || lo > 180) return null;
  return [la, lo];
}

// ── Icônes ───────────────────────────────────────────────────────────────────

function makeCircleIcon(color: string, label: string, pulse = false) {
  return L.divIcon({
    className: '',
    html: `<div class="${pulse ? 'udt-ephemere-pulse' : ''}" style="
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

function makePendingIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:34px;height:34px;border-radius:50%;
      background:#f97316;border:3px solid white;
      display:flex;align-items:center;justify-content:center;
      font-size:16px;font-weight:bold;color:white;
      box-shadow:0 2px 10px rgba(249,115,22,.6);
    ">+</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
}

// ── Couleurs ──────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  NORMAL: '#3b82f6',
  DEPART: '#22c55e',
  ARRIVEE: '#ef4444',
  EPHEMERE_QG: '#f97316',
};

// ── Label temps restant pour EPHEMERE_QG ──────────────────────────────────────

function ephemereLabel(expiresAt: string | null | undefined, now: Date): string {
  if (!expiresAt) return 'QG';
  const remaining = new Date(expiresAt).getTime() - now.getTime();
  if (remaining <= 0) return 'QG';
  if (remaining < 60_000) return `${Math.ceil(remaining / 1000)}s`;
  return `${Math.ceil(remaining / 60_000)}m`;
}

// ── FitBounds ─────────────────────────────────────────────────────────────────

function FitBounds({ checkpoints }: { checkpoints: CheckpointAdmin[] }) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = checkpoints
      .map((cp) => safeCoords(cp.latitude, cp.longitude))
      .filter((p): p is [number, number] => p !== null);
    if (points.length === 0) return;
    try {
      map.fitBounds(points, { padding: [40, 40] });
    } catch {
      // Coordonnées invalides pour fitBounds — on laisse la vue par défaut
    }
  }, [map, checkpoints]);
  return null;
}

// ── Click handler ─────────────────────────────────────────────────────────────

function ClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (!e.latlng) return;
      onMapClick(
        Math.round(e.latlng.lat * 1e6) / 1e6,
        Math.round(e.latlng.lng * 1e6) / 1e6,
      );
    },
  });
  return null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CheckpointMapProps {
  checkpoints: CheckpointAdmin[];
  onMapClick?: (lat: number, lng: number) => void;
  pendingMarker?: { lat: number; lng: number } | null;
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function CheckpointMap({ checkpoints, onMapClick, pendingMarker }: CheckpointMapProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Mettre à jour l'heure courante toutes les 30 s pour rafraîchir les labels éphémères
  useEffect(() => {
    const hasEphemere = checkpoints.some((cp) => cp.type === 'EPHEMERE_QG' && cp.actif);
    if (!hasEphemere) return;
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [checkpoints]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Icône du marqueur temporaire créée côté client (ne peut pas être au niveau module)
  const pendingIcon = React.useMemo(() => makePendingIcon(), []);

  // Pré-calculer les checkpoints valides — se recalcule aussi quand `now` change (labels éphémères)
  const validCheckpoints = React.useMemo(
    () =>
      checkpoints.flatMap((cp, idx) => {
        const pos = safeCoords(cp.latitude, cp.longitude);
        if (!pos) return [];
        const color = cp.actif ? (TYPE_COLORS[cp.type] ?? '#3b82f6') : '#6b7280';
        const label =
          cp.type === 'DEPART' ? 'D'
          : cp.type === 'ARRIVEE' ? 'A'
          : cp.type === 'EPHEMERE_QG' ? ephemereLabel(cp.expires_at, now)
          : String(cp.ordre_affichage ?? idx + 1);
        const pulse = cp.actif && cp.type === 'EPHEMERE_QG';
        return [{ cp, pos, color, label, pulse }];
      }),
    [checkpoints, now],
  );

  const pendingPos = pendingMarker ? safeCoords(pendingMarker.lat, pendingMarker.lng) : null;

  const cssFullscreen = isFullscreen && !document.fullscreenElement;

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-full"
      style={cssFullscreen ? { position: 'fixed', inset: 0, zIndex: 9999 } : undefined}
    >
      <MapContainer
        center={[46.5, 2.5]}
        zoom={6}
        className="w-full h-full"
        style={{ background: '#1f2937' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds checkpoints={checkpoints} />
        {onMapClick && <ClickHandler onMapClick={onMapClick} />}

        {/* Cercles de rayon (frères des Markers, jamais enfants) */}
        {validCheckpoints.map(({ cp, pos, color }) =>
          cp.rayon_validation_metres > 0 ? (
            <Circle
              key={`circle-${cp.id}`}
              center={pos}
              radius={cp.rayon_validation_metres}
              pathOptions={{ color, fillOpacity: 0.12, weight: 1 }}
            />
          ) : null,
        )}

        {/* Markers des checkpoints existants */}
        {validCheckpoints.map(({ cp, pos, color, label, pulse }) => (
          <Marker key={`marker-${cp.id}`} position={pos} icon={makeCircleIcon(color, label, pulse)}>
            <Popup>
              <div className="text-sm">
                <strong>{cp.nom}</strong>
                <div className="text-yellow-600">{cp.points} pts</div>
                <div className="text-gray-500">
                  {cp.type_validation} · {cp.rayon_validation_metres}m
                </div>
                {cp.type === 'DEPART' && (
                  <div className="text-green-600 font-medium">
                    Départ{cp.formats.length > 0 ? ` · ${cp.formats.map((f) => f.nom).join(', ')}` : ''}
                  </div>
                )}
                {cp.type === 'ARRIVEE' && <div className="text-red-500 font-medium">Arrivée</div>}
                {cp.type === 'EPHEMERE_QG' && <div className="text-orange-500">QG éphémère</div>}
                {!cp.actif && <div className="text-red-500">Inactif</div>}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Marqueur temporaire de placement */}
        {pendingPos && (
          <Marker position={pendingPos} icon={pendingIcon}>
            <Popup>
              <div className="text-sm">
                <strong>Nouveau checkpoint</strong>
                <div className="text-gray-500 font-mono text-xs">
                  {pendingPos[0].toFixed(5)}, {pendingPos[1].toFixed(5)}
                </div>
                <div className="text-orange-500 text-xs mt-1">
                  Remplissez le formulaire pour confirmer
                </div>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Hint "cliquez pour placer" */}
      {onMapClick && !pendingPos && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full shadow">
            <MousePointer2 className="w-3.5 h-3.5 text-orange-400" />
            Cliquez sur la carte pour placer un checkpoint
          </div>
        </div>
      )}

      {/* Hint quand marqueur posé */}
      {onMapClick && pendingPos && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
          <div className="flex items-center gap-1.5 bg-orange-600/80 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full shadow">
            <span className="w-2 h-2 rounded-full bg-white" />
            Position sélectionnée · Complétez le formulaire ci-dessous
          </div>
        </div>
      )}

      {/* Bouton plein écran */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-2 right-2 z-[1000] bg-white/90 hover:bg-white text-gray-700 hover:text-gray-900 rounded-lg p-1.5 shadow-md transition-colors"
        title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
      >
        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>

      {/* Bouton quitter en CSS-fallback */}
      {cssFullscreen && (
        <button
          onClick={() => setIsFullscreen(false)}
          className="absolute top-12 right-2 z-[1000] bg-black/70 text-white text-xs px-2 py-1 rounded shadow"
        >
          Fermer
        </button>
      )}
    </div>
  );
}
