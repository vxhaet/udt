'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch, uploadFile } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

const CameraCapture = dynamic(() => import('@/components/CameraCapture'), { ssr: false });

interface Checkpoint {
  id: string;
  nom: string;
  description?: string;
  latitude: number;
  longitude: number;
  points?: number;
  rayon_validation_metres: number;
  type_validation: 'AUTO' | 'MANUELLE' | 'MIXTE';
  type: 'NORMAL' | 'DEPART' | 'ARRIVEE' | 'EPHEMERE_QG';
  ordre_affichage?: number | null;
}

interface Validation {
  id: string;
  checkpoint_id: string;
  equipe_id: string;
  statut: 'APPROUVE' | 'EN_ATTENTE' | 'REJETE';
  points_accordes: number;
  validated_at: string;
}

interface CarteResponse {
  depart: { lat: number; lng: number } | null;
  arrivee: { lat: number; lng: number } | null;
  checkpoints: Checkpoint[];
  validations: Validation[];
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Echelle de couleurs UDT : gradient jaune → violet selon les points
function getPointColor(pts: number): string {
  if (pts <= 1) return '#fbbf24'; // jaune
  if (pts === 2) return '#f97316'; // orange
  if (pts === 3) return '#f15bb5'; // rose
  if (pts === 4) return '#a855f7'; // violet
  return '#7c3aed'; // violet fonce (5+)
}

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export default function CartePage() {
  const { payload } = useAuth();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Layer[]>([]);

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [validations, setValidations] = useState<Validation[]>([]);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedCp, setSelectedCp] = useState<Checkpoint | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ statut: string; points: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const fittedRef = useRef(false);
  const [showCamera, setShowCamera] = useState(false);

  const myValidatedCpIds = validations
    .filter((v) => v.equipe_id === payload?.equipeId && (v.statut === 'APPROUVE' || v.statut === 'EN_ATTENTE'))
    .map((v) => v.checkpoint_id);

  const fetchData = useCallback(async () => {
    if (!payload) return;
    try {
      const data = await apiFetch<CarteResponse>(`/editions/${payload.editionId}/carte`);
      setCheckpoints(data.checkpoints);
      setValidations(data.validations);
    } catch (err) {
      console.error('Fetch carte error:', err);
    } finally {
      setLoading(false);
    }
  }, [payload]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // GPS watch
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn('GPS error:', err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refresh = () => fetchData();
    socket.on('validation:approved', refresh);
    socket.on('checkpoint:revealed', refresh);
    socket.on('checkpoint:taken', refresh);
    socket.on('checkpoint:expired', refresh);
    return () => {
      socket.off('validation:approved', refresh);
      socket.off('checkpoint:revealed', refresh);
      socket.off('checkpoint:taken', refresh);
      socket.off('checkpoint:expired', refresh);
    };
  }, [fetchData]);

  // Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    import('leaflet').then((L) => {
      if (!mapContainerRef.current || mapRef.current) return;

