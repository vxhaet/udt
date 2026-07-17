import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';
const ADMIN_URL = process.env.EXPO_PUBLIC_ADMIN_URL ?? 'http://localhost:3000';

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_COLORS = ['#fbbf24', '#d1d5db', '#b45309'];
const MEDAL_BG = [
  'rgba(251,191,36,0.12)',
  'rgba(209,213,219,0.08)',
  'rgba(180,83,9,0.12)',
];

interface ArchiveClassementEntry {
  rang: number;
  equipeId: string;
  nom: string;
  scoreTotal: number;
  distanceVolOiseauKm: number;
  nbCheckpoints: number;
  heureArrivee?: string | null;
  statut: string;
}

interface ArchiveSegmentPerf {
  classement: number;
  temps_secondes: number;
  points_gagnes: number;
  participant_nom: string;
  equipe_nom: string;
}

interface ArchiveSegment {
  id: string;
  nom: string;
  strava_segment_id: string;
  points_premier: number;
  points_second: number;
  points_troisieme: number;
  performances: ArchiveSegmentPerf[];
}

interface ArchiveData {
  edition: { id: string; nom: string; description?: string | null; date_course: string; duree_minutes: number };
  classement: ArchiveClassementEntry[];
  checkpoints: { id: string; nom: string; points: number; validations: { equipe_nom: string; photo_url?: string | null }[] }[];
  segments: ArchiveSegment[];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ArchiveDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ArchiveData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiFetch<ArchiveData>(`/editions/${id}/archive-data`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color="#3b82f6" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Données introuvables</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { edition, classement, segments } = data;
  const top3 = classement.filter((e) => e.rang <= 3);
  const rest = classement.filter((e) => e.rang > 3);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#94a3b8" />
          <Text style={styles.backText}>Archives</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openURL(`${ADMIN_URL}/archive/${id}`)}
          style={styles.webBtn}
        >
          <Ionicons name="open-outline" size={16} color="#64748b" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Edition info */}
        <View style={styles.editionHeader}>
          <View style={styles.archiveBadge}>
            <Ionicons name="archive-outline" size={12} color="#fbbf24" />
            <Text style={styles.archiveBadgeText}>Résultats finaux</Text>
          </View>
          <Text style={styles.editionTitle}>{edition.nom}</Text>
          {edition.description ? (
            <Text style={styles.editionDesc}>{edition.description}</Text>
          ) : null}
          <View style={styles.editionMeta}>
            <Text style={styles.metaText}>
              {new Date(edition.date_course).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>{edition.duree_minutes / 60}h</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>{classement.length} équipes</Text>
          </View>
        </View>

        {/* Podium */}
        {top3.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏆 Podium</Text>
            <View style={styles.podium}>
              {[top3[1], top3[0], top3[2]].filter(Boolean).map((entry) => {
                const idx = entry.rang - 1;
                return (
                  <View
                    key={entry.equipeId}
                    style={[
                      styles.podiumCard,
                      { backgroundColor: MEDAL_BG[idx] },
                      entry.rang === 1 && styles.podiumCardFirst,
                    ]}
                  >
                    <Text style={styles.podiumMedal}>{MEDALS[idx]}</Text>
                    <Text style={[styles.podiumRank, { color: MEDAL_COLORS[idx] }]}>{entry.rang}</Text>
                    <Text style={styles.podiumName} numberOfLines={2}>{entry.nom}</Text>
                    <Text style={[styles.podiumScore, { color: MEDAL_COLORS[idx] }]}>
                      {entry.scoreTotal} pts
                    </Text>
                    <Text style={styles.podiumMeta}>
                      {entry.nbCheckpoints} CP · {entry.distanceVolOiseauKm.toFixed(1)} km
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Reste du classement */}
        {rest.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Classement complet</Text>
            <View style={styles.card}>
              {[...top3, ...rest].map((entry, idx) => (
                <View
                  key={entry.equipeId}
                  style={[styles.row, idx < classement.length - 1 && styles.rowBorder]}
                >
                  <Text style={styles.rowRank}>
                    {entry.rang <= 3 ? MEDALS[entry.rang - 1] : entry.rang}
                  </Text>
                  <View style={styles.rowTeam}>
                    <Text style={styles.rowName}>{entry.nom}</Text>
                    <Text style={styles.rowMeta}>
                      {entry.nbCheckpoints} CP · {entry.distanceVolOiseauKm.toFixed(1)} km
                    </Text>
                  </View>
                  <Text style={styles.rowScore}>{entry.scoreTotal} pts</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Strava */}
        {segments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🚴 Segments Strava</Text>
            {segments.map((seg) => (
              <View key={seg.id} style={[styles.card, { marginBottom: 12 }]}>
                <Text style={styles.segTitle}>{seg.nom}</Text>
                <Text style={styles.segPoints}>
                  🥇 {seg.points_premier} · 🥈 {seg.points_second} · 🥉 {seg.points_troisieme} pts
                </Text>
                {seg.performances.length === 0 ? (
                  <Text style={styles.emptyText}>Aucune performance</Text>
                ) : (
                  seg.performances.map((p, i) => (
                    <View key={i} style={[styles.perfRow, i < seg.performances.length - 1 && styles.perfBorder]}>
                      <Text style={styles.perfMedal}>
                        {i < 3 ? MEDALS[i] : <Text style={styles.perfRank}>{p.classement}</Text>}
                      </Text>
                      <View style={styles.perfInfo}>
                        <Text style={styles.perfName}>{p.participant_nom}</Text>
                        <Text style={styles.perfEquipe}>{p.equipe_nom}</Text>
                      </View>
                      <View style={styles.perfRight}>
                        <Text style={styles.perfTime}>{formatTime(p.temps_secondes)}</Text>
                        <Text style={styles.perfPoints}>+{p.points_gagnes} pts</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            ))}
          </View>
        )}

        {/* Voir en ligne */}
        <TouchableOpacity
          style={styles.webLink}
          onPress={() => Linking.openURL(`${ADMIN_URL}/archive/${id}`)}
        >
          <Ionicons name="globe-outline" size={16} color="#3b82f6" />
          <Text style={styles.webLinkText}>Voir la page d'archive complète (avec photos)</Text>
          <Ionicons name="open-outline" size={14} color="#3b82f6" />
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030712' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#ef4444', fontSize: 14 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { color: '#94a3b8', fontSize: 14 },
  webBtn: { padding: 4 },

  content: { paddingHorizontal: 16, paddingTop: 16 },

  editionHeader: { marginBottom: 24 },
  archiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  archiveBadgeText: { color: '#fbbf24', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  editionTitle: { color: 'white', fontSize: 26, fontWeight: '900', lineHeight: 32 },
  editionDesc: { color: '#64748b', fontSize: 13, marginTop: 4 },
  editionMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  metaText: { color: '#475569', fontSize: 12 },
  metaDot: { color: '#1e293b', fontSize: 12 },

  section: { marginBottom: 24 },
  sectionTitle: { color: 'white', fontSize: 16, fontWeight: '700', marginBottom: 12 },

  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  podiumCard: {
    flex: 1,
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    minHeight: 120,
    justifyContent: 'flex-end',
  },
  podiumCardFirst: { minHeight: 148 },
  podiumMedal: { fontSize: 22, marginBottom: 2 },
  podiumRank: { fontSize: 12, fontWeight: '800', marginBottom: 2 },
  podiumName: { color: '#e2e8f0', fontSize: 11, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  podiumScore: { fontSize: 16, fontWeight: '900', marginBottom: 2 },
  podiumMeta: { color: '#64748b', fontSize: 9, textAlign: 'center' },

  card: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  rowRank: { width: 32, fontSize: 14, color: '#64748b', fontWeight: '700', textAlign: 'center' },
  rowTeam: { flex: 1, paddingRight: 8 },
  rowName: { color: '#e2e8f0', fontSize: 14, fontWeight: '500' },
  rowMeta: { color: '#64748b', fontSize: 11, marginTop: 1 },
  rowScore: { color: '#fbbf24', fontSize: 16, fontWeight: '800' },

  segTitle: { color: 'white', fontWeight: '600', fontSize: 14, padding: 14, paddingBottom: 4 },
  segPoints: { color: '#64748b', fontSize: 11, paddingHorizontal: 14, paddingBottom: 10 },
  emptyText: { color: '#374151', fontSize: 12, paddingHorizontal: 14, paddingBottom: 12 },
  perfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  perfBorder: { borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  perfMedal: { width: 24, textAlign: 'center', fontSize: 14 },
  perfRank: { color: '#64748b', fontSize: 12 },
  perfInfo: { flex: 1, paddingLeft: 8 },
  perfName: { color: 'white', fontSize: 13, fontWeight: '500' },
  perfEquipe: { color: '#64748b', fontSize: 11 },
  perfRight: { alignItems: 'flex-end', gap: 1 },
  perfTime: { color: '#94a3b8', fontSize: 11 },
  perfPoints: { color: '#fbbf24', fontSize: 13, fontWeight: '700' },

  webLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
    padding: 14,
    marginTop: 4,
  },
  webLinkText: { flex: 1, color: '#3b82f6', fontSize: 13, fontWeight: '500' },
});
