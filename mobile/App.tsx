import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import type { RootStackParamList } from './src/navigation/types';
import AuthScreen from './src/screens/auth/AuthScreen';
import HomeScreen from './src/screens/app/HomeScreen';
import { useAuth } from './src/context/AuthContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { session, loading } = useAuth();
  if (loading) return null;
  return (
    <Stack.Navigator>
      {!session ? (
        <Stack.Screen name="Auth" component={AuthScreen} options={{ title: 'Sign in' }} />
      ) : (
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'WorkerzPk Phase 1' }} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
