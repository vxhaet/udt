import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View, Text, Animated, Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { registerForPushNotifications } from '@/lib/notifications';
import { apiFetch, type CarteData } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { getSocket } from '@/lib/socket';

const SCREEN_WIDTH = Dimensions.get('window').width;

const TICKER_COLORS: Record<string, string> = {
  ALERTE: '#f97316',
  INFO: '#e8556d',
  METEO: '#06b6d4',
};

interface TickerMessage {
  contenu: string;
  type: string;
  expires_at?: string;
}

function MessageTicker() {
  const { token, editionId } = useAuth();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<TickerMessage | null>(null);
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

  const showAlert = useCallback((msg: TickerMessage) => {
    if (animRef.current) animRef.current.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setMessage(msg);
    translateX.setValue(SCREEN_WIDTH);
    animRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, {
          toValue: -SCREEN_WIDTH * 2,
          duration: 9000,
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

    if (msg.expires_at) {
      const expiresMs = new Date(msg.expires_at).getTime();
      const update = () => {
        const left = Math.max(0, Math.round((expiresMs - Date.now()) / 1000));
        setRemaining(left);
        if (left <= 0) clearTicker();
      };
      update();
      timerRef.current = setInterval(update, 1000);
    } else {
      setRemaining(null);
    }
  }, [translateX, clearTicker]);

  // Check for active QG éphémère via API (mount + foreground)
  const checkForActiveQG = useCallback(async () => {
    if (!editionId || messageRef.current) return;
    try {
      const data = await apiFetch<CarteData>(`/editions/${editionId}/carte`);
      const now = Date.now();
      const active = data.checkpoints.find(
        (cp) => cp.type === 'EPHEMERE_QG' && cp.expires_at && new Date(cp.expires_at).getTime() > now,
      );
      if (active && !messageRef.current) {
        showAlert({
          contenu: `🚨 QG éphémère actif ! ${active.points ?? '?'} points ! Foncez !`,
          type: 'ALERTE',
          expires_at: active.expires_at!,
        });
      }
    } catch { /* ignore — app might not be fully loaded yet */ }
  }, [editionId, showAlert]);

  // On mount: check for active QG
  useEffect(() => {
    if (!token || !editionId) return;
    checkForActiveQG();
  }, [token, editionId, checkForActiveQG]);

  // On foreground: re-check
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkForActiveQG();
    });
    return () => sub.remove();
  }, [checkForActiveQG]);

  // Socket listeners
  useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;

    const handler = (msg: TickerMessage) => showAlert(msg);
    const onExpired = () => {
      if (messageRef.current?.type === 'ALERTE') clearTicker();
    };

    socket.on('message:qg', handler);
    socket.on('checkpoint:expired', onExpired);
    return () => {
      socket.off('message:qg', handler);
      socket.off('checkpoint:expired', onExpired);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [token, showAlert, clearTicker]);

  if (!message) return null;

  const bgColor = TICKER_COLORS[message.type] ?? '#e8556d';
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
