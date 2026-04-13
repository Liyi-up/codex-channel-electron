import type { BusyMap, Channel, HistoryEntry } from '../types';

export type CodexStoreState = {
  busy: BusyMap;
  actionLocked: boolean;
  message: string;
  error: string;
};

export type CodexStoreActions = {
  isBusy: (key: string) => boolean;
  setFeedback: (message?: string, error?: string) => void;
  switchChannel: (channel: Channel) => Promise<void>;
  clearHistory: () => Promise<void>;
  deleteHistoryOne: (item: HistoryEntry) => Promise<void>;
  openFoxCodeLogin: () => Promise<void>;
};

export type CodexStore = CodexStoreState & CodexStoreActions;

export const INITIAL_STORE_STATE: CodexStoreState = {
  busy: {},
  actionLocked: false,
  message: '',
  error: ''
};
