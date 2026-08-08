import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { registerForPushNotifications } from '@/lib/notifications';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { getSocket } from '@/lib/socket';

const SCREEN_WIDTH = Dimensions.get('window').width;

const TICKER_COLORS: Record<string, string> = {
  ALERTE: '#f97316',
  INFO: '#3b82f6',
  METEO: '#06b6d4',
};

function MessageTicker() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<{ contenu: string; type: string; expires_at?: string } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const translateX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messageRef = useRef(message);
  messageRef.current = message;

  const clearTicker = useCallback(() => {
    if (animRef.current) animRef.current.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setMessage(null);
    setRemaining(null);
  }, []);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;

    const handler = (msg: { contenu: string; type: string; expires_at?: string }) => {
      if (animRef.current) animRef.current.stop();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setMessage(msg);
      translateX.setValue(SCREEN_WIDTH);
      animRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(translateX, {
            toValue: -SCREEN_WIDTH * 2,
            duration: 18000,
            useNativeDriver: true,
          }),
          Animated.timing(translateX, {
            toValue: SCREEN_WIDTH,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
      animRef.current.start();

      // Start countdown if expires_at is provided
      if (msg.expires_at) {
        const expiresMs = new Date(msg.expires_at).getTime();
        const update = () => {
          const left = Math.max(0, Math.round((expiresMs - Date.now()) / 1000));
          setRemaining(left);
          if (left <= 0) {
            clearTicker();
          }
        };
        update();
        timerRef.current = setInterval(update, 1000);
      } else {
        setRemaining(null);
      }
    };

    const onExpired = () => {
      if (messageRef.current?.type === 'ALERTE') {
        clearTicker();
      }
    };

    socket.on('message:qg', handler);
    socket.on('checkpoint:expired', onExpired);
    return () => {
      socket.off('message:qg', handler);
      socket.off('checkpoint:expired', onExpired);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [token, translateX, clearTicker]);

  if (!message) return null;

  const bgColor = TICKER_COLORS[message.type] ?? '#3b82f6';
  const mins = remaining !== null ? Math.floor(remaining / 60) : null;
  const secs = remaining !== null ? remaining % 60 : null;

  return (
    <View style={[styles.tickerBar, { backgroundColor: bgColor, top: insets.top }]}>
      <Animated.Text
        style={[styles.tickerText, { transform: [{ translateX }] }]}
        numberOfLines={1}
      >
        {message.contenu}
      </Animated.Text>
      {remaining !== null && remaining > 0 && (
        <View style={styles.countdownBadge}>
          <Text style={styles.countdownText}>
            {mins}:{String(secs).padStart(2, '0')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tickerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    height: 36,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  tickerText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
  },
  countdownBadge: {
    position: 'absolute',
    right: 8,
    top: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countdownText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});

function PushSetup() {
  const { participantId, equipeId } = useAuth();

  useEffect(() => {
    if (!participantId || !equipeId) return;

    registerForPushNotifications()
      .then((token) => {
        if (token && equipeId) {
          apiFetch(`/equipes/${equipeId}/push-token`, {
            method: 'PATCH',
            body: JSON.stringify({ expo_push_token: token }),
          }).catch(console.error);
        }
      })
      .catch(console.error);
  }, [participantId, equipeId]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PushSetup />
        <MessageTicker />
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#030712' } }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
