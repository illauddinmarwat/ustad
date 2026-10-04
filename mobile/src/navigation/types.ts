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
  ListingWizard:
    | { draft?: import('../lib/aiDraft').ListingDraft; templateId?: string; listingId?: string; prefill?: { about: string } }
    | undefined;
  Notifications: undefined;
  PostJob: { draft?: import('../lib/aiDraft').JobDraft; prefill?: { description: string } } | undefined;
  AiHelper: {
    mode: 'job' | 'listing';
    /** Text already typed in the wizard's Describe step, so the helper can start from it. */
    startText?: string;
    /** What was attached in step 1 (the helper cannot see it, only count it). */
    attached?: import('../lib/aiDraft').Attached;
    serviceTitle?: string;
    serviceId?: string;
    /** The services to choose from, when none is chosen yet (listing). */
    services?: Array<{ id: string; title: string }>;
    categories?: string[];
  };
  PostedJob: { jobId?: string; token?: string; mediaFailed?: boolean };
  JobBoard: undefined;
  BoardJob: { jobId: string };
  RequestWorker: { workerId: string; workerName?: string | null; category?: string | null; listingId?: string };
  Faq: undefined;
  FaqChat: undefined;
  CommunityTips: undefined;
};
