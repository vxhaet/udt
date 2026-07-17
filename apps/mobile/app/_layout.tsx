import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { View, Animated, Dimensions, StyleSheet } from 'react-native';
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
  const [message, setMessage] = useState<{ contenu: string; type: string } | null>(null);
  const translateX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  // Ref pour accéder au message courant dans les handlers socket sans dépendance de closure
  const messageRef = useRef<{ contenu: string; type: string } | null>(null);
  messageRef.current = message;

  useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) {
      console.log('[MessageTicker] socket null après auth — abonnement ignoré');
      return;
    }
    console.log('[MessageTicker] Abonnement message:qg sur socket', socket.id);

    const handler = (msg: { contenu: string; type: string }) => {
      console.log('[MessageTicker] message:qg reçu', msg.type, msg.contenu.slice(0, 40));
      if (animRef.current) animRef.current.stop();
      setMessage(msg);
      translateX.setValue(SCREEN_WIDTH);
      // Boucle infinie : scroll → reset instantané → scroll → ...
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
    };

    const onExpired = () => {
      // Masquer le bandeau si le message en cours est une ALERTE (liée à un CP éphémère)
      if (messageRef.current?.type === 'ALERTE') {
        if (animRef.current) animRef.current.stop();
        setMessage(null);
      }
    };

    socket.on('message:qg', handler);
    socket.on('checkpoint:expired', onExpired);
    return () => {
      console.log('[MessageTicker] Désabonnement message:qg');
      socket.off('message:qg', handler);
      socket.off('checkpoint:expired', onExpired);
    };
  }, [token, translateX]);

  if (!message) return null;

  const bgColor = TICKER_COLORS[message.type] ?? '#3b82f6';

  return (
    <View style={[styles.tickerBar, { backgroundColor: bgColor, top: insets.top }]}>
      <Animated.Text
        style={[styles.tickerText, { transform: [{ translateX }] }]}
        numberOfLines={1}
      >
        {message.contenu}
      </Animated.Text>
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
