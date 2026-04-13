import { contextBridge, ipcRenderer } from 'electron';

type Channel = 'default' | 'fox';

type ChannelState = {
  current: Channel | 'mixed';
  configMatch: Channel | 'unknown';
  authMatch: Channel | 'unknown';
};

type SwitchResult = {
  state: ChannelState;
  runtime: {
    actions: string[];
    errors: string[];
  };
};

type ClearHistoryResult = {
  actions: string[];
  errors: string[];
};

type HistoryEntry = {
  id: string;
  threadName: string;
  updatedAt: string;
  storage: 'sessions' | 'archived_sessions' | 'index_only' | 'state_sqlite';
};

type HistoryListResult = {
  items: HistoryEntry[];
  total: number;
};

type DeleteHistoryOneResult = {
  actions: string[];
  errors: string[];
};

type FoxCodeQuotaResult = {
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

type FoxCodeStatusResult = {
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

type FoxCodeLoginState = {
  hasCookie: boolean;
  isAuthenticated: boolean;
  cookieCount: number;
  message: string;
};

type FoxCodeOpenLoginResult = {
  opened: boolean;
  message: string;
};

const api = {
  getState: (): Promise<ChannelState> => ipcRenderer.invoke('state:get'),
  switchChannel: (channel: Channel): Promise<SwitchResult> => ipcRenderer.invoke('channel:switch', channel),
  clearHistory: (): Promise<ClearHistoryResult> => ipcRenderer.invoke('history:clear'),
  listHistory: (): Promise<HistoryListResult> => ipcRenderer.invoke('history:list'),
  deleteHistoryOne: (sessionId: string): Promise<DeleteHistoryOneResult> =>
    ipcRenderer.invoke('history:delete-one', sessionId),
  openFoxCodeLogin: (): Promise<FoxCodeOpenLoginResult> => ipcRenderer.invoke('foxcode:open-login'),
  getFoxCodeLoginState: (): Promise<FoxCodeLoginState> => ipcRenderer.invoke('foxcode:login-state'),
  fetchFoxCodeQuota: (): Promise<FoxCodeQuotaResult> => ipcRenderer.invoke('foxcode:fetch-quota'),
  fetchFoxCodeStatus: (): Promise<FoxCodeStatusResult> => ipcRenderer.invoke('foxcode:fetch-status')
};

contextBridge.exposeInMainWorld('codexChannelAPI', api);
