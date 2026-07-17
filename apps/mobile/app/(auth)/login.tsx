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
  const [form, setForm] = useState({ code_acces: '', prenom: '', nom: '', email: '' });
  const [loading, setLoading] = useState(false);

  function update(key: keyof typeof form) {
    return (value: string) => setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleJoin() {
    const { code_acces, prenom, nom, email } = form;
    if (!code_acces.trim() || !prenom.trim() || !nom.trim() || !email.trim()) {
      Alert.alert('Champs manquants', 'Tous les champs sont requis.');
      return;
    }
    if (code_acces.trim().length !== 8) {
      Alert.alert('Code invalide', 'Le code équipe doit faire 8 caractères.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        code_acces: code_acces.trim().toUpperCase(),
        nom: nom.trim(),
        prenom: prenom.trim(),
        email: email.trim().toLowerCase(),
      };
      console.log('[Login] POST /equipes/join payload:', JSON.stringify(payload));
      const result = await apiFetch<{ token: string; participant: { nom: string; prenom: string } }>(
        '/equipes/join',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
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
          <Text style={styles.appName}>Ultra DéTour</Text>
          <Text style={styles.tagline}>Rejoindre votre équipe</Text>
        </View>

        {/* Formulaire */}
        <View style={styles.card}>
          <Field label="Code équipe (8 caractères)">
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={form.code_acces}
              onChangeText={(t) => update('code_acces')(t.toUpperCase())}
              placeholder="ABCD1234"
              placeholderTextColor="#374151"
              maxLength={8}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="next"
            />
          </Field>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Field label="Prénom">
                <TextInput
                  style={styles.input}
                  value={form.prenom}
                  onChangeText={update('prenom')}
                  placeholder="Jean"
                  placeholderTextColor="#374151"
                  autoCapitalize="words"
                />
              </Field>
            </View>
            <View style={styles.halfField}>
              <Field label="Nom">
                <TextInput
                  style={styles.input}
                  value={form.nom}
                  onChangeText={update('nom')}
                  placeholder="Dupont"
                  placeholderTextColor="#374151"
                  autoCapitalize="words"
                />
              </Field>
            </View>
          </View>

          <Field label="Email">
            <TextInput
              style={styles.input}
              value={form.email}
              onChangeText={update('email')}
              placeholder="jean@email.com"
              placeholderTextColor="#374151"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
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
              <Text style={styles.buttonText}>Rejoindre l'équipe →</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Le code équipe vous a été communiqué par le capitaine ou l'organisateur.
        </Text>

        <TouchableOpacity onPress={() => router.push('/(auth)/inscription')} activeOpacity={0.7}>
          <Text style={styles.inscriptionLink}>Pas encore inscrit ? Créer une équipe →</Text>
        </TouchableOpacity>
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
  row: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },
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
  inscriptionLink: { color: '#3b82f6', fontSize: 14, textAlign: 'center', marginTop: 12, fontWeight: '500' },
});
