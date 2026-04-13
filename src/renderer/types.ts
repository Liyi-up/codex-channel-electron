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
  storage: 'sessions' | 'archived_sessions' | 'index_only' | 'state_sqlite';
};

export type HistoryListResult = {
  items: HistoryEntry[];
  total: number;
};

export type DeleteHistoryOneResult = {
  actions: string[];
  errors: string[];
};

export type FoxCodeQuotaResult = {
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

export type FoxCodeStatusResult = {
  ok: boolean;
  message: string;
  data?: {
    moduleName: 'FoxCode';
    submoduleName: 'FoxCodex 状态';
    groupName: string;
    monitorName: string;
    monitorId: number;
    uptime24h: number | null;
    latestStatus: 'up' | 'down' | 'unknown';
    latestCheckedAt: string;
    heartbeatPoints: Array<{
      status: 1 | 0 | -1;
      time: string;
    }>;
    heartbeatWindowLabel: string;
  };
};

export type FoxCodeLoginState = {
  hasCookie: boolean;
  isAuthenticated: boolean;
  cookieCount: number;
  message: string;
};

export type FoxCodeOpenLoginResult = {
  opened: boolean;
  message: string;
};

export type BusyMap = Record<string, boolean>;

export type QuotaView = {
  total: string;
  username: string;
  updatedAt: string;
  meta: string;
};

export type FoxCodexStatusView = {
  moduleName: string;
  submoduleName: string;
  groupName: string;
  monitorName: string;
  uptime24hText: string;
  latestStatusText: string;
  latestCheckedAt: string;
  latestCheckedAgoText: string;
  heartbeatWindowLabel: string;
  heartbeatPoints: Array<{
    tone: 'up' | 'down' | 'unknown';
    time: string;
    statusText: string;
  }>;
  tone: 'up' | 'down' | 'unknown';
  meta: string;
};

export type CodexChannelAPI = {
  getState: () => Promise<ChannelState>;
  switchChannel: (channel: Channel) => Promise<SwitchResult>;
  clearHistory: () => Promise<ClearHistoryResult>;
  listHistory: () => Promise<HistoryListResult>;
  deleteHistoryOne: (sessionId: string) => Promise<DeleteHistoryOneResult>;
  openFoxCodeLogin: () => Promise<FoxCodeOpenLoginResult>;
  getFoxCodeLoginState: () => Promise<FoxCodeLoginState>;
  fetchFoxCodeQuota: () => Promise<FoxCodeQuotaResult>;
  fetchFoxCodeStatus: () => Promise<FoxCodeStatusResult>;
};
