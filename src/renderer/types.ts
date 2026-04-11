export type Channel = 'default' | 'fox';

export type ChannelState = {
  current: Channel | 'mixed';
  configMatch: Channel | 'unknown';
  authMatch: Channel | 'unknown';
};

export type SwitchResult = {
  state: ChannelState;
  runtime: {
    actions: string[];
    errors: string[];
  };
};

export type ClearHistoryResult = {
  actions: string[];
  errors: string[];
};

export type HistoryEntry = {
  id: string;
  threadName: string;
  updatedAt: string;
  storage: 'sessions' | 'archived_sessions' | 'index_only';
};

export type HistoryListResult = {
  items: HistoryEntry[];
  total: number;
};

export type DeleteHistoryOneResult = {
  actions: string[];
  errors: string[];
};

export type FoxcodeQuotaResult = {
  ok: boolean;
  requiresLogin: boolean;
  hasCookie: boolean;
  message: string;
  apiEndpoint?: string;
  data?: {
    totalQuota: string;
    monthQuota: string;
    username: string;
  };
};

export type FoxcodeLoginState = {
  hasCookie: boolean;
  isAuthenticated: boolean;
  cookieCount: number;
  message: string;
};

export type FoxcodeOpenLoginResult = {
  opened: boolean;
  message: string;
};

export type BusyMap = Record<string, boolean>;

export type QuotaView = {
  total: string;
  month: string;
  username: string;
  updatedAt: string;
  meta: string;
};

export type CodexChannelAPI = {
  getState: () => Promise<ChannelState>;
  switchChannel: (channel: Channel) => Promise<SwitchResult>;
  clearHistory: () => Promise<ClearHistoryResult>;
  listHistory: () => Promise<HistoryListResult>;
  deleteHistoryOne: (sessionId: string) => Promise<DeleteHistoryOneResult>;
  openFoxcodeLogin: () => Promise<FoxcodeOpenLoginResult>;
  getFoxcodeLoginState: () => Promise<FoxcodeLoginState>;
  fetchFoxcodeQuota: () => Promise<FoxcodeQuotaResult>;
};
