import type { BusyMap, Channel, HistoryEntry } from '../types';

export type CodexStoreState = {
  busy: BusyMap;
  actionLocked: boolean;
  message: string;
  error: string;
  historyExpanded: boolean;
};

export type CodexStoreActions = {
  isBusy: (key: string) => boolean;
  setHistoryExpanded: (expanded: boolean) => void;
  setFeedback: (message?: string, error?: string) => void;
  switchChannel: (channel: Channel) => Promise<void>;
  clearHistory: () => Promise<void>;
  deleteHistoryOne: (item: HistoryEntry) => Promise<void>;
  openFoxcodeLogin: () => Promise<void>;
};

export type CodexStore = CodexStoreState & CodexStoreActions;

export const INITIAL_STORE_STATE: CodexStoreState = {
  busy: {},
  actionLocked: false,
  message: '',
  error: '',
  historyExpanded: false
};
