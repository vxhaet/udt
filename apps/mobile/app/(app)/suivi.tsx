import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import WebView from 'react-native-webview';
import { useEffect, useRef, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, type CarteData, type ClassementEntry } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/hooks/useSocket';

// ── Couleurs par équipe ────────────────────────────────────────────────────────

const TEAM_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#a855f7',
  '#f97316', '#06b6d4', '#ec4899', '#eab308',
  '#14b8a6', '#f43f5e', '#84cc16', '#6366f1',
];

// ── HTML Leaflet ───────────────────────────────────────────────────────────────

const SUIVI_MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;background:#030712}
.leaflet-tooltip{background:#0f172a;border:1px solid #334155;color:#e2e8f0;font-size:11px;padding:4px 8px}
</style>
</head>
<body>
<div id="map" style="width:100%;height:100vh"></div>
<script>
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
map.setView([46.5,2.5],6);
L.control.zoom({position:'bottomright'}).addTo(map);

var CPCOLORS={DEPART:'#22c55e',ARRIVEE:'#ef4444',EPHEMERE_QG:'#f97316',NORMAL:'#3b82f6'};
var _cpMarkers=[],_teamLines=[],_teamMarkers=[];

function mkCpIcon(color,label){
  return L.divIcon({
    className:'',
    html:'<div style="width:26px;height:26px;border-radius:50%;background:'+color+';border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:white;box-shadow:0 2px 6px rgba(0,0,0,.4)">'+label+'</div>',
    iconSize:[26,26],iconAnchor:[13,13]
  });
}

function mkTeamIcon(color,initials){
  return L.divIcon({
    className:'',
    html:'<div style="width:30px;height:30px;border-radius:8px;background:'+color+';border:2.5px solid white;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:white;box-shadow:0 2px 8px rgba(0,0,0,.55)">'+initials+'</div>',
    iconSize:[30,30],iconAnchor:[15,15]
  });
}

window.updateSuivi=function(data){
  _cpMarkers.forEach(function(m){m.remove();});
  _teamLines.forEach(function(l){l.remove();});
  _teamMarkers.forEach(function(m){m.remove();});
  _cpMarkers=[];_teamLines=[];_teamMarkers=[];

  var allPts=[];

  (data.checkpoints||[]).forEach(function(cp){
    if(cp.latitude==null||cp.longitude==null)return;
    var t=cp.type||'NORMAL';
    var color=CPCOLORS[t]||'#3b82f6';
    var label=t==='DEPART'?'D':t==='ARRIVEE'?'A':String(cp.ordre_affichage||cp.points||'?');
    var m=L.marker([cp.latitude,cp.longitude],{icon:mkCpIcon(color,label),zIndexOffset:100}).addTo(map);
    m.bindTooltip(cp.nom||'',{direction:'top'});
    _cpMarkers.push(m);
    allPts.push([cp.latitude,cp.longitude]);
  });

  if(allPts.length>0){try{map.fitBounds(allPts,{padding:[50,50]});}catch(e){}}

  (data.teams||[]).forEach(function(team){
    if(!team.path||team.path.length===0)return;
    var line=L.polyline(team.path,{color:team.color,weight:3.5,opacity:0.85}).addTo(map);
    _teamLines.push(line);
    var last=team.path[team.path.length-1];
    var initials=(team.nom||'??').replace(/[^A-Za-z\u00C0-\u024F ]/g,'').trim().split(' ').map(function(w){return w[0]||'';}).slice(0,2).join('').toUpperCase()||'??';
    var m=L.marker(last,{icon:mkTeamIcon(team.color,initials),zIndexOffset:1000}).addTo(map);
    m.bindTooltip('<b>'+team.nom+'</b><br>'+team.nbCps+' CP',{direction:'top',permanent:false});
    _teamMarkers.push(m);
  });
};
</script>
</body>
</html>`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SuiviTeam {
  id: string;
  nom: string;
  color: string;
  path: [number, number][];
  nbCps: number;
}

interface SuiviData {
  checkpoints: CarteData['checkpoints'];
  teams: SuiviTeam[];
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function SuiviScreen() {
  const { editionId } = useAuth();
  const socket = useSocket();
  const webRef = useRef<WebView>(null);
  const mapReadyRef = useRef(false);
  const suiviDataRef = useRef<SuiviData | null>(null);

  const [suiviData, setSuiviData] = useState<SuiviData | null>(null);
  const [gelActif, setGelActif] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Inject dans WebView ──────────────────────────────────────────────────────

  const injectSuivi = useCallback((data: SuiviData) => {
    if (!mapReadyRef.current) return;
    webRef.current?.injectJavaScript(
      `window.updateSuivi(${JSON.stringify(data)}); true;`,
    );
  }, []);

  // ── Chargement données ───────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!editionId) return;

    const [carteData, classement, edition] = await Promise.all([
      apiFetch<CarteData>(`/editions/${editionId}/carte`),
      apiFetch<ClassementEntry[]>(`/editions/${editionId}/classement`),
      apiFetch<{ gel_classement: string }>(`/editions/${editionId}`),
    ]);
    console.log('[Suivi] carteData.checkpoints:', JSON.stringify(carteData.checkpoints, null, 2));
    console.log('[Suivi] carteData.validations:', JSON.stringify(carteData.validations, null, 2));
    console.log('[Suivi] classement équipes:', JSON.stringify(classement, null, 2));

    // Map checkpoint_id → [lat, lng]
    const cpCoords = new Map<string, [number, number]>();
    for (const cp of carteData.checkpoints) {
      cpCoords.set(cp.id, [cp.latitude, cp.longitude]);
    }

    // Map equipeId → nom
    const equipeNames = new Map(classement.map((e) => [e.equipeId, e.nom]));

    // Grouper validations par équipe, triées par date
    const byEquipe = new Map<string, typeof carteData.validations>();
    for (const v of carteData.validations) {
      if (!byEquipe.has(v.equipe_id)) byEquipe.set(v.equipe_id, []);
      byEquipe.get(v.equipe_id)!.push(v);
    }

    const teams: SuiviTeam[] = [];
    let colorIdx = 0;
    for (const [equipeId, validations] of byEquipe) {
      const sorted = [...validations].sort(
        (a, b) => new Date(a.validated_at).getTime() - new Date(b.validated_at).getTime(),
      );
      const path: [number, number][] = [];
      for (const v of sorted) {
        const coords = cpCoords.get(v.checkpoint_id);
        if (coords) path.push(coords);
      }
      if (path.length > 0) {
        teams.push({
          id: equipeId,
          nom: equipeNames.get(equipeId) ?? `Équipe ${colorIdx + 1}`,
          color: TEAM_COLORS[colorIdx % TEAM_COLORS.length],
          path,
          nbCps: path.length,
        });
        colorIdx++;
      }
    }

    // Construire les checkpoints à afficher (inclure départ/arrivée)
    const allCheckpoints = [
      ...(carteData.depart ? [{
        id: '__depart__', type: 'DEPART' as const,
        latitude: carteData.depart.lat, longitude: carteData.depart.lng,
        nom: 'Départ', rayon_validation_metres: 0, actif: true,
        type_validation: 'AUTO' as const, ordre_affichage: undefined, points: undefined,
      }] : []),
      ...(carteData.arrivee ? [{
        id: '__arrivee__', type: 'ARRIVEE' as const,
        latitude: carteData.arrivee.lat, longitude: carteData.arrivee.lng,
        nom: 'Arrivée', rayon_validation_metres: 0, actif: true,
        type_validation: 'AUTO' as const, ordre_affichage: undefined, points: undefined,
      }] : []),
      ...carteData.checkpoints,
    ];

    setGelActif(new Date() >= new Date(edition.gel_classement));

    const data: SuiviData = { checkpoints: allCheckpoints as CarteData['checkpoints'], teams };
    suiviDataRef.current = data;
    setSuiviData(data);
    injectSuivi(data);
  }, [editionId, injectSuivi]);

  useEffect(() => {
    fetchData().catch(console.error).finally(() => setLoading(false));
  }, [fetchData]);

  // ── Socket temps réel ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchData().catch(console.error);
    socket.on('validation:approved', refresh);
    socket.on('checkpoint:revealed', refresh);
    return () => {
      socket.off('validation:approved', refresh);
      socket.off('checkpoint:revealed', refresh);
    };
  }, [socket, fetchData]);

  const handleMapReady = useCallback(() => {
    mapReadyRef.current = true;
    if (suiviDataRef.current) injectSuivi(suiviDataRef.current);
  }, [injectSuivi]);

  // ── Rendu ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Suivi live</Text>
          {suiviData && (
            <Text style={styles.headerSub}>
              {suiviData.teams.length} équipe{suiviData.teams.length > 1 ? 's' : ''} en course
            </Text>
          )}
        </View>
        {!gelActif && (
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Temps réel</Text>
          </View>
        )}
      </View>

      {/* Bandeau gel */}
      {gelActif && (
        <View style={styles.gelBanner}>
          <Text style={styles.gelBannerText}>Suivi gelé — résultats finaux en cours</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#3b82f6" size="large" />
          <Text style={styles.loadingText}>Chargement du suivi…</Text>
        </View>
      ) : (
        <View style={styles.mapWrapper}>
          <WebView
            ref={webRef}
            source={{ html: SUIVI_MAP_HTML }}
            style={styles.map}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            onLoadEnd={handleMapReady}
            onError={(e) => console.error('[Suivi] WebView error', e.nativeEvent)}
            scrollEnabled={false}
          />

          {/* Légende équipes */}
          {suiviData && suiviData.teams.length > 0 && (
            <View style={styles.legendWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.legendScroll}
              >
                {suiviData.teams.map((team) => (
                  <View key={team.id} style={styles.legendItem}>
                    <View style={[styles.legendColor, { backgroundColor: team.color }]} />
                    <Text style={styles.legendName} numberOfLines={1}>{team.nom}</Text>
                    <Text style={styles.legendCps}>{team.nbCps} CP</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030712' },
  header: {
    paddingHorizontal: 16, paddingVertical: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  headerSub: { color: '#6b7280', fontSize: 13, marginTop: 2 },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
  liveText: { color: '#22c55e', fontSize: 12 },
  gelBanner: {
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(251,191,36,0.2)',
    paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center',
  },
  gelBannerText: { color: '#fbbf24', fontSize: 13, fontWeight: '500' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#6b7280', fontSize: 14, marginTop: 12 },
  mapWrapper: { flex: 1 },
  map: { flex: 1 },
  legendWrapper: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(3,7,18,0.88)',
    borderTopWidth: 1, borderTopColor: '#1e293b',
    paddingVertical: 8,
  },
  legendScroll: { paddingHorizontal: 12, gap: 8 },
  legendItem: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0f172a', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#1e293b',
    maxWidth: 160,
  },
  legendColor: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  legendName: { color: '#e2e8f0', fontSize: 12, fontWeight: '500', flex: 1 },
  legendCps: { color: '#64748b', fontSize: 11 },
});
