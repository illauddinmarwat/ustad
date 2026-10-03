import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Dashboard: undefined;
  Nearby: { category?: string } | undefined;
  Services: { category?: string } | undefined;
  Applications: undefined;
  Requests: undefined;
  Earnings: undefined;
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
  ListingWizard: { draft?: import('../lib/aiDraft').ListingDraft; listingId?: string; prefill?: { about: string } } | undefined;
  Notifications: undefined;
  PostJob: { draft?: import('../lib/aiDraft').JobDraft; prefill?: { description: string } } | undefined;
  AiHelper: { mode: 'job' | 'listing'; serviceTitle?: string; categories?: string[] };
  PostedJob: { jobId?: string; token?: string; mediaFailed?: boolean };
  JobBoard: undefined;
  BoardJob: { jobId: string };
  RequestWorker: { workerId: string; workerName?: string | null; category?: string | null; listingId?: string };
  Faq: undefined;
  FaqChat: undefined;
  CommunityTips: undefined;
};
