import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, ScrollView, TouchableOpacity,
} from 'react-native';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, type ClassementEntry } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/hooks/useSocket';

// ── Constantes ────────────────────────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_COLORS = ['#fbbf24', '#d1d5db', '#b45309'];
const MEDAL_BG = ['rgba(251,191,36,0.12)', 'rgba(209,213,219,0.08)', 'rgba(180,83,9,0.12)'];

const STATUT_LABEL: Record<string, { label: string; color: string }> = {
  EN_COURSE:    { label: 'En course', color: '#3b82f6' },
  ARRIVEE:      { label: 'Arrivée',   color: '#22c55e' },
  CONFIRMEE:    { label: 'Confirmée', color: '#f59e0b' },
  DISQUALIFIEE: { label: 'DQ',        color: '#ef4444' },
};

// ── Podium ────────────────────────────────────────────────────────────────────

function Podium({ top3, myEquipeId }: { top3: ClassementEntry[]; myEquipeId: string | null }) {
  // Ordre d'affichage : 2ème à gauche, 1er au centre, 3ème à droite
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);

  return (
    <View style={podiumStyles.container}>
      {order.map((entry) => {
        const idx = entry.rang - 1;
        const isMe = entry.equipeId === myEquipeId;
        const isFirst = entry.rang === 1;
        return (
          <View key={entry.equipeId} style={[podiumStyles.card, { backgroundColor: MEDAL_BG[idx] }, isFirst && podiumStyles.cardFirst]}>
            <Text style={podiumStyles.medal}>{MEDALS[idx]}</Text>
            <Text style={[podiumStyles.rank, { color: MEDAL_COLORS[idx] }]}>{entry.rang}</Text>
            <Text style={[podiumStyles.name, isMe && podiumStyles.nameMe]} numberOfLines={2}>
              {entry.nom}
            </Text>
            <Text style={[podiumStyles.score, { color: MEDAL_COLORS[idx] }]}>{entry.scoreTotal} pts</Text>
            <Text style={podiumStyles.meta}>{entry.nbCheckpoints} CP · {entry.distanceVolOiseauKm.toFixed(1)} km</Text>
            {entry.format_course && (
              <Text style={podiumStyles.format} numberOfLines={1}>{entry.format_course.nom}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function ClassementScreen() {
  const { equipeId, editionId } = useAuth();
  const socket = useSocket();

  const [classement, setClassement] = useState<ClassementEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [gelActif, setGelActif] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);

  const fetchClassement = useCallback(async () => {
    if (!editionId) return;
    const [data, edition] = await Promise.all([
      apiFetch<ClassementEntry[]>(`/editions/${editionId}/classement`),
      apiFetch<{ gel_classement: string }>(`/editions/${editionId}`),
    ]);
    console.log('[Classement] données reçues:', JSON.stringify(data, null, 2));
    setClassement(data);
    setGelActif(new Date() >= new Date(edition.gel_classement));
  }, [editionId]);

  useEffect(() => {
    fetchClassement().catch(console.error).finally(() => setLoading(false));
  }, [fetchClassement]);

  // Mise à jour temps réel — rechargement silencieux à chaque validation approuvée
  useEffect(() => {
    if (!socket) return;
    const handler = () => fetchClassement().catch(console.error);
    socket.on('validation:approved', handler);
    return () => { socket.off('validation:approved', handler); };
  }, [socket, fetchClassement]);

  async function onRefresh() {
    setRefreshing(true);
    await fetchClassement().catch(console.error);
    setRefreshing(false);
  }

  // Formats disponibles (dédupliqués)
  const formats = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of classement) {
      if (e.format_course && !seen.has(e.format_course.id)) {
        seen.set(e.format_course.id, e.format_course.nom);
      }
    }
    return Array.from(seen.entries()).map(([id, nom]) => ({ id, nom }));
  }, [classement]);

  const filtered = useMemo(() => {
    if (!selectedFormat) return classement;
    return classement.filter((e) => e.format_course?.id === selectedFormat);
  }, [classement, selectedFormat]);

  // Renuméroter les rangs après filtrage
  const reranked = useMemo(() =>
    filtered.map((e, i) => ({ ...e, rang: i + 1 })),
  [filtered]);

  const top3 = reranked.filter((e) => e.rang <= 3);
  const rest = reranked.filter((e) => e.rang > 3);

  const renderItem = ({ item }: { item: ClassementEntry }) => {
    const isMe = item.equipeId === equipeId;
    const statut = STATUT_LABEL[item.statut] ?? { label: item.statut, color: '#6b7280' };

    return (
      <View style={[styles.row, isMe && styles.rowMe]}>
        {/* Rang */}
        <Text style={styles.rank}>{item.rang}</Text>

        {/* Équipe */}
        <View style={styles.teamCol}>
          <View style={styles.teamRow}>
            <Text style={[styles.teamName, isMe && styles.teamNameMe]} numberOfLines={1}>
              {item.nom}
            </Text>
            {isMe && <View style={styles.meBadge}><Text style={styles.meBadgeText}>Moi</Text></View>}
          </View>
          <View style={styles.teamMeta}>
            <Text style={styles.metaText}>{item.nbCheckpoints} CP</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>{item.distanceVolOiseauKm.toFixed(1)} km</Text>
            {item.heureArrivee && (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText}>
                  {new Date(item.heureArrivee).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </>
            )}
          </View>
          {item.dernier_checkpoint && (
            <Text style={styles.lastCp} numberOfLines={1}>
              Dernier : {item.dernier_checkpoint.nom}{' '}
              <Text style={styles.lastCpTime}>
                {new Date(item.dernier_checkpoint.validated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Text>
          )}
        </View>

        {/* Score + statut */}
        <View style={styles.scoreCol}>
          <Text style={styles.score}>{item.scoreTotal}</Text>
          <Text style={[styles.statusText, { color: statut.color }]}>{statut.label}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator color="#3b82f6" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Classement</Text>
          {!gelActif && (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Temps réel</Text>
            </View>
          )}
        </View>
        {gelActif && (
          <View style={styles.gelBadge}>
            <Ionicons name="lock-closed" size={12} color="#fbbf24" />
            <Text style={styles.gelText}>Gelé</Text>
          </View>
        )}
      </View>

      {/* Bandeau gel */}
      {gelActif && (
        <View style={styles.gelBanner}>
          <Ionicons name="lock-closed-outline" size={14} color="#fbbf24" />
          <Text style={styles.gelBannerText}>
            Classement gelé — résultats finaux bientôt !
          </Text>
        </View>
      )}

      {/* Filtre par format */}
      {formats.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <TouchableOpacity
            style={[styles.filterBtn, !selectedFormat && styles.filterBtnActive]}
            onPress={() => setSelectedFormat(null)}
          >
            <Text style={[styles.filterBtnText, !selectedFormat && styles.filterBtnTextActive]}>
              Tous
            </Text>
          </TouchableOpacity>
          {formats.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterBtn, selectedFormat === f.id && styles.filterBtnActive]}
              onPress={() => setSelectedFormat(f.id)}
            >
              <Text style={[styles.filterBtnText, selectedFormat === f.id && styles.filterBtnTextActive]}>
                {f.nom}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {reranked.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="trophy-outline" size={40} color="#1f2937" />
          <Text style={styles.emptyText}>Aucune équipe en course</Text>
        </View>
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => item.equipeId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
          }
          ListHeaderComponent={
            <>
              {/* Podium top 3 */}
              {top3.length > 0 && (
                <Podium top3={top3} myEquipeId={equipeId} />
              )}

              {/* Séparateur + en-tête tableau */}
              {rest.length > 0 && (
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderText, { width: 36 }]}>#</Text>
                  <Text style={[styles.tableHeaderText, { flex: 1 }]}>Équipe</Text>
                  <Text style={[styles.tableHeaderText, { width: 80, textAlign: 'right' }]}>Score</Text>
                </View>
              )}
            </>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles podium ─────────────────────────────────────────────────────────────

const podiumStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 8,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    minHeight: 130,
    justifyContent: 'flex-end',
  },
  cardFirst: {
    minHeight: 158,
    borderWidth: 1,
  },
  medal: { fontSize: 24, marginBottom: 4 },
  rank: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  name: { color: '#e2e8f0', fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 6 },
  nameMe: { color: 'white', fontWeight: '800' },
  score: { fontSize: 18, fontWeight: '900', marginBottom: 2 },
  meta: { color: '#64748b', fontSize: 10, textAlign: 'center' },
  format: { color: '#475569', fontSize: 9, textAlign: 'center', marginTop: 3 },
});

// ── Styles principaux ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030712' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  liveText: { color: '#22c55e', fontSize: 11 },
  gelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  gelText: { color: '#fbbf24', fontSize: 12, fontWeight: '600' },
  gelBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(251,191,36,0.2)',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  gelBannerText: { color: '#fbbf24', fontSize: 13, fontWeight: '500', flex: 1 },
  tableHeader: {
    flexDirection: 'row', paddingHorizontal: 16,
    paddingTop: 4, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  tableHeaderText: { color: '#475569', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  list: { paddingBottom: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#0f172a',
  },
  rowMe: { backgroundColor: 'rgba(29,78,216,0.08)' },
  rank: { width: 36, color: '#64748b', fontSize: 16, fontWeight: '700' },
  teamCol: { flex: 1, paddingRight: 8 },
  scoreCol: { width: 80, alignItems: 'flex-end' },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamName: { color: '#e2e8f0', fontSize: 15, fontWeight: '500', flexShrink: 1 },
  teamNameMe: { color: 'white', fontWeight: '700' },
  meBadge: { backgroundColor: '#1d4ed8', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  meBadgeText: { color: 'white', fontSize: 9, fontWeight: '700' },
  teamMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { color: '#64748b', fontSize: 12 },
  metaDot: { color: '#334155', fontSize: 12 },
  score: { color: '#fbbf24', fontSize: 18, fontWeight: '800' },
  statusText: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText: { color: '#374151', fontSize: 14 },
  filterScroll: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  filterBtn: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  filterBtnActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  filterBtnText: { color: '#64748b', fontSize: 12, fontWeight: '500' },
  filterBtnTextActive: { color: 'white' },
  lastCp: { color: '#475569', fontSize: 11, marginTop: 2 },
  lastCpTime: { color: '#334155' },
});
