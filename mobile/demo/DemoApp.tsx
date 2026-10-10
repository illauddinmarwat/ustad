import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import JobDetailScreen from '../src/screens/app/JobDetailScreen';
import { DemoWho } from './demoAuth';
import { store } from './demoStore';

const Stack = createNativeStackNavigator();
const Stub = () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <Text>(map screen)</Text>
  </View>
);

function Phone({ who, label, focus }: { who: 'customer' | 'worker'; label: string; focus?: string }) {
  return (
    <View style={{ width: 390 }}>
      <Text style={{ fontWeight: '700', marginBottom: 6, fontSize: 16 }}>{label}</Text>
      <View style={{ width: 390, height: 780, borderWidth: 6, borderColor: '#222', borderRadius: 28, overflow: 'hidden', backgroundColor: '#fff' }}>
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 378, height: 768 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <DemoWho who={who}>
            <NavigationContainer independent>
              <Stack.Navigator>
                <Stack.Screen name="JobDetail" component={JobDetailScreen as never} initialParams={{ jobId: 'demo', focus }} options={{ title: 'Job' }} />
                <Stack.Screen name="JobTracking" component={Stub} />
                <Stack.Screen name="Auth" component={Stub} />
              </Stack.Navigator>
            </NavigationContainer>
          </DemoWho>
        </SafeAreaProvider>
      </View>
    </View>
  );
}

export default function DemoApp() {
  const [run, setRun] = useState(0);
  const focus = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('focus') ?? undefined : undefined;
  return (
    <ScrollView horizontal style={{ flex: 1, backgroundColor: '#e5e7eb' }} contentContainerStyle={{ padding: 16, gap: 24 }}>
      <View style={{ gap: 12 }}>
        <Text style={{ fontWeight: '700', fontSize: 18 }}>Job flow demo</Text>
        <Text style={{ width: 200, color: '#444' }}>
          Both phones share one job. Tap a step on one phone and watch the other update by itself (with a beep).
        </Text>
        <Pressable
          onPress={() => {
            store.reset();
            setRun((r) => r + 1);
          }}
          style={{ backgroundColor: '#15803D', padding: 10, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>Reset job</Text>
        </Pressable>
      </View>
      <Phone key={`c${run}`} who="customer" label="Customer" focus={focus} />
      <Phone key={`w${run}`} who="worker" label="Ustad (worker)" />
    </ScrollView>
  );
}
