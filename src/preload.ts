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
  storage: 'sessions' | 'archived_sessions' | 'index_only';
};

type HistoryListResult = {
  items: HistoryEntry[];
  total: number;
};

type DeleteHistoryOneResult = {
  actions: string[];
  errors: string[];
};

type FoxcodeQuotaResult = {
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

type FoxcodeLoginState = {
  hasCookie: boolean;
  isAuthenticated: boolean;
  cookieCount: number;
  message: string;
};

type FoxcodeOpenLoginResult = {
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
  openFoxcodeLogin: (): Promise<FoxcodeOpenLoginResult> => ipcRenderer.invoke('foxcode:open-login'),
  getFoxcodeLoginState: (): Promise<FoxcodeLoginState> => ipcRenderer.invoke('foxcode:login-state'),
  fetchFoxcodeQuota: (): Promise<FoxcodeQuotaResult> => ipcRenderer.invoke('foxcode:fetch-quota')
};

contextBridge.exposeInMainWorld('codexChannelAPI', api);
