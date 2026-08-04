import {
  View, Text, Image, Modal, StyleSheet, FlatList, Dimensions,
  TouchableOpacity, ActivityIndicator, Pressable,
} from 'react-native';
import { useState, useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export interface PhotoItem {
  id: string;
  photoUrl: string;
  label: string;       // ex: "Carrière de Corbais"
  sublabel?: string;    // ex: "Les Intrépides"
}

interface Props {
  photos: PhotoItem[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}

export default function PhotoViewer({ photos, initialIndex, visible, onClose }: Props) {
  const flatRef = useRef<FlatList>(null);
  const [current, setCurrent] = useState(initialIndex);
  const [loadErrors, setLoadErrors] = useState<Set<string>>(new Set());

  const onViewRef = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setCurrent(viewableItems[0].index ?? 0);
  });

  const handleError = useCallback((id: string) => {
    setLoadErrors((prev) => new Set(prev).add(id));
  }, []);

  const renderItem = useCallback(({ item }: { item: PhotoItem }) => (
    <View style={s.slide}>
      {loadErrors.has(item.id) ? (
        <View style={s.errorBox}>
          <Ionicons name="image-outline" size={48} color="#334155" />
          <Text style={s.errorText}>Image indisponible</Text>
        </View>
      ) : (
        <Image
          source={{ uri: item.photoUrl }}
          style={s.image}
          resizeMode="contain"
          onError={() => handleError(item.id)}
        />
      )}
    </View>
  ), [loadErrors, handleError]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.root}>
        {/* Close button */}
        <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={26} color="white" />
        </TouchableOpacity>

        {/* Counter */}
        <View style={s.counter}>
          <Text style={s.counterText}>{current + 1} / {photos.length}</Text>
        </View>

        {/* Photos */}
        <FlatList
          ref={flatRef}
          data={photos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
          initialScrollIndex={initialIndex}
          onViewableItemsChanged={onViewRef.current}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        />

        {/* Legend */}
        {photos[current] && (
          <View style={s.legend}>
            <Text style={s.legendLabel}>{photos[current].label}</Text>
            {photos[current].sublabel ? (
              <Text style={s.legendSub}>{photos[current].sublabel}</Text>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  closeBtn: {
    position: 'absolute', top: 54, right: 16, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  counter: {
    position: 'absolute', top: 58, left: 0, right: 0, zIndex: 10,
    alignItems: 'center',
  },
  counterText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  slide: { width: SCREEN_W, justifyContent: 'center', alignItems: 'center' },
  image: { width: SCREEN_W - 24, height: SCREEN_H * 0.6, borderRadius: 8 },
  errorBox: { alignItems: 'center', gap: 8 },
  errorText: { color: '#475569', fontSize: 13 },
  legend: {
    position: 'absolute', bottom: 48, left: 0, right: 0,
    alignItems: 'center', paddingHorizontal: 20,
  },
  legendLabel: { color: 'white', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  legendSub: { color: '#94a3b8', fontSize: 13, marginTop: 2, textAlign: 'center' },
});
