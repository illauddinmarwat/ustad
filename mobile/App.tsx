import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import {
  NotoNastaliqUrdu_400Regular,
  NotoNastaliqUrdu_600SemiBold,
} from '@expo-google-fonts/noto-nastaliq-urdu';
import {
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer, useNavigation, type Theme } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './src/components/ui/Icon';
import { TabBarLabel } from './src/components/ui/TabBarLabel';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { en } from './src/i18n/useT';
import { getTabBarStyle } from './src/navigation/tabBarStyle';
import type { RootStackParamList, TabParamList } from './src/navigation/types';
import AccountScreen from './src/screens/app/AccountScreen';
import AdminOpsScreen from './src/screens/app/AdminOpsScreen';
import ApplicationsScreen from './src/screens/app/ApplicationsScreen';
import CommunityTipsScreen from './src/screens/app/CommunityTipsScreen';
import DashboardScreen from './src/screens/app/DashboardScreen';
import FaqChatScreen from './src/screens/app/FaqChatScreen';
import FaqScreen from './src/screens/app/FaqScreen';
import JobDetailScreen from './src/screens/app/JobDetailScreen';
import JobTrackingScreen from './src/screens/app/JobTrackingScreen';
import ListingDetailScreen from './src/screens/app/ListingDetailScreen';
import NearbyUstadScreen from './src/screens/app/NearbyUstadScreen';
import { badgeValue, notificationTarget } from './src/lib/notificationHelpers';
import { configureForegroundNotifications, registerForPush } from './src/lib/notifications';
import { useUnreadNotifications } from './src/lib/useUnreadNotifications';
import BoardJobScreen from './src/screens/app/BoardJobScreen';
import JobBoardScreen from './src/screens/app/JobBoardScreen';
import NotificationsScreen from './src/screens/app/NotificationsScreen';
import PostedJobScreen from './src/screens/app/PostedJobScreen';
import PostJobScreen from './src/screens/app/PostJobScreen';
import RequestWorkerScreen from './src/screens/app/RequestWorkerScreen';
import ServicesScreen from './src/screens/app/ServicesScreen';
import WorkerOnboardingScreen from './src/screens/app/WorkerOnboardingScreen';
import AuthScreen from './src/screens/auth/AuthScreen';
import RegisterChoiceScreen from './src/screens/auth/RegisterChoiceScreen';
import RegisterCustomerScreen from './src/screens/auth/RegisterCustomerScreen';
import RegisterProfessionalScreen from './src/screens/auth/RegisterProfessionalScreen';
import { colors } from './src/theme/tokens';
import { fontFamilies } from './src/theme/typography';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.surface,
    text: colors.textStrong,
    border: colors.divider,
    notification: colors.danger,
  },
};

type TabIconArgs = { focused: boolean; color: string; size: number };

function tabIcon(name: Parameters<typeof Icon>[0]['name']) {
  return ({ color, size }: TabIconArgs) => <Icon name={name} size={size} color={color} />;
}

function useTabScreenOptions() {
  const insets = useSafeAreaInsets();
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarStyle: getTabBarStyle({ bottom: insets.bottom }),
    tabBarLabelStyle: { fontFamily: fontFamilies.bodySemiBold, fontSize: 10 },
  } as const;
}

function AdminTabs() {
  const tabScreenOptions = useTabScreenOptions();
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel id="tabs.dashboard" focused={focused} />,
          tabBarIcon: tabIcon('home'),
        }}
      />
      <Tab.Screen
        name="Admin"
        component={AdminOpsScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel id="tabs.admin" focused={focused} />,
          tabBarIcon: tabIcon('settings'),
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel id="tabs.account" focused={focused} />,
          tabBarIcon: tabIcon('user'),
        }}
      />
    </Tab.Navigator>
  );
}

function WorkerTabs() {
  const tabScreenOptions = useTabScreenOptions();
  const { session } = useAuth();
  const { count: unread } = useUnreadNotifications(session?.user.id);
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel id="tabs.dashboard" focused={focused} />,
          tabBarIcon: tabIcon('home'),
        }}
      />
      <Tab.Screen
        name="Services"
        component={ServicesScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel id="tabs.services" focused={focused} />,
          tabBarIcon: tabIcon('grid'),
        }}
      />
      <Tab.Screen
        name="Applications"
        component={ApplicationsScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel id="tabs.applications" focused={focused} />,
          tabBarIcon: tabIcon('inbox'),
          tabBarBadge: badgeValue(unread),
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel id="tabs.account" focused={focused} />,
          tabBarIcon: tabIcon('user'),
        }}
      />
    </Tab.Navigator>
  );
}