      const map = L.map(mapContainerRef.current, { zoomControl: false, attributionControl: false });
      L.tileLayer(TILE_URL, { maxZoom: 19 }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      map.setView([46.5, 2.5], 6);
      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Update markers when data changes
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    import('leaflet').then((L) => {
      const map = mapRef.current;
      if (!map) return;

      // Clear old markers
      markersRef.current.forEach((m) => map.removeLayer(m));
      markersRef.current = [];

      const allPts: [number, number][] = [];

      for (const cp of checkpoints) {
        const isValidated = myValidatedCpIds.includes(cp.id);
        let color: string;
        if (isValidated) {
          color = '#6b7280';
        } else if (cp.type === 'DEPART') {
          color = '#22c55e';
        } else if (cp.type === 'ARRIVEE') {
          color = '#ef4444';
        } else if (cp.type === 'EPHEMERE_QG') {
          color = '#e11d48';
        } else {
          color = getPointColor(cp.points ?? 1);
        }

        const label = isValidated ? '&#10003;' : cp.type === 'DEPART' ? 'D' : cp.type === 'ARRIVEE' ? '' : cp.type === 'EPHEMERE_QG' ? 'QG' : String(cp.points ?? '');

        let iconHtml: string;
        if (cp.type === 'ARRIVEE' && !isValidated) {
          iconHtml = `<div style="width:32px;height:32px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.5);overflow:hidden;background:conic-gradient(#000 0% 25%, #fff 25% 50%, #000 50% 75%, #fff 75%) 0 0/16px 16px"></div>`;
        } else if (cp.type === 'EPHEMERE_QG' && !isValidated) {
          iconHtml = `<div style="width:36px;height:36px;border-radius:50%;background:#e11d48;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:white;box-shadow:0 0 16px rgba(225,29,72,.7);animation:udt-qg-pulse 1s ease-in-out infinite">QG</div>`;
        } else {
          iconHtml = `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;box-shadow:0 2px 8px rgba(0,0,0,.5);opacity:${isValidated ? 0.5 : 1}">${label}</div>`;
        }

        const icon = L.divIcon({
          className: '',
          html: iconHtml,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([cp.latitude, cp.longitude], { icon })
          .bindTooltip(cp.nom, { direction: 'top' })
          .on('click', () => { if (!isValidated) setSelectedCp(cp); })
          .addTo(map);

        // Validation radius circle
        const circle = L.circle([cp.latitude, cp.longitude], {
          radius: cp.rayon_validation_metres,
          color: isValidated ? '#6b7280' : color,
          fillColor: isValidated ? '#6b7280' : color,
          fillOpacity: 0.08,
          weight: 1,
          opacity: 0.3,
        }).addTo(map);

        markersRef.current.push(marker, circle);
        allPts.push([cp.latitude, cp.longitude]);
      }

      // User position marker
      if (userPos) {
        const userIcon = L.divIcon({
          className: '',
          html: '<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 12px rgba(59,130,246,.6)"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        const userMarker = L.marker([userPos.lat, userPos.lng], { icon: userIcon, zIndexOffset: 2000 }).addTo(map);
        markersRef.current.push(userMarker);
      }

      if (allPts.length > 0 && !fittedRef.current) {
        fittedRef.current = true;
        try { map.fitBounds(allPts, { padding: [50, 50], maxZoom: 15 }); } catch {}
      }
    });
  }, [checkpoints, validations, userPos, myValidatedCpIds, mapReady]);

  function handlePhotoCaptured(file: File) {
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setShowCamera(false);
  }

  async function handleValidate() {
    if (!selectedCp || !userPos || !payload) return;
    setValidating(true);
    setValidationResult(null);
    try {
      let photo_url: string | undefined;
      if (photo) photo_url = await uploadFile(photo);

      const data = await apiFetch<{ statut: string; points_accordes: number }>('/validations', {
        method: 'POST',
        body: JSON.stringify({
          checkpointId: selectedCp.id,
          latitude: userPos.lat,
          longitude: userPos.lng,
          photo_url,
        }),
      });

      setValidationResult({ statut: data.statut, points: data.points_accordes });
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur de validation');
    } finally {
      setValidating(false);
    }
  }

  function closeSheet() {
    setSelectedCp(null);
    setPhoto(null);
    setPhotoPreview(null);
    setValidationResult(null);
  }

  function centerOnUser() {
    if (mapRef.current && userPos) {
      mapRef.current.setView([userPos.lat, userPos.lng], 16);
    }
  }

  const distanceToCp = selectedCp && userPos
    ? haversineMeters(userPos.lat, userPos.lng, selectedCp.latitude, selectedCp.longitude)
    : null;
  const isInRange = distanceToCp !== null && selectedCp ? distanceToCp <= selectedCp.rayon_validation_metres : false;

  return (
    <div className="absolute inset-0">
      {/* Map */}
      <div ref={mapContainerRef} className="w-full h-full" style={{ zIndex: 0 }} />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-zinc-950/80 flex items-center justify-center z-10">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-brand-pink rounded-full animate-spin" />
        </div>
      )}

      {/* FAB: Center on user */}
      <button
        onClick={centerOnUser}
        className="fixed top-20 right-4 w-10 h-10 bg-zinc-900 border border-zinc-700 rounded-full flex items-center justify-center text-white shadow-lg" style={{ zIndex: 9998 }}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4m0 12v4m-10-10h4m12 0h4" />
        </svg>
      </button>

      {/* FAB: Refresh */}
      <button
        onClick={fetchData}
        className="fixed top-32 right-4 w-10 h-10 bg-zinc-900 border border-zinc-700 rounded-full flex items-center justify-center text-white shadow-lg" style={{ zIndex: 9998 }}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
        </svg>
      </button>

      {/* FAB: Validate checkpoint */}
      {!selectedCp && (
        <button
          onClick={() => {
            if (!userPos) {
              alert('Position GPS non disponible. Autorise la geolocalisation dans les reglages de ton navigateur.');
              return;
            }
            // Find nearest non-validated checkpoint
            const available = checkpoints.filter(
              (cp) => !myValidatedCpIds.includes(cp.id) && cp.type !== 'DEPART' && cp.type !== 'ARRIVEE'
            );
            if (available.length === 0) {
              alert('Aucun checkpoint disponible.');
              return;
            }
            let nearest = available[0];
            let nearestDist = haversineMeters(userPos.lat, userPos.lng, nearest.latitude, nearest.longitude);
            for (const cp of available) {
              const d = haversineMeters(userPos.lat, userPos.lng, cp.latitude, cp.longitude);
              if (d < nearestDist) { nearest = cp; nearestDist = d; }
            }
            setSelectedCp(nearest);
            if (mapRef.current) {
              mapRef.current.setView([nearest.latitude, nearest.longitude], 16);
            }
          }}
          className="fixed left-1/2 -translate-x-1/2 bottom-24 bg-udt-gradient text-white font-bold text-sm px-6 py-3.5 rounded-2xl shadow-lg flex items-center gap-2 transition-opacity hover:opacity-90"
          style={{ zIndex: 9998 }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          Valider un checkpoint
        </button>
      )}

      {/* Bottom sheet for checkpoint */}
      {selectedCp && (
        <div className="fixed inset-x-0 bg-zinc-900 border-t border-zinc-700 rounded-t-2xl max-h-[60vh] overflow-auto" style={{ bottom: '4rem', zIndex: 9998 }}
          <div className="p-5 space-y-4">
            {/* Handle */}
            <div className="flex justify-center">
              <div className="w-10 h-1 bg-zinc-700 rounded-full" />
            </div>

            {/* Validation result */}
            {validationResult ? (
              <div className="text-center py-6 space-y-3">
                {validationResult.statut === 'APPROUVE' ? (
                  <>
                    <div className="w-16 h-16 bg-green-500/20 border border-green-500/40 rounded-full flex items-center justify-center mx-auto">
                      <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-xl font-black text-white">{selectedCp.nom}</p>
                    <p className="text-3xl font-black text-green-400">+{validationResult.points} pts</p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-amber-500/20 border border-amber-500/40 rounded-full flex items-center justify-center mx-auto">
                      <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-xl font-black text-white">{selectedCp.nom}</p>
                    <p className="text-sm text-amber-400 font-semibold">En attente de validation par le QG</p>
                  </>
                )}
                <button onClick={closeSheet} className="mt-4 text-sm text-zinc-400 hover:text-white transition-colors">
                  Fermer
                </button>
              </div>
            ) : (
              <>
                {/* Checkpoint info */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-black text-white">{selectedCp.nom}</h3>
                    {selectedCp.description && (
                      <p className="text-sm text-zinc-400 mt-1">{selectedCp.description}</p>
                    )}
                  </div>
                  <button onClick={closeSheet} className="text-zinc-500 hover:text-white p-1">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 text-sm">
                  {selectedCp.points !== undefined && (
                    <span className="bg-brand-pink/15 text-brand-pink font-bold px-3 py-1 rounded-lg">
                      {selectedCp.points} pts
                    </span>
                  )}
                  <span className="text-zinc-500">
                    {selectedCp.type_validation === 'AUTO' ? 'Validation auto' : selectedCp.type_validation === 'MANUELLE' ? 'Validation manuelle' : 'Validation mixte'}
                  </span>
                </div>

                {/* Distance */}
                {distanceToCp !== null && (
                  <div className={`flex items-center gap-2 text-sm font-semibold ${isInRange ? 'text-green-400' : 'text-zinc-400'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${isInRange ? 'bg-green-400' : 'bg-zinc-600'}`} />
                    {distanceToCp < 1000
                      ? `${Math.round(distanceToCp)} m`
                      : `${(distanceToCp / 1000).toFixed(1)} km`}
                    {isInRange ? ' — A portee !' : ` — Rayon: ${selectedCp.rayon_validation_metres} m`}
                  </div>
                )}

                {/* Photo */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Photo (optionnelle)
                  </label>
                  {photoPreview ? (
                    <div className="relative">
                      <img src={photoPreview} alt="Preview" className="w-full h-40 object-cover rounded-xl" />
                      <button
                        onClick={() => { setPhoto(null); setPhotoPreview(null); }}
                        className="absolute top-2 right-2 w-7 h-7 bg-zinc-900/80 rounded-full flex items-center justify-center text-white"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="flex items-center justify-center gap-2 w-full h-24 bg-zinc-800 border border-zinc-700 border-dashed rounded-xl text-zinc-500 text-sm cursor-pointer hover:border-zinc-500 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                      </svg>
                      Prendre une photo
                    </button>
                  )}
                </div>

                {/* Validate button */}
                <button
                  onClick={handleValidate}
                  disabled={!isInRange || validating}
                  className="w-full bg-udt-gradient disabled:opacity-40 text-white font-bold text-sm py-4 rounded-2xl transition-opacity hover:opacity-90"
                >
                  {validating
                    ? 'Validation en cours...'
                    : !isInRange
                    ? 'Rapproche-toi du checkpoint'
                    : 'Valider ce checkpoint'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {/* Camera */}
      {showCamera && (
        <CameraCapture
          onCapture={handlePhotoCaptured}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
