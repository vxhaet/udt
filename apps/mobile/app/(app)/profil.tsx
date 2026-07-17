import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const STRAVA_CLIENT_ID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID ?? '';
const STRAVA_REDIRECT_URI = 'http://192.168.0.242:3001/strava/callback';

export default function ProfilScreen() {
  const { signOut, participantId } = useAuth();
  const [stravaConnected, setStravaConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    apiFetch<{ connected: boolean }>('/strava/status')
      .then(({ connected }) => setStravaConnected(connected))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleConnectStrava() {
    setConnecting(true);
    try {
      const authUrl =
        `https://www.strava.com/oauth/authorize` +
        `?client_id=${STRAVA_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(STRAVA_REDIRECT_URI)}` +
        `&response_type=code` +
        `&approval_prompt=auto` +
        `&scope=activity:read_all` +
        `&state=${participantId}`;

      console.log('[Strava] OAuth URL complète:', authUrl);

      // Ouvre le navigateur système — le callback est géré côté serveur via state=participantId
      await WebBrowser.openBrowserAsync(authUrl);

      // Le navigateur a été fermé (manuellement par l'utilisateur après la page de succès)
      // On re-vérifie le statut Strava pour mettre à jour l'UI
      const { connected } = await apiFetch<{ connected: boolean }>('/strava/status');
      setStravaConnected(connected);
    } catch (err: unknown) {
      Alert.alert('Erreur', (err as Error).message ?? 'Connexion échouée');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Profil</Text>
      </View>

      {/* Section Strava */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="bicycle-outline" size={18} color="#fc4c02" />
          <Text style={styles.sectionTitle}>Strava</Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#3b82f6" style={{ marginTop: 12 }} />
        ) : stravaConnected ? (
          <View style={styles.connectedCard}>
            <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
            <View style={styles.connectedText}>
              <Text style={styles.connectedTitle}>Compte connecté</Text>
              <Text style={styles.connectedSub}>
                Vos performances sur les segments chronométrés sont synchronisées automatiquement.
              </Text>
            </View>
          </View>
        ) : (
          <View>
            <Text style={styles.stravaDesc}>
              Connectez votre compte Strava pour participer aux classements sur les segments
              chronométrés de l'édition.
            </Text>
            <TouchableOpacity
              style={[styles.stravaBtn, connecting && styles.stravaBtnDisabled]}
              onPress={handleConnectStrava}
              disabled={connecting}
            >
              {connecting ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="link-outline" size={16} color="white" />
              )}
              <Text style={styles.stravaBtnText}>
                {connecting ? 'Connexion en cours…' : 'Connecter Strava'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Déconnexion */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Ionicons name="log-out-outline" size={18} color="#ef4444" />
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030712' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  title: { color: 'white', fontSize: 20, fontWeight: 'bold' },

  section: {
    marginTop: 20,
    marginHorizontal: 16,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { color: 'white', fontSize: 15, fontWeight: '600' },

  connectedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  connectedText: { flex: 1 },
  connectedTitle: { color: '#22c55e', fontWeight: '600', fontSize: 14 },
  connectedSub: { color: '#64748b', fontSize: 12, marginTop: 2, lineHeight: 17 },

  stravaDesc: { color: '#94a3b8', fontSize: 13, lineHeight: 19, marginBottom: 14 },
  stravaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fc4c02',
    borderRadius: 10,
    paddingVertical: 12,
  },
  stravaBtnDisabled: { opacity: 0.5 },
  stravaBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },

  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  signOutText: { color: '#ef4444', fontSize: 15, fontWeight: '500' },
});
