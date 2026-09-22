import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const { token, isLoading } = useAuth();
  if (!isLoading && !token) {
    return <Redirect href="/(auth)/login" />;
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#111827',
          borderTopColor: '#1f2937',
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
        },
        tabBarActiveTintColor: '#e8556d',
        tabBarInactiveTintColor: '#6b7280',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="carte"
        options={{
          title: 'Carte',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="suivi"
        options={{
          title: 'Suivi',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="navigate-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="classement"
        options={{
          title: 'Classement',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="archives"
        options={{
          title: 'Album',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="images-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="checkpoint/[id]"
        options={{
          href: null, // Masquer de la tab bar — navigué programmatiquement
        }}
      />
      <Tabs.Screen
        name="archive/[id]"
        options={{
          href: null, // Masquer de la tab bar — navigué depuis la liste des archives
        }}
      />
    </Tabs>
  );
}
