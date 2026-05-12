import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Dashboard: undefined;
  Services: undefined;
  Jobs: undefined;
  Applications: undefined;
  Admin: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  JobDetail: { jobId: string };
  ListingDetail: { listingId: string };
  WorkerOnboarding: undefined;
  Faq: undefined;
  FaqChat: undefined;
  CommunityTips: undefined;
};
