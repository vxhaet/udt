import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';

interface ArchivedEdition {
  id: string;
  nom: string;
  description?: string | null;
  date_course: string;
  duree_minutes: number;
  _count: { equipes: number };
}

export default function ArchivesScreen() {
  const router = useRouter();
  const [editions, setEditions] = useState<ArchivedEdition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await apiFetch<ArchivedEdition[]>('/editions/archived');
    setEditions(data);
  }, []);

  useEffect(() => {
    load().catch(console.error).finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load().catch(console.error);
    setRefreshing(false);
  }

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
      <View style={styles.header}>
        <Ionicons name="archive-outline" size={20} color="#fbbf24" />
        <Text style={styles.title}>Archives</Text>
      </View>

      {editions.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="archive-outline" size={40} color="#1f2937" />
          <Text style={styles.emptyText}>Aucune édition archivée</Text>
        </View>
      ) : (
        <FlatList
          data={editions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => router.push(`/(app)/archive/${item.id}`)}
            >
              <View style={styles.cardContent}>
                <View style={styles.cardLeft}>
                  <Text style={styles.cardTitle}>{item.nom}</Text>
                  {item.description ? (
                    <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
                  ) : null}
                  <View style={styles.cardMeta}>
                    <Ionicons name="calendar-outline" size={12} color="#64748b" />
                    <Text style={styles.metaText}>
                      {new Date(item.date_course).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })}
                    </Text>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={styles.metaText}>{item.duree_minutes / 60}h</Text>
                    <Text style={styles.metaDot}>·</Text>
                    <Ionicons name="people-outline" size={12} color="#64748b" />
                    <Text style={styles.metaText}>{item._count.equipes} équipes</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#374151" />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030712' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  title: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  list: { paddingVertical: 8, paddingHorizontal: 12 },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginVertical: 4,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  cardLeft: { flex: 1 },
  cardTitle: { color: 'white', fontSize: 15, fontWeight: '600' },
  cardDesc: { color: '#64748b', fontSize: 12, marginTop: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  metaText: { color: '#64748b', fontSize: 11 },
  metaDot: { color: '#374151', fontSize: 11 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: '#374151', fontSize: 14 },
});