function CustomerTabs() {
  const tabScreenOptions = useTabScreenOptions();
  const { session } = useAuth();
  const { count: unread } = useUnreadNotifications(session?.user.id);
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel id="tabs.dashboard" focused={focused} />,
          tabBarIcon: tabIcon('home'),
        }}
      />
      <Tab.Screen
        name="Nearby"
        component={NearbyUstadScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel id="tabs.nearby" focused={focused} />,
          tabBarIcon: tabIcon('map-pin'),
        }}
      />
      <Tab.Screen
        name="Services"
        component={ServicesScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel id="tabs.services" focused={focused} />,
          tabBarIcon: tabIcon('grid'),
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel id="tabs.account" focused={focused} />,
          tabBarIcon: tabIcon('user'),
        }}
      />
    </Tab.Navigator>
  );
}

function AppTabs() {
  const { role, session } = useAuth();

  if (session && role === 'admin') return <AdminTabs />;
  if (session && role === 'worker') return <WorkerTabs />;

  return <CustomerTabs />;
}

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.textStrong,
  headerTitleStyle: { fontFamily: fontFamilies.bodyBold, fontSize: 17 },
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: colors.bg },
} as const;

configureForegroundNotifications();

/** Registers this device for push while signed in, and opens the right screen when a push is tapped. */
function PushRegistration() {
  const { session } = useAuth();
  const navigation = useNavigation<any>();
  const uid = session?.user.id;

  useEffect(() => {
    if (uid) void registerForPush();
  }, [uid]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { kind?: string; job_id?: string | null } | undefined;
      const target = notificationTarget(data?.kind ?? '', data?.job_id);
      if (target.screen === 'JobDetail') navigation.navigate('JobDetail', target.params);
      else if (target.screen === 'Account') navigation.navigate('Tabs', { screen: 'Account' });
      else navigation.navigate('Tabs', { screen: 'Applications' });
    });
    return () => sub.remove();
  }, [navigation]);

  return null;
}

function RootNavigator() {
  const { loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return (
    <>
    <PushRegistration />
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Tabs" component={AppTabs} options={{ title: en('nav.app'), headerShown: false }} />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ title: en('nav.signIn') }} />
      <Stack.Screen name="RegisterChoice" component={RegisterChoiceScreen} options={{ title: en('nav.registerChoice') }} />
      <Stack.Screen
        name="RegisterCustomer"
        component={RegisterCustomerScreen}
        options={{ title: en('nav.registerCustomer') }}
      />
      <Stack.Screen
        name="RegisterProfessional"
        component={RegisterProfessionalScreen}
        options={{ title: en('nav.registerProfessional') }}
      />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: en('nav.job') }} />
      <Stack.Screen
        name="JobTracking"
        component={JobTrackingScreen}
        options={{
          title: en('nav.jobTracking'),
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.primaryInk,
        }}
      />
      <Stack.Screen name="ListingDetail" component={ListingDetailScreen} options={{ title: en('nav.service') }} />
      <Stack.Screen name="PostJob" component={PostJobScreen} options={{ title: en('nav.postJob') }} />
      <Stack.Screen name="PostedJob" component={PostedJobScreen} options={{ title: en('nav.postedJob') }} />
      <Stack.Screen name="JobBoard" component={JobBoardScreen} options={{ title: en('nav.jobBoard') }} />
      <Stack.Screen name="BoardJob" component={BoardJobScreen} options={{ title: en('nav.boardJob') }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: en('nav.notifications') }} />
      <Stack.Screen name="RequestWorker" component={RequestWorkerScreen} options={{ title: en('nav.requestWorker') }} />
      <Stack.Screen
        name="WorkerOnboarding"
        component={WorkerOnboardingScreen}
        options={{ title: en('nav.documentVerification') }}
      />
      <Stack.Screen name="Faq" component={FaqScreen} options={{ title: en('nav.faq') }} />
      <Stack.Screen name="FaqChat" component={FaqChatScreen} options={{ title: en('nav.faqChat') }} />
      <Stack.Screen name="CommunityTips" component={CommunityTipsScreen} options={{ title: en('nav.communityTips') }} />
    </Stack.Navigator>
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    NotoNastaliqUrdu_400Regular,
    NotoNastaliqUrdu_600SemiBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="dark" />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
