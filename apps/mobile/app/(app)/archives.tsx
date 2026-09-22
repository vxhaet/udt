import {
  View, Text, FlatList, Image, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import PhotoViewer, { type PhotoItem } from '@/components/PhotoViewer';

const SCREEN_W = Dimensions.get('window').width;
const COL = 2;
const GAP = 8;
const THUMB_W = (SCREEN_W - 24 - GAP) / COL;

interface AlbumEntry {
  id: string;
  photoUrl: string;
  checkpointNom: string;
  equipeNom: string;
  validatedAt: string;
}

export default function AlbumScreen() {
  const { editionId } = useAuth();
  const [photos, setPhotos] = useState<AlbumEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const load = useCallback(async () => {
    if (!editionId) return;
    const data = await apiFetch<AlbumEntry[]>(`/editions/${editionId}/album`);
    setPhotos(data);
  }, [editionId]);

  useEffect(() => {
    load().catch(console.error).finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load().catch(console.error);
    setRefreshing(false);
  }

  const viewerPhotos: PhotoItem[] = photos.map((p) => ({
    id: p.id,
    photoUrl: p.photoUrl,
    label: p.checkpointNom,
    sublabel: p.equipeNom,
  }));

  const openViewer = useCallback((index: number) => {
    setViewerIndex(index);
    setViewerVisible(true);
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.centered}>
          <ActivityIndicator color="#e8556d" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Ionicons name="images-outline" size={20} color="#e8556d" />
        <Text style={s.title}>Album</Text>
        <Text style={s.count}>{photos.length} photo{photos.length > 1 ? 's' : ''}</Text>
      </View>

      {photos.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="images-outline" size={40} color="#1f2937" />
          <Text style={s.emptyText}>Aucune photo pour le moment</Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          numColumns={COL}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.grid}
          columnWrapperStyle={s.gridRow}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e8556d" />}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={s.thumb}
              activeOpacity={0.8}
              onPress={() => openViewer(index)}
            >
              <Image source={{ uri: item.photoUrl }} style={s.thumbImg} resizeMode="cover" />
              <View style={s.thumbCaption}>
                <Text style={s.thumbCp} numberOfLines={1}>{item.checkpointNom}</Text>
                <Text style={s.thumbEq} numberOfLines={1}>{item.equipeNom}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <PhotoViewer
        photos={viewerPhotos}
        initialIndex={viewerIndex}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#030712' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#111827',
  },
  title: { color: 'white', fontSize: 20, fontWeight: 'bold', flex: 1 },
  count: { color: '#64748b', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: '#374151', fontSize: 14 },
  grid: { paddingHorizontal: 12, paddingVertical: 8 },
  gridRow: { gap: GAP, marginBottom: GAP },
  thumb: {
    width: THUMB_W, borderRadius: 10, overflow: 'hidden',
    backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b',
  },
  thumbImg: { width: '100%', height: THUMB_W, backgroundColor: '#1e293b' },
  thumbCaption: { paddingHorizontal: 8, paddingVertical: 6 },
  thumbCp: { color: '#e2e8f0', fontSize: 12, fontWeight: '500' },
  thumbEq: { color: '#64748b', fontSize: 11, marginTop: 1 },
});
