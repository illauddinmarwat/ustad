import { createContext, useContext, type ReactNode } from 'react';

import { CUSTOMER_ID, WORKER_ID } from './demoStore';

type Who = 'customer' | 'worker';
const Ctx = createContext<Who>('customer');

export function DemoWho({ who, children }: { who: Who; children: ReactNode }) {
  return <Ctx.Provider value={who}>{children}</Ctx.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAuth() {
  const who = useContext(Ctx);
  const id = who === 'customer' ? CUSTOMER_ID : WORKER_ID;
  return {
    session: { user: { id } },
    loading: false,
    role: who,
    workerApprovalStatus: 'approved',
    isWorkerAccount: who === 'worker',
    language: 'en',
    setLanguage: async () => {},
    rejectionReason: null,
    registering: false,
    setRegistering: () => {},
    signIn: async () => {},
    signUp: async () => ({ requiresConfirmation: false }),
    signOut: async () => {},
    refreshApproval: async () => 'approved',
    setRole: async () => {},
  };
}
