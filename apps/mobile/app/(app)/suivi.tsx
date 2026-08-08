import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Pressable,
} from 'react-native';
import WebView from 'react-native-webview';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, type CarteData, type ClassementEntry } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/hooks/useSocket';
import { DEPART_COLOR, buildPointsColorMap } from '@/lib/pointsColors';

// ── Couleur déterministe par équipe ───────────────────────────────────────────

function teamColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

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
window.ReactNativeWebView && window.ReactNativeWebView.postMessage('MAP_READY');

var _cpMarkers=[],_teamLines=[],_teamMarkers=[];

function mkCpIcon(color,label,isDepart){
  if(isDepart){
    var w=Math.max(30,label.length*8+14);
    return L.divIcon({
      className:'',
      html:'<div style="min-width:'+w+'px;height:30px;border-radius:15px;background:'+color+';border:2px solid white;display:flex;align-items:center;justify-content:center;padding:0 6px;font-size:10px;font-weight:900;color:white;box-shadow:0 2px 6px rgba(0,0,0,.4);white-space:nowrap">'+label+'</div>',
      iconSize:[w,30],iconAnchor:[w/2,15]
    });
  }
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
  window.ReactNativeWebView && window.ReactNativeWebView.postMessage('SUIVI teams='+(data.teams?data.teams.length:'undef')+' cps='+(data.checkpoints?data.checkpoints.length:'undef'));
  _cpMarkers.forEach(function(m){m.remove();});
  _teamLines.forEach(function(l){l.remove();});
  _teamMarkers.forEach(function(m){m.remove();});
  _cpMarkers=[];_teamLines=[];_teamMarkers=[];

  var allPts=[];

  var pcm=data.pointsColorMap||{};
  var depColor=data.departColor||'#10b981';
  (data.checkpoints||[]).forEach(function(cp){
    if(cp.latitude==null||cp.longitude==null)return;
    var t=cp.type||'NORMAL';
    var isDepart=t==='DEPART';
    var isArrivee=t==='ARRIVEE';
    var isEph=t==='EPHEMERE_QG';
    var color;
    if(isDepart){color=depColor;}
    else if(isArrivee){color='#ef4444';}
    else if(isEph){color='#f97316';}
    else{color=pcm[String(cp.points)]||'#3b82f6';}
    var label;
    if(isDepart){var fn=cp.formats&&cp.formats[0]?cp.formats[0].nom:'D';label=fn;}
    else if(isArrivee){label='A';}
    else{label=String(cp.ordre_affichage||cp.points||'?');}
    var m=L.marker([cp.latitude,cp.longitude],{icon:mkCpIcon(color,label,isDepart),zIndexOffset:100}).addTo(map);
    m.bindTooltip(cp.nom||'',{direction:'top'});
    _cpMarkers.push(m);
    allPts.push([cp.latitude,cp.longitude]);
  });

  if(allPts.length>0){try{map.fitBounds(allPts,{padding:[50,50]});}catch(e){}}

  (data.teams||[]).forEach(function(team){
    if(!team.path||team.path.length===0)return;
    var line=L.polyline(team.path,{color:team.color,weight:3.5,opacity:0.85,dashArray:'8 6'}).addTo(map);
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
  formatId: string | null;
  formatNom: string | null;
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
  const [refreshing, setRefreshing] = useState(false);

  // ── Filtres ────────────────────────────────────────────────────────────────────

  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [activeTeamIds, setActiveTeamIds] = useState<Set<string>>(new Set());
  // Flag : true tant que les filtres n'ont jamais été initialisés depuis des données
  const filtersInitRef = useRef(false);

  // Formats disponibles déduits des équipes
  const allFormats = useMemo(() => {
    if (!suiviData) return [];
    const seen = new Map<string, string>();
    for (const t of suiviData.teams) {
      if (t.formatId && !seen.has(t.formatId)) seen.set(t.formatId, t.formatNom ?? t.formatId);
    }
    return Array.from(seen.entries()).map(([id, nom]) => ({ id, nom }));
  }, [suiviData]);

  // Équipes visibles selon les filtres
  const visibleTeams = useMemo(() => {
    if (!suiviData) return [];
    return suiviData.teams.filter((t) => {
      if (t.formatId && !activeFormats.has(t.formatId)) return false;
      if (!t.formatId && activeFormats.size < allFormats.length) return false;
      return activeTeamIds.has(t.id);
    });
  }, [suiviData, activeFormats, activeTeamIds, allFormats.length]);

  // Équipes éligibles au filtre équipe (format coché)
  const teamChoices = useMemo(() => {
    if (!suiviData) return [];
    return suiviData.teams
      .filter((t) => {
        if (t.formatId && !activeFormats.has(t.formatId)) return false;
        if (!t.formatId && activeFormats.size < allFormats.length) return false;
        return true;
      })
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [suiviData, activeFormats, allFormats.length]);

  // ── Inject dans WebView ──────────────────────────────────────────────────────

  const injectSuivi = useCallback((checkpoints: SuiviData['checkpoints'], teams: SuiviTeam[]) => {
    if (!mapReadyRef.current) return;
    const pointsColorMap = buildPointsColorMap(checkpoints);
    webRef.current?.injectJavaScript(
      `window.updateSuivi(${JSON.stringify({ checkpoints, teams, pointsColorMap, departColor: DEPART_COLOR })}); true;`,
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
    // Map checkpoint_id → [lat, lng] (active checkpoints + coords from validations for inactive ones)
    const cpCoords = new Map<string, [number, number]>();
    for (const cp of carteData.checkpoints) {
      cpCoords.set(cp.id, [cp.latitude, cp.longitude]);
    }
    for (const v of carteData.validations) {
      if (!cpCoords.has(v.checkpoint_id)) {
        cpCoords.set(v.checkpoint_id, [v.checkpoint.latitude, v.checkpoint.longitude]);
      }
    }

    // Map equipeId → { nom, formatId }
    const equipeInfo = new Map(classement.map((e) => [
      e.equipeId,
      { nom: e.nom, formatId: e.format_course?.id ?? null, formatNom: e.format_course?.nom ?? null },
    ]));

    // Résoudre le checkpoint DEPART spécifique au format (pas de fallback)
    const departByFormat = new Map<string, [number, number]>();
    for (const cp of carteData.checkpoints) {
      if (cp.type !== 'DEPART') continue;
      for (const f of cp.formats ?? []) {
        departByFormat.set(f.id, [cp.latitude, cp.longitude]);
      }
    }

    function getDepartForEquipe(equipeId: string): [number, number] | null {
      const info = equipeInfo.get(equipeId);
      if (!info?.formatId) return null;
      const specific = departByFormat.get(info.formatId);
      if (specific) return specific;
      console.error(`[Suivi] ERREUR CONFIG: format "${info.formatNom}" (${info.formatId}) sans checkpoint DEPART`);
      return null;
    }

    // Grouper validations par équipe, triées par date
    const byEquipe = new Map<string, typeof carteData.validations>();
    for (const v of carteData.validations) {
      if (!byEquipe.has(v.equipe_id)) byEquipe.set(v.equipe_id, []);
      byEquipe.get(v.equipe_id)!.push(v);
    }

    const teams: SuiviTeam[] = [];
    for (const [equipeId, validations] of byEquipe) {
      const sorted = [...validations].sort(
        (a, b) => new Date(a.validated_at).getTime() - new Date(b.validated_at).getTime(),
      );
      const depart = getDepartForEquipe(equipeId);
      const path: [number, number][] = [];
      if (depart) path.push(depart);
      for (const v of sorted) {
        const coords = cpCoords.get(v.checkpoint_id);
        if (coords) path.push(coords);
      }
      // Au moins 1 validation (le départ seul ne compte pas)
      if (path.length > (depart ? 1 : 0)) {
        const info = equipeInfo.get(equipeId);
        teams.push({
          id: equipeId,
          nom: info?.nom ?? equipeId,
          color: teamColor(equipeId),
          path,
          nbCps: path.length - (depart ? 1 : 0),
          formatId: info?.formatId ?? null,
          formatNom: info?.formatNom ?? null,
        });
      }
    }

    // Les checkpoints DEPART/ARRIVEE sont déjà dans carteData.checkpoints
    const allCheckpoints = carteData.checkpoints;

    setGelActif(new Date() >= new Date(edition.gel_classement));

    const data: SuiviData = { checkpoints: allCheckpoints as CarteData['checkpoints'], teams };
    suiviDataRef.current = data;
    setSuiviData(data);

    // Initialiser les filtres au premier chargement ; ajouter les nouvelles équipes aux suivants
    if (!filtersInitRef.current) {
      filtersInitRef.current = true;
      const fmtIds = new Set<string>();
      for (const t of teams) { if (t.formatId) fmtIds.add(t.formatId); }
      setActiveFormats(fmtIds);
      setActiveTeamIds(new Set(teams.map((t) => t.id)));
    } else {
      // Ajouter les nouvelles équipes/formats sans écraser les choix existants
      setActiveFormats((prev) => {
        const next = new Set(prev);
        for (const t of teams) { if (t.formatId && !next.has(t.formatId)) next.add(t.formatId); }
        return next.size === prev.size ? prev : next;
      });
      setActiveTeamIds((prev) => {
        const next = new Set(prev);
        for (const t of teams) { if (!next.has(t.id)) next.add(t.id); }
        return next.size === prev.size ? prev : next;
      });
    }
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
    socket.on('checkpoint:taken', refresh);
    socket.on('checkpoint:expired', refresh);
    return () => {
      socket.off('validation:approved', refresh);
      socket.off('checkpoint:revealed', refresh);
      socket.off('checkpoint:taken', refresh);
      socket.off('checkpoint:expired', refresh);
    };
  }, [socket, fetchData]);

  const handleMapReady = useCallback(() => {
    mapReadyRef.current = true;
    if (suiviDataRef.current) {
      injectSuivi(suiviDataRef.current.checkpoints, suiviDataRef.current.teams);
    }
  }, [injectSuivi]);

  // Réinjecter dans la WebView quand les filtres changent
  useEffect(() => {
    if (!suiviData) return;
    injectSuivi(suiviData.checkpoints, visibleTeams);
  }, [visibleTeams]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Callbacks filtres ──────────────────────────────────────────────────────────

  const toggleFormat = useCallback((formatId: string) => {
    setActiveFormats((prev) => {
      const next = new Set(prev);
      if (next.has(formatId)) next.delete(formatId);
      else next.add(formatId);
      return next;
    });
  }, []);

  const toggleTeam = useCallback((teamId: string) => {
    setActiveTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData().catch(console.error);
    setRefreshing(false);
  }, [fetchData]);

  // ── Rendu ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Suivi live</Text>
          {suiviData && (
            <Text style={styles.headerSub}>
              {visibleTeams.length}/{suiviData.teams.length} équipe{suiviData.teams.length > 1 ? 's' : ''}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {!gelActif && (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={handleRefresh}
            disabled={refreshing}
            hitSlop={6}
          >
            {refreshing
              ? <ActivityIndicator color="#94a3b8" size={16} />
              : <Ionicons name="refresh" size={16} color="#94a3b8" />}
          </TouchableOpacity>
          {suiviData && suiviData.teams.length > 0 && (
            <TouchableOpacity
              style={[styles.headerIconBtn, filterOpen && styles.filterBtnActive]}
              onPress={() => setFilterOpen((v) => !v)}
              hitSlop={6}
            >
              <Ionicons name="filter" size={16} color={filterOpen ? 'white' : '#94a3b8'} />
            </TouchableOpacity>
          )}
        </View>
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
            onMessage={(e) => {
              const msg = e.nativeEvent.data;
              console.log('[Suivi][WebView]', msg);
              if (msg === 'MAP_READY') handleMapReady();
            }}
            onError={(e) => console.error('[Suivi] WebView error', e.nativeEvent)}
            scrollEnabled={false}
          />

          {/* Panneau de filtres */}
          {filterOpen && suiviData && (
            <View style={styles.filterPanel}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Filtre par format */}
                {allFormats.length > 0 && (
                  <>
                    <Text style={styles.filterSection}>Formats</Text>
                    {allFormats.map((f) => {
                      const on = activeFormats.has(f.id);
                      return (
                        <Pressable key={f.id} style={styles.filterRow} onPress={() => toggleFormat(f.id)}>
                          <Ionicons
                            name={on ? 'checkbox' : 'square-outline'}
                            size={18}
                            color={on ? '#3b82f6' : '#475569'}
                          />
                          <Text style={[styles.filterLabel, on && styles.filterLabelActive]}>{f.nom}</Text>
                        </Pressable>
                      );
                    })}
                  </>
                )}

                {/* Filtre par équipe */}
                {teamChoices.length > 0 && (
                  <>
                    <Text style={[styles.filterSection, { marginTop: 10 }]}>Équipes</Text>
                    {teamChoices.map((t) => {
                      const on = activeTeamIds.has(t.id);
                      return (
                        <Pressable key={t.id} style={styles.filterRow} onPress={() => toggleTeam(t.id)}>
                          <Ionicons
                            name={on ? 'checkbox' : 'square-outline'}
                            size={18}
                            color={on ? '#3b82f6' : '#475569'}
                          />
                          <View style={[styles.filterDot, { backgroundColor: t.color }]} />
                          <Text style={[styles.filterLabel, on && styles.filterLabelActive]} numberOfLines={2}>
                            {t.nom}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </>
                )}
              </ScrollView>
            </View>
          )}

          {/* Légende équipes visibles */}
          {visibleTeams.length > 0 && (
            <View style={styles.legendWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.legendScroll}
              >
                {visibleTeams.map((team) => (
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
  liveText: { color: '#22c55e', fontSize: 11 },
  headerIconBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b',
    justifyContent: 'center', alignItems: 'center',
  },
  filterBtnActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
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

  // Panneau filtres
  filterPanel: {
    position: 'absolute', top: 10, left: 10, right: 90,
    backgroundColor: 'rgba(15,23,42,0.94)',
    borderRadius: 12, borderWidth: 1, borderColor: '#1e293b',
    paddingHorizontal: 12, paddingVertical: 10,
    maxHeight: 300,
  },
  filterSection: {
    color: '#64748b', fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 4,
  },
  filterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 5,
  },
  filterDot: { width: 8, height: 8, borderRadius: 4 },
  filterLabel: { color: '#64748b', fontSize: 13, flex: 1 },
  filterLabelActive: { color: '#e2e8f0' },

  // Légende
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
