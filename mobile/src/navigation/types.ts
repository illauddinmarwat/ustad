import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Dashboard: undefined;
  Nearby: { category?: string } | undefined;
  Services: { category?: string } | undefined;
  Applications: undefined;
  Admin: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  RegisterChoice: undefined;
  RegisterCustomer: undefined;
  RegisterProfessional: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  JobDetail: { jobId: string };
  JobTracking: { jobId: string };
  ListingDetail: { listingId: string };
  Notifications: undefined;
  PostJob: undefined;
  PostedJob: { jobId?: string; token?: string };
  JobBoard: undefined;
  BoardJob: { jobId: string };
  RequestWorker: { workerId: string; workerName?: string | null; category?: string | null };
  WorkerOnboarding: undefined;
  Faq: undefined;
  FaqChat: undefined;
  CommunityTips: undefined;
};
