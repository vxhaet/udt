import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  Image, ScrollView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, uploadFile } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const TYPE_COLOR: Record<string, string> = {
  AUTO: '#22c55e',
  MANUELLE: '#f97316',
  MIXTE: '#3b82f6',
};

const TYPE_LABEL: Record<string, string> = {
  AUTO:    'Validation automatique',
  MANUELLE:'Validation par QG',
  MIXTE:   'Validation mixte',
};

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function CheckpointScreen() {
  const router = useRouter();
  const { equipeId } = useAuth();
  const params = useLocalSearchParams<{
    id: string; nom: string; points: string;
    type: string; rayon: string; lat: string; lng: string;
  }>();

  const cpLat = parseFloat(params.lat);
  const cpLng = parseFloat(params.lng);
  const rayon = parseInt(params.rayon ?? '50', 10);

  const [userPos, setUserPos] = useState<{ latitude: number; longitude: number } | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validated, setValidated] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'AUTO' | 'PENDING' | null>(null);
  const locationWatcher = useRef<Location.LocationSubscription | null>(null);

  // Distance en temps réel
  const distance = userPos ? Math.round(haversineMetres(userPos.latitude, userPos.longitude, cpLat, cpLng)) : null;
  const inRadius = distance !== null && distance <= rayon;

  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setUserPos({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });

      locationWatcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 5 },
        (l) => setUserPos({ latitude: l.coords.latitude, longitude: l.coords.longitude }),
      );
    })();

    return () => {
      locationWatcher.current?.remove();
    };
  }, []);

  async function pickPhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'La caméra est nécessaire pour prendre une photo.');
      return;
    }

    Alert.alert('Photo de validation', 'Choisir la source', [
      {
        text: 'Appareil photo',
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({
            quality: 0.7,
            allowsEditing: true,
            aspect: [4, 3],
          });
          if (!result.canceled) setPhotoUri(result.assets[0].uri);
        },
      },
      {
        text: 'Galerie',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            quality: 0.7,
            allowsEditing: true,
            aspect: [4, 3],
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
          });
          if (!result.canceled) setPhotoUri(result.assets[0].uri);
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  async function handleValidate() {
    if (!userPos) {
      Alert.alert('GPS indisponible', 'Activez le GPS et réessayez.');
      return;
    }
    if (!inRadius) {
      Alert.alert(
        'Trop loin',
        `Vous êtes à ${distance}m du checkpoint. Rapprochez-vous à moins de ${rayon}m.`,
      );
      return;
    }

    setLoading(true);
    try {
      let photo_url: string | undefined;
      if (photoUri) {
        photo_url = await uploadFile(photoUri);
      }

      const result = await apiFetch<{ statut: string }>('/validations', {
        method: 'POST',
        body: JSON.stringify({
          checkpointId: params.id,
          latitude: userPos.latitude,
          longitude: userPos.longitude,
          photo_url,
        }),
      });

      setValidated(true);
      setValidationStatus(result.statut === 'APPROUVE' ? 'AUTO' : 'PENDING');
    } catch (err) {
      Alert.alert('Validation échouée', err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  // Écran de succès
  if (validated) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.successScreen}>
          <View style={styles.successIcon}>
            <Ionicons
              name={validationStatus === 'AUTO' ? 'checkmark-circle' : 'time'}
              size={64}
              color={validationStatus === 'AUTO' ? '#22c55e' : '#f97316'}
            />
          </View>
          <Text style={styles.successTitle}>
            {validationStatus === 'AUTO' ? 'Checkpoint validé !' : 'En attente de validation'}
          </Text>
          <Text style={styles.successSub}>
            {validationStatus === 'AUTO'
              ? `+${params.points} points ajoutés à votre score`
              : 'Le QG va examiner votre validation et l\'approuver ou la rejeter.'}
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backBtnText}>Retour à la carte</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backIcon}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{params.nom}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Infos checkpoint */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={[styles.typeTag, { backgroundColor: `${TYPE_COLOR[params.type]}22` }]}>
              <Text style={[styles.typeTagText, { color: TYPE_COLOR[params.type] }]}>
                {params.type}
              </Text>
            </View>
            {params.points && (
              <View style={styles.pointsTag}>
                <Text style={styles.pointsText}>{params.points} pts</Text>
              </View>
            )}
          </View>
          <Text style={styles.typeLabel}>{TYPE_LABEL[params.type]}</Text>
        </View>

        {/* Distance GPS */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Distance</Text>
          {userPos === null ? (
            <View style={styles.row}>
              <ActivityIndicator size="small" color="#3b82f6" />
              <Text style={styles.distanceText}>Calcul en cours…</Text>
            </View>
          ) : (
            <View>
              <View style={styles.row}>
                <Ionicons
                  name={inRadius ? 'checkmark-circle' : 'location'}
                  size={24}
                  color={inRadius ? '#22c55e' : '#f97316'}
                />
                <Text style={[styles.distanceBig, { color: inRadius ? '#22c55e' : '#f97316' }]}>
                  {distance}m
                </Text>
                <Text style={styles.distanceSub}>/ {rayon}m requis</Text>
              </View>
              {!inRadius && (
                <Text style={styles.distanceHint}>
                  Rapprochez-vous de {distance! - rayon}m supplémentaires
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Photo */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Photo <Text style={styles.optional}>(optionnelle)</Text></Text>
            {photoUri && (
              <TouchableOpacity onPress={() => setPhotoUri(null)}>
                <Text style={styles.removePhoto}>Supprimer</Text>
              </TouchableOpacity>
            )}
          </View>

          {photoUri ? (
            <TouchableOpacity onPress={pickPhoto} activeOpacity={0.8}>
              <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.photoPlaceholder} onPress={pickPhoto} activeOpacity={0.8}>
              <Ionicons name="camera-outline" size={32} color="#334155" />
              <Text style={styles.photoPlaceholderText}>Prendre ou choisir une photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Bouton de validation */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.validateBtn,
            (!inRadius || loading) && styles.validateBtnDisabled,
          ]}
          onPress={handleValidate}
          disabled={!inRadius || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="white" />
              <Text style={styles.validateBtnText}>
                {inRadius ? 'Valider ce checkpoint' : `Encore ${distance !== null ? distance - rayon : '…'}m`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030712' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  backIcon: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, color: 'white', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 100 },
  card: { backgroundColor: '#0f172a', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#1e293b' },
  cardRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  typeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeTagText: { fontSize: 12, fontWeight: '700' },
  pointsTag: { backgroundColor: '#fbbf2415', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pointsText: { color: '#fbbf24', fontSize: 12, fontWeight: '700' },
  typeLabel: { color: '#64748b', fontSize: 13 },
  sectionLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  optional: { color: '#475569', fontWeight: '400', textTransform: 'none' },
  removePhoto: { color: '#ef4444', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  distanceBig: { fontSize: 28, fontWeight: '800' },
  distanceSub: { color: '#475569', fontSize: 13 },
  distanceHint: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  distanceText: { color: '#94a3b8', fontSize: 15 },
  photoPreview: { width: '100%', height: 200, borderRadius: 10 },
  photoPlaceholder: {
    height: 120, borderWidth: 2, borderColor: '#1e293b', borderStyle: 'dashed',
    borderRadius: 10, justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  photoPlaceholderText: { color: '#334155', fontSize: 13 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: Platform.OS === 'ios' ? 28 : 16, backgroundColor: '#030712', borderTopWidth: 1, borderTopColor: '#0f172a' },
  validateBtn: { backgroundColor: '#1d4ed8', borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  validateBtnDisabled: { backgroundColor: '#1e293b', opacity: 0.6 },
  validateBtnText: { color: 'white', fontWeight: '700', fontSize: 16 },
  successScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  successIcon: { marginBottom: 8 },
  successTitle: { color: 'white', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  successSub: { color: '#94a3b8', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  backBtn: { backgroundColor: '#1d4ed8', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginTop: 16 },
  backBtnText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
