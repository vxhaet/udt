import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, Image,
} from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, type CarteData, type Checkpoint } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/hooks/useSocket';

// ── Haversine (client) ────────────────────────────────────────────────────────

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── HTML Leaflet injecté dans la WebView ──────────────────────────────────────

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%;background:#030712}
@keyframes udt-pulse{0%,100%{opacity:1}50%{opacity:0.3}}
.udt-pulse{animation:udt-pulse 0.8s ease-in-out infinite}
</style>
</head>
<body>
<div id="map" style="width:100%;height:100vh"></div>
<script>
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
map.setView([46.5,2.5],6);
L.control.zoom({position:'bottomright'}).addTo(map);

var _user=null,_markers={},_circles={};
var COLORS={DEPART:'#22c55e',ARRIVEE:'#ef4444',EPHEMERE_QG:'#f97316',NORMAL:'#3b82f6'};

function resolveType(cp){
  if(cp.type)return cp.type;
  var n=(cp.nom||'').toLowerCase();
  if(n.indexOf('d\u00e9part')!==-1||n.indexOf('depart')!==-1)return 'DEPART';
  if(n.indexOf('arriv')!==-1)return 'ARRIVEE';
  return 'NORMAL';
}

function mkIcon(color,label,dim,pulse){
  return L.divIcon({
    className:'',
    html:'<div class="'+(pulse?'udt-pulse':'')+'" style="width:32px;height:32px;border-radius:50%;background:'+color+';border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:white;box-shadow:0 2px 6px rgba(0,0,0,.4);opacity:'+(dim?0.45:1)+'">'+label+'</div>',
    iconSize:[32,32],iconAnchor:[16,16]
  });
}

function post(obj){
  if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(obj));
}

window.updateCheckpoints=function(data){
  Object.values(_markers).forEach(function(m){m.remove();});
  Object.values(_circles).forEach(function(c){c.remove();});
  _markers={};_circles={};
  var validated=new Set(data.myValidations||[]);
  var pts=[];
  (data.checkpoints||[]).forEach(function(cp){
    if(cp.latitude==null||cp.longitude==null)return;
    pts.push([cp.latitude,cp.longitude]);
    var t=resolveType(cp);
    var isVal=validated.has(cp.id);
    var color=isVal?'#6b7280':(COLORS[t]||'#3b82f6');
    var label=t==='DEPART'?'D':t==='ARRIVEE'?'A':(isVal?'✓':String(cp.ordre_affichage||cp.points||'?'));
    var pulse=t==='EPHEMERE_QG'&&!isVal;
    var m=L.marker([cp.latitude,cp.longitude],{icon:mkIcon(color,label,isVal,pulse)}).addTo(map);
    var tappable=!isVal&&t!=='DEPART'&&t!=='ARRIVEE';
    if(tappable)(function(c){m.on('click',function(){post({type:'CP_TAP',checkpoint:c});});})(cp);
    _markers[cp.id]=m;
    if((cp.rayon_validation_metres||0)>0){
      _circles[cp.id]=L.circle([cp.latitude,cp.longitude],{
        radius:cp.rayon_validation_metres,color:color,fillOpacity:0.1,weight:1
      }).addTo(map);
    }
  });
  if(pts.length>0){try{map.fitBounds(pts,{padding:[40,40]});}catch(e){}}
};

window.removeMarker=function(id){
  if(_markers[id]){_markers[id].remove();delete _markers[id];}
  if(_circles[id]){_circles[id].remove();delete _circles[id];}
};

window.updatePosition=function(lat,lng){
  if(_user){_user.setLatLng([lat,lng]);}
  else{
    _user=L.circleMarker([lat,lng],{
      radius:9,fillColor:'#3b82f6',fillOpacity:1,color:'white',weight:2.5
    }).addTo(map);
  }
};

