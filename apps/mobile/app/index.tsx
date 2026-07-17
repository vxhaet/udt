import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/context/AuthContext';

export default function Index() {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return <Redirect href={token ? '/(app)/carte' : '/(auth)/login'} />;
}
