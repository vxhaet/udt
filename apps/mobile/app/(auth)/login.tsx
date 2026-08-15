import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    if (!code.trim() || !email.trim()) {
      Alert.alert('Champs manquants', 'Le code et l\'email sont requis.');
      return;
    }
    if (code.trim().length !== 8) {
      Alert.alert('Code invalide', 'Le code equipe doit faire 8 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const result = await apiFetch<{ token: string }>('/equipes/join', {
        method: 'POST',
        body: JSON.stringify({
          code_acces: code.trim().toUpperCase(),
          email: email.trim().toLowerCase(),
        }),
      });
      await signIn(result.token);
      router.replace('/(app)/carte');
    } catch (err) {
      Alert.alert('Erreur de connexion', err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Text style={styles.logoLetter}>U</Text>
          </View>
          <Text style={styles.appName}>Ultra DeTour</Text>
          <Text style={styles.tagline}>Connexion equipe</Text>
        </View>

        {/* Formulaire */}
        <View style={styles.card}>
          <Field label="Code equipe (8 caracteres)">
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="ABCD1234"
              placeholderTextColor="#374151"
              maxLength={8}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="next"
            />
          </Field>

          <Field label="Votre email">
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="jean@email.com"
              placeholderTextColor="#374151"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleJoin}
            />
          </Field>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Se connecter</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Le code et votre email vous ont ete communiques par l'organisateur.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: '#9ca3af', fontSize: 11, marginBottom: 4, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030712' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 60 },
  header: { alignItems: 'center', marginBottom: 32 },
  logoBox: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: '#1d4ed8',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  logoLetter: { color: 'white', fontSize: 28, fontWeight: '900' },
  appName: { color: 'white', fontSize: 26, fontWeight: 'bold', letterSpacing: -0.5 },
  tagline: { color: '#6b7280', fontSize: 14, marginTop: 4 },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: 'white',
    fontSize: 16,
  },
  codeInput: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },
  hint: { color: '#374151', fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 18 },
});