window.centerOnUser=function(){if(_user)map.setView(_user.getLatLng(),16);};
</script>
</body>
</html>`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValidationResult {
  statut: 'APPROUVE' | 'EN_ATTENTE';
  points_accordes: number;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function CarteScreen() {
  const router = useRouter();
  const { editionId, equipeId, signOut } = useAuth();
  const socket = useSocket();
  const webRef = useRef<WebView>(null);
  const mapReadyRef = useRef(false);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const carteDataRef = useRef<CarteData | null>(null);
  const equipeIdRef = useRef<string | null>(null);
  equipeIdRef.current = equipeId;

  const [carteData, setCarteData] = useState<CarteData | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // État du bottom sheet de validation
  const [selectedCp, setSelectedCp] = useState<Checkpoint | null>(null);
  const [validationPos, setValidationPos] = useState<{ lat: number; lng: number } | null>(null);
  const [validationStep, setValidationStep] = useState<'form' | 'submitting' | 'result'>('form');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // État du bouton "Valider"
  const [locatingGps, setLocatingGps] = useState(false);

  const myValidationIds = carteData?.validations
    .filter((v) => v.equipe_id === equipeId)
    .map((v) => v.checkpoint_id) ?? [];

  // ── Helpers WebView ─────────────────────────────────────────────────────────

  const injectCheckpoints = useCallback((data: CarteData) => {
    if (!mapReadyRef.current) return;
    const allCps = [
      ...(data.depart ? [{
        id: '__depart__', type: 'DEPART' as const,
        latitude: data.depart.lat, longitude: data.depart.lng,
        nom: 'Départ', rayon_validation_metres: 0, actif: true,
        type_validation: 'AUTO' as const,
      }] : []),
      ...(data.arrivee ? [{
        id: '__arrivee__', type: 'ARRIVEE' as const,
        latitude: data.arrivee.lat, longitude: data.arrivee.lng,
        nom: 'Arrivée', rayon_validation_metres: 0, actif: true,
        type_validation: 'AUTO' as const,
      }] : []),
      ...data.checkpoints
        .map((cp) => cp.actif !== false ? { ...cp, type: cp.type ?? 'NORMAL' } : null)
        .filter((cp): cp is NonNullable<typeof cp> => cp !== null),
    ];
    const myValidations = data.validations
      .filter((v) => v.equipe_id === equipeIdRef.current)
      .map((v) => v.checkpoint_id);
    webRef.current?.injectJavaScript(
      `window.updateCheckpoints(${JSON.stringify({ checkpoints: allCps, myValidations })}); true;`,
    );
  }, []);

  const injectPosition = useCallback((lat: number, lng: number) => {
    if (!mapReadyRef.current) return;
    webRef.current?.injectJavaScript(`window.updatePosition(${lat},${lng}); true;`);
  }, []);

  // ── Données carte ───────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!editionId) return;
    const data = await apiFetch<CarteData>(`/editions/${editionId}/carte`);
    carteDataRef.current = data;
    setCarteData(data);
    injectCheckpoints(data);
  }, [editionId, injectCheckpoints]);

  useEffect(() => {
    fetchData().catch(console.error).finally(() => setLoading(false));
  }, [fetchData]);

  // ── GPS watch (position affichée sur la carte) ─────────────────────────────

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('GPS requis', 'La position GPS est nécessaire pour valider les checkpoints.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });

      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (l) => setUserLocation({ latitude: l.coords.latitude, longitude: l.coords.longitude }),
      );
      locationSubRef.current = sub;
    })();
    return () => { locationSubRef.current?.remove(); };
  }, []);

  useEffect(() => {
    if (userLocation) injectPosition(userLocation.latitude, userLocation.longitude);
  }, [userLocation, injectPosition]);

  // ── Sockets ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchData().catch(console.error);
    const onExpired = (data: { checkpointId: string }) => {
      webRef.current?.injectJavaScript(
        `window.removeMarker(${JSON.stringify(data.checkpointId)}); true;`,
      );
      if (carteDataRef.current) {
        const updated = {
          ...carteDataRef.current,
          checkpoints: carteDataRef.current.checkpoints.filter((cp) => cp.id !== data.checkpointId),
        };
        carteDataRef.current = updated;
        setCarteData(updated);
      }
    };
    socket.on('validation:approved', refresh);
    socket.on('checkpoint:revealed', refresh);
    socket.on('checkpoint:taken', refresh);
    socket.on('checkpoint:expired', onExpired);
    return () => {
      socket.off('validation:approved', refresh);
      socket.off('checkpoint:revealed', refresh);
      socket.off('checkpoint:taken', refresh);
      socket.off('checkpoint:expired', onExpired);
    };
  }, [socket, fetchData]);

  // ── Callbacks carte ─────────────────────────────────────────────────────────

  const handleMapReady = useCallback(() => {
    mapReadyRef.current = true;
    if (carteDataRef.current) injectCheckpoints(carteDataRef.current);
    if (userLocation) injectPosition(userLocation.latitude, userLocation.longitude);
  }, [userLocation, injectCheckpoints, injectPosition]);

  const handleWebMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'CP_TAP') {
        setSelectedCp(msg.checkpoint as Checkpoint);
        setValidationPos(null);
        setValidationStep('form');
        setValidationResult(null);
        setPhotoUri(null);
      }
    } catch { /* ignore */ }
  }, []);

  const centerOnUser = useCallback(() => {
    webRef.current?.injectJavaScript('window.centerOnUser(); true;');
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert('Déconnexion', 'Quitter la session ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnexion', style: 'destructive', onPress: async () => {
        await signOut(); router.replace('/');
      }},
    ]);
  }, [signOut, router]);

  // ── Bouton "Valider un checkpoint" ─────────────────────────────────────────

  const handleValidateButton = useCallback(async () => {
    setLocatingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('GPS requis', 'Activez la localisation pour valider un checkpoint.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;

      const data = carteDataRef.current;
      if (!data) { Alert.alert('Carte non chargée', 'Attendez le chargement de la carte.'); return; }

      // Checkpoints validables : NORMAL ou EPHEMERE_QG, actif, non encore validé
      const validatedIds = new Set(
        data.validations.filter((v) => v.equipe_id === equipeIdRef.current).map((v) => v.checkpoint_id),
      );
      const candidates = data.checkpoints.filter(
        (cp) =>
          cp.actif !== false &&
          cp.type !== 'DEPART' &&
          cp.type !== 'ARRIVEE' &&
          !validatedIds.has(cp.id),
      );

      if (candidates.length === 0) {
        Alert.alert('Aucun checkpoint', 'Tous les checkpoints disponibles ont déjà été validés.');
        return;
      }

      // Trouver le plus proche et calculer toutes les distances
      let closest = candidates[0];
      let closestDist = haversineMetres(latitude, longitude, closest.latitude, closest.longitude);

      for (const cp of candidates.slice(1)) {
        const d = haversineMetres(latitude, longitude, cp.latitude, cp.longitude);
        if (d < closestDist) { closest = cp; closestDist = d; }
      }

      // Chercher tous les checkpoints dans leur rayon
      const inRange = candidates.filter(
        (cp) => haversineMetres(latitude, longitude, cp.latitude, cp.longitude) <= cp.rayon_validation_metres,
      );

      if (inRange.length === 0) {
        const distStr = closestDist >= 1000
          ? `${(closestDist / 1000).toFixed(1)} km`
          : `${Math.round(closestDist)} m`;
        Alert.alert(
          'Aucun checkpoint à portée',
          `Le checkpoint le plus proche est "${closest.nom}" à ${distStr}.`,
        );
        return;
      }

      // Prendre le plus proche parmi ceux dans le rayon
      let best = inRange[0];
      let bestDist = haversineMetres(latitude, longitude, best.latitude, best.longitude);
      for (const cp of inRange.slice(1)) {
        const d = haversineMetres(latitude, longitude, cp.latitude, cp.longitude);
        if (d < bestDist) { best = cp; bestDist = d; }
      }

      // Ouvrir le bottom sheet avec la position déjà connue
      setSelectedCp(best);
      setValidationPos({ lat: latitude, lng: longitude });
      setValidationStep('form');
      setValidationResult(null);
      setPhotoUri(null);
    } catch (err) {
      Alert.alert('Erreur GPS', err instanceof Error ? err.message : 'Impossible d\'obtenir la position.');
    } finally {
      setLocatingGps(false);
    }
  }, []);

  // ── Bottom sheet : photo ────────────────────────────────────────────────────

  const handleTakePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Caméra requise', 'Autorisez l\'accès à la caméra pour prendre une photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }, []);

  // ── Bottom sheet : confirmation ─────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (!selectedCp) return;
    setValidationStep('submitting');
    try {
      let pos = validationPos;
      // Si ouvert depuis tap sur la carte, obtenir la position maintenant
      if (!pos) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('Position GPS non disponible');
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        pos = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      }

      const result = await apiFetch<ValidationResult>('/validations', {
        method: 'POST',
        body: JSON.stringify({
          checkpointId: selectedCp.id,
          latitude: pos.lat,
          longitude: pos.lng,
          photo_url: photoUri,
        }),
      });
      setValidationResult(result);
      setValidationStep('result');
    } catch (err) {
      setValidationStep('form');
      Alert.alert('Validation échouée', err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }, [selectedCp, validationPos, photoUri]);

  const resetValidation = useCallback(() => {
    setSelectedCp(null);
    setValidationPos(null);
    setValidationStep('form');
    setValidationResult(null);
    setPhotoUri(null);
  }, []);

  // ── Rendu ───────────────────────────────────────────────────────────────────

  const canConfirm = photoUri !== null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Carte</Text>
          {carteData && (
            <Text style={styles.headerSub}>
              {carteData.checkpoints.filter((c) => c.actif).length} checkpoints •{' '}
              {myValidationIds.length} validés
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} hitSlop={8}>
          <Ionicons name="log-out-outline" size={22} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#3b82f6" size="large" />
          <Text style={styles.loadingText}>Chargement de la carte…</Text>
        </View>
      ) : (
        <View style={styles.mapContainer}>
          <WebView
            ref={webRef}
            source={{ html: MAP_HTML }}
            style={styles.map}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            onLoadEnd={handleMapReady}
            onMessage={handleWebMessage}
            onError={(e) => console.error('[Carte] WebView error', e.nativeEvent)}
            scrollEnabled={false}
          />

          {/* Bouton recentrer */}
          <TouchableOpacity style={styles.locateBtn} onPress={centerOnUser}>
            <Ionicons name="locate" size={22} color="white" />
          </TouchableOpacity>

          {/* Légende */}
          <View style={styles.legend}>
            {[
              { label: 'Départ', color: '#22c55e' },
              { label: 'Arrivée', color: '#ef4444' },
              { label: 'QG Eph.', color: '#f97316' },
              { label: 'Normal', color: '#3b82f6' },
            ].map(({ label, color }) => (
              <View key={label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendText}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Bouton fixe "Valider un checkpoint" — masqué si sheet ouverte */}
          {!selectedCp && (
            <TouchableOpacity
              style={[styles.validateFab, locatingGps && styles.validateFabLoading]}
              onPress={handleValidateButton}
              disabled={locatingGps}
              activeOpacity={0.85}
            >
              {locatingGps ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <>
                  <Ionicons name="location" size={18} color="white" />
                  <Text style={styles.validateFabText}>Valider un checkpoint</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Bottom sheet checkpoint */}
          {selectedCp && (
            <View style={styles.bottomSheet}>
              <View style={styles.bottomSheetHandle} />

              {validationStep === 'result' && validationResult ? (
                // ── Écran résultat ──────────────────────────────────────────
                <View style={styles.resultContainer}>
                  {validationResult.statut === 'APPROUVE' ? (
                    <>
                      <View style={styles.resultIconOk}>
                        <Ionicons name="checkmark" size={28} color="#22c55e" />
                      </View>
                      <Text style={styles.resultTitle}>Checkpoint validé !</Text>
                      <Text style={styles.resultPoints}>+{validationResult.points_accordes} pts</Text>
                    </>
                  ) : (
                    <>
                      <View style={styles.resultIconPending}>
                        <Ionicons name="time-outline" size={28} color="#f59e0b" />
                      </View>
                      <Text style={styles.resultTitle}>Validation en attente</Text>
                      <Text style={styles.resultSub}>Le QG va vérifier votre passage.</Text>
                    </>
                  )}
                  <TouchableOpacity style={styles.closeResultBtn} onPress={resetValidation} activeOpacity={0.8}>
                    <Text style={styles.closeResultBtnText}>Fermer</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                // ── Formulaire de validation ────────────────────────────────
                <View style={styles.sheetForm}>
                  {/* En-tête */}
                  <View style={styles.sheetHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cpName}>{selectedCp.nom}</Text>
                      <View style={styles.cpMeta}>
                        {selectedCp.points !== undefined && (
                          <Text style={styles.cpPoints}>{selectedCp.points} pts</Text>
                        )}
                        <Text style={styles.cpRayon}>± {selectedCp.rayon_validation_metres} m</Text>
                      </View>
                    </View>
                    <TouchableOpacity style={styles.closeBtn} onPress={resetValidation}>
                      <Ionicons name="close" size={20} color="#6b7280" />
                    </TouchableOpacity>
                  </View>

                  {/* Photo obligatoire pour tous les checkpoints */}
                  <TouchableOpacity style={styles.photoBtn} onPress={handleTakePhoto} activeOpacity={0.8}>
                    <Ionicons name="camera" size={18} color={photoUri ? '#22c55e' : 'white'} />
                    <Text style={[styles.photoBtnText, photoUri && { color: '#22c55e' }]}>
                      {photoUri ? 'Photo prise ✓' : 'Prendre une photo'}
                    </Text>
                  </TouchableOpacity>

                  {/* Aperçu photo */}
                  {photoUri && (
                    <Image
                      source={{ uri: photoUri }}
                      style={styles.photoPreview}
                      resizeMode="cover"
                    />
                  )}

                  {/* Bouton confirmer */}
                  <TouchableOpacity
                    style={[
                      styles.confirmBtn,
                      (!canConfirm || validationStep === 'submitting') && styles.confirmBtnDisabled,
                    ]}
                    onPress={handleConfirm}
                    disabled={!canConfirm || validationStep === 'submitting'}
                    activeOpacity={0.85}
                  >
                    {validationStep === 'submitting' ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color="white" />
                        <Text style={styles.confirmBtnText}>Confirmer la validation</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030712' },
  header: {
    paddingHorizontal: 16, paddingVertical: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  logoutBtn: { padding: 4 },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  headerSub: { color: '#6b7280', fontSize: 13, marginTop: 2 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#6b7280', fontSize: 14, marginTop: 12 },
  mapContainer: { flex: 1 },
  map: { flex: 1 },

  locateBtn: {
    position: 'absolute', right: 12, bottom: 120,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#1d4ed8',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },

  legend: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderRadius: 10, padding: 8,
    borderWidth: 1, borderColor: '#1e293b',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { color: '#9ca3af', fontSize: 11 },

  // Bouton FAB "Valider un checkpoint"
  validateFab: {
    position: 'absolute', bottom: 24, left: 20, right: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1d4ed8',
    borderRadius: 14, paddingVertical: 15,
    shadowColor: '#1d4ed8', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 6,
  },
  validateFabLoading: { opacity: 0.7 },
  validateFabText: { color: 'white', fontWeight: '700', fontSize: 16 },

  // Bottom sheet
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, borderColor: '#1e293b',
    paddingBottom: 32,
  },
  bottomSheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#334155', alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  sheetForm: { paddingHorizontal: 16, paddingTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  cpName: { color: 'white', fontSize: 18, fontWeight: '700' },
  cpMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 10 },
  cpPoints: { color: '#fbbf24', fontWeight: '700', fontSize: 15 },
  cpRayon: { color: '#6b7280', fontSize: 13 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center', marginLeft: 8,
  },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1e293b', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
  },
  photoBtnText: { color: 'white', fontWeight: '600', fontSize: 15 },
  photoPreview: {
    width: '100%', height: 160, borderRadius: 12, marginBottom: 12,
  },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#16a34a', borderRadius: 12,
    paddingVertical: 15,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: 'white', fontWeight: '700', fontSize: 16 },

  // Écran résultat
  resultContainer: {
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
    alignItems: 'center',
  },
  resultIconOk: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(34,197,94,0.15)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  resultIconPending: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(245,158,11,0.15)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  resultTitle: { color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  resultPoints: { color: '#22c55e', fontSize: 32, fontWeight: '900', marginBottom: 4 },
  resultSub: { color: '#9ca3af', fontSize: 14, textAlign: 'center', marginBottom: 4 },
  closeResultBtn: {
    marginTop: 16,
    backgroundColor: '#1e293b', borderRadius: 12,
    paddingHorizontal: 32, paddingVertical: 12,
  },
  closeResultBtnText: { color: 'white', fontWeight: '600', fontSize: 15 },
});
