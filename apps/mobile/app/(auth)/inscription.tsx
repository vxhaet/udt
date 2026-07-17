import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import * as WebBrowser from 'expo-web-browser';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

interface EditionPublic {
  id: string;
  nom: string;
  date_course: string;
  duree_minutes: number;
  nb_equipes_max: number;
  prix_equipe: number;
  statut: string;
  _count?: { equipes: number };
}

interface FormatCourse {
  id: string;
  nom: string;
  duree_minutes: number;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export default function InscriptionScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [editions, setEditions] = useState<EditionPublic[]>([]);
  const [selectedEdition, setSelectedEdition] = useState<EditionPublic | null>(null);
  const [formats, setFormats] = useState<FormatCourse[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'form' | 'pending'>('select');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState('');
  const [form, setForm] = useState({
    nom_equipe: '',
    cap_prenom: '',
    cap_nom: '',
    cap_email: '',
    membre1: '',
    membre2: '',
    membre3: '',
  });

  useEffect(() => {
    fetch(`${API_URL}/editions`)
      .then((r) => r.json())
      .then((data: EditionPublic[]) => {
        const open = data.filter((e) => e.statut === 'INSCRIPTION');
        setEditions(open);
        if (open.length === 1) {
          selectEdition(open[0]);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function selectEdition(ed: EditionPublic) {
    setSelectedEdition(ed);
    // Charger les formats de cette édition
    fetch(`${API_URL}/editions/${ed.id}/formats`)
      .then((r) => r.json())
      .then((fmts: FormatCourse[]) => setFormats(Array.isArray(fmts) ? fmts : []))
      .catch(() => setFormats([]));
    setStep('form');
  }

  function update(key: keyof typeof form) {
    return (value: string) => setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    if (!selectedEdition) return;
    const { nom_equipe, cap_prenom, cap_nom, cap_email } = form;
    if (!nom_equipe.trim() || !cap_prenom.trim() || !cap_nom.trim() || !cap_email.trim()) {
      Alert.alert('Champs manquants', 'Nom équipe, prénom, nom et email capitaine sont requis.');
      return;
    }
    if (formats.length > 0 && !selectedFormat) {
      Alert.alert('Format manquant', 'Veuillez choisir un format de course.');
      return;
    }

    setSaving(true);
    try {
      const emails_membres = [form.membre1, form.membre2, form.membre3]
        .map((s) => s.trim())
        .filter(Boolean);

      const payload: Record<string, unknown> = {
        nom_equipe: nom_equipe.trim(),
        capitaine: {
          nom: cap_nom.trim(),
          prenom: cap_prenom.trim(),
          email: cap_email.trim().toLowerCase(),
        },
        emails_membres,
        platform: 'mobile',
      };
      if (selectedFormat) payload.format_course_id = selectedFormat;

      const result = await apiFetch<{
        code_acces?: string;
        checkoutUrl?: string;
        token: string;
        equipe: { id: string; nom: string };
      }>(`/inscriptions/${selectedEdition.id}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (result.code_acces) {
        await signIn(result.token);
        setCode(result.code_acces);
        setStep('pending');
      } else if (result.checkoutUrl) {
        await WebBrowser.openBrowserAsync(result.checkoutUrl);
        await signIn(result.token);
        setStep('pending');
      }
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }

  // Étape : confirmation
  if (step === 'pending') {
    return (
      <View style={styles.centered}>
        <View style={styles.successIcon}>
          <Text style={{ color: '#22c55e', fontSize: 32, fontWeight: 'bold' }}>✓</Text>
        </View>
        <Text style={styles.successTitle}>Inscription confirmée !</Text>
        {code ? (
          <>
            <Text style={styles.successSub}>Votre code d'accès équipe</Text>
            <Text style={styles.codeDisplay}>{code}</Text>
            <Text style={styles.successHint}>
              Partagez ce code avec vos coéquipiers pour qu'ils rejoignent l'équipe.
            </Text>
          </>
        ) : (
          <Text style={styles.successHint}>
            Votre code d'accès vous sera envoyé par email une fois le paiement confirmé.
          </Text>
        )}
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/(app)/carte')}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Accéder à la course →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Étape : sélection édition
  if (step === 'select') {
    return (
      <View style={[styles.root, { padding: 24, paddingTop: 60 }]}>
        <Text style={styles.title}>Choisir une édition</Text>
        {editions.length === 0 ? (
          <Text style={{ color: '#6b7280', textAlign: 'center', marginTop: 40 }}>
            Aucune inscription ouverte pour le moment.
          </Text>
        ) : (
          editions.map((ed) => (
            <TouchableOpacity
              key={ed.id}
              style={styles.editionCard}
              onPress={() => selectEdition(ed)}
              activeOpacity={0.7}
            >
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 16 }}>{ed.nom}</Text>
              <Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>
                {new Date(ed.date_course).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
                {' · '}
                {ed.prix_equipe === 0 ? 'Gratuit' : `${(ed.prix_equipe / 100).toFixed(2)} €`}
              </Text>
            </TouchableOpacity>
          ))
        )}
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: '#6b7280', textAlign: 'center', fontSize: 14 }}>← Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Étape : formulaire
  const prixLabel =
    selectedEdition!.prix_equipe === 0
      ? "S'inscrire gratuitement"
      : `S'inscrire — ${(selectedEdition!.prix_equipe / 100).toFixed(2)} €`;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Text style={styles.logoLetter}>U</Text>
          </View>
          <Text style={styles.appName}>Ultra DéTour</Text>
          <Text style={styles.tagline}>{selectedEdition!.nom}</Text>
        </View>

        <View style={styles.card}>
          {/* Format de course */}
          {formats.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.sectionLabel}>Format de course *</Text>
              <View style={styles.formatsGrid}>
                {formats.map((fmt) => {
                  const isSelected = selectedFormat === fmt.id;
                  return (
                    <TouchableOpacity
                      key={fmt.id}
                      onPress={() => setSelectedFormat(fmt.id)}
                      activeOpacity={0.7}
                      style={[styles.formatCard, isSelected && styles.formatCardSelected]}
                    >
                      <Text style={[styles.formatNom, isSelected && { color: 'white' }]}>
                        {fmt.nom}
                      </Text>
                      <Text style={[styles.formatDuree, isSelected && { color: '#93c5fd' }]}>
                        {fmt.duree_minutes / 60}h de course
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <Field label="Nom de l'équipe *">
            <TextInput
              style={styles.input}
              value={form.nom_equipe}
              onChangeText={update('nom_equipe')}
              placeholder="Les Aventuriers"
              placeholderTextColor="#374151"
              maxLength={50}
            />
          </Field>

          <Text style={styles.sectionLabel}>Capitaine</Text>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Field label="Prénom *">
                <TextInput
                  style={styles.input}
                  value={form.cap_prenom}
                  onChangeText={update('cap_prenom')}
                  placeholder="Marie"
                  placeholderTextColor="#374151"
                  autoCapitalize="words"
                />
              </Field>
            </View>
            <View style={styles.halfField}>
              <Field label="Nom *">
                <TextInput
                  style={styles.input}
                  value={form.cap_nom}
                  onChangeText={update('cap_nom')}
                  placeholder="Dupont"
                  placeholderTextColor="#374151"
                  autoCapitalize="words"
                />
              </Field>
            </View>
          </View>

          <Field label="Email *">
            <TextInput
              style={styles.input}
              value={form.cap_email}
              onChangeText={update('cap_email')}
              placeholder="marie@email.com"
              placeholderTextColor="#374151"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>

          <Text style={styles.sectionLabel}>Coéquipiers (optionnel)</Text>
          <Text style={styles.sectionHint}>Ils recevront un email avec le code équipe.</Text>

          <Field label="Email coéquipier 1">
            <TextInput style={styles.input} value={form.membre1} onChangeText={update('membre1')} placeholder="coequipier1@email.com" placeholderTextColor="#374151" keyboardType="email-address" autoCapitalize="none" />
          </Field>
          <Field label="Email coéquipier 2">
            <TextInput style={styles.input} value={form.membre2} onChangeText={update('membre2')} placeholder="coequipier2@email.com" placeholderTextColor="#374151" keyboardType="email-address" autoCapitalize="none" />
          </Field>
          <Field label="Email coéquipier 3">
            <TextInput style={styles.input} value={form.membre3} onChangeText={update('membre3')} placeholder="coequipier3@email.com" placeholderTextColor="#374151" keyboardType="email-address" autoCapitalize="none" />
          </Field>

          <TouchableOpacity
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>{prixLabel}</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.hint}>← Retour à la connexion</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030712' },
  centered: { flex: 1, backgroundColor: '#030712', justifyContent: 'center', alignItems: 'center', padding: 32 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 60 },
  header: { alignItems: 'center', marginBottom: 32 },
  logoBox: { width: 64, height: 64, borderRadius: 16, backgroundColor: '#1d4ed8', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  logoLetter: { color: 'white', fontSize: 28, fontWeight: '900' },
  appName: { color: 'white', fontSize: 26, fontWeight: 'bold', letterSpacing: -0.5 },
  tagline: { color: '#6b7280', fontSize: 14, marginTop: 4 },
  card: { backgroundColor: '#0f172a', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#1e293b' },
  row: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },
  input: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: 'white', fontSize: 16 },
  button: { backgroundColor: '#1d4ed8', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 6 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },
  hint: { color: '#374151', fontSize: 13, textAlign: 'center', marginTop: 20 },
  fieldLabel: { color: '#9ca3af', fontSize: 11, marginBottom: 4, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionLabel: { color: '#e2e8f0', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
  sectionHint: { color: '#6b7280', fontSize: 12, marginBottom: 10, marginTop: -4 },
  editionCard: { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 10 },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#16a34a20', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  successTitle: { color: 'white', fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  successSub: { color: '#9ca3af', fontSize: 14, marginBottom: 4 },
  codeDisplay: { color: 'white', fontSize: 36, fontWeight: '900', letterSpacing: 10, marginVertical: 12 },
  successHint: { color: '#6b7280', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  title: { color: 'white', fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  formatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formatCard: { flex: 1, minWidth: 120, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  formatCardSelected: { borderColor: '#3b82f6', backgroundColor: '#1e3a5f' },
  formatNom: { color: '#cbd5e1', fontWeight: '700', fontSize: 15 },
  formatDuree: { color: '#64748b', fontSize: 12, marginTop: 2 },
});
