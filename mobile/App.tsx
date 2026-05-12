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
import { DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';

import { Icon } from './src/components/ui/Icon';
import { TabBarLabel } from './src/components/ui/TabBarLabel';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { en } from './src/i18n/useT';
import type { RootStackParamList, TabParamList } from './src/navigation/types';
import AccountScreen from './src/screens/app/AccountScreen';
import AdminOpsScreen from './src/screens/app/AdminOpsScreen';
import ApplicationsScreen from './src/screens/app/ApplicationsScreen';
import CommunityTipsScreen from './src/screens/app/CommunityTipsScreen';
import DashboardScreen from './src/screens/app/DashboardScreen';
import FaqChatScreen from './src/screens/app/FaqChatScreen';
import FaqScreen from './src/screens/app/FaqScreen';
import JobDetailScreen from './src/screens/app/JobDetailScreen';
import JobsScreen from './src/screens/app/JobsScreen';
import ListingDetailScreen from './src/screens/app/ListingDetailScreen';
import ServicesScreen from './src/screens/app/ServicesScreen';
import WorkerOnboardingScreen from './src/screens/app/WorkerOnboardingScreen';
import AuthScreen from './src/screens/auth/AuthScreen';
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

const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.divider,
    height: 70,
    paddingTop: 6,
    paddingBottom: 8,
  },
  tabBarLabelStyle: { fontFamily: fontFamilies.bodySemiBold, fontSize: 10 },
} as const;

type TabIconArgs = { focused: boolean; color: string; size: number };

function tabIcon(name: Parameters<typeof Icon>[0]['name']) {
  return ({ color, size }: TabIconArgs) => <Icon name={name} size={size} color={color} />;
}

function GuestCustomerTabs() {
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

function AdminTabs() {
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
        name="Jobs"
        component={JobsScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel id="tabs.jobs" focused={focused} />,
          tabBarIcon: tabIcon('briefcase'),
        }}
      />
      <Tab.Screen
        name="Applications"
        component={ApplicationsScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel id="tabs.applications" focused={focused} />,
          tabBarIcon: tabIcon('inbox'),
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
        name="Jobs"
        component={JobsScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabBarLabel id="tabs.jobs" focused={focused} />,
          tabBarIcon: tabIcon('briefcase'),
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

  if (!session) return <GuestCustomerTabs />;
  if (role === 'admin') return <AdminTabs />;
  if (role === 'worker') return <WorkerTabs />;

  return <CustomerTabs />;
}

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.textStrong,
  headerTitleStyle: { fontFamily: fontFamilies.bodyBold, fontSize: 17 },
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: colors.bg },
} as const;

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
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="Tabs" component={AppTabs} options={{ title: en('nav.app'), headerShown: false }} />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ title: en('nav.signIn') }} />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: en('nav.job') }} />
      <Stack.Screen name="ListingDetail" component={ListingDetailScreen} options={{ title: en('nav.service') }} />
      <Stack.Screen
        name="WorkerOnboarding"
        component={WorkerOnboardingScreen}
        options={{ title: en('nav.documentVerification') }}
      />
      <Stack.Screen name="Faq" component={FaqScreen} options={{ title: en('nav.faq') }} />
      <Stack.Screen name="FaqChat" component={FaqChatScreen} options={{ title: en('nav.faqChat') }} />
      <Stack.Screen name="CommunityTips" component={CommunityTipsScreen} options={{ title: en('nav.communityTips') }} />
    </Stack.Navigator>
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
    <AuthProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
