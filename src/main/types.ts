export type Channel = 'default' | 'fox';

export type ChannelState = {
  current: Channel | 'mixed';
  configMatch: Channel | 'unknown';
  authMatch: Channel | 'unknown';
};

export type RuntimeRefreshResult = {
  actions: string[];
  errors: string[];
};

export type SwitchResult = {
  state: ChannelState;
  runtime: RuntimeRefreshResult;
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

export type FoxCodeQuotaData = {
  totalQuota: string;
  monthQuota: string;
  username: string;
};

export type FoxCodeQuotaResult = {
  ok: boolean;
  requiresLogin: boolean;
  hasCookie: boolean;
  message: string;
  apiEndpoint?: string;
  data?: FoxCodeQuotaData;
};

export type FoxCodeStatusData = {
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

export type FoxCodeStatusResult = {
  ok: boolean;
  message: string;
  data?: FoxCodeStatusData;
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
