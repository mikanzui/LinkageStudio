import { create } from 'zustand';
import type { RecoveryMetadata, RecoveryStatus } from '../document/recovery';

export const useRecoveryStore = create<{
  status: RecoveryStatus; error: string; drafts: RecoveryMetadata[]; open: boolean;
}>(() => ({ status: 'idle', error: '', drafts: [], open: false }));
