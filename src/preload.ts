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

const api = {
  getState: (): Promise<ChannelState> => ipcRenderer.invoke('state:get'),
  switchChannel: (channel: Channel): Promise<SwitchResult> => ipcRenderer.invoke('channel:switch', channel),
  clearHistory: (): Promise<ClearHistoryResult> => ipcRenderer.invoke('history:clear'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('external:open', url)
};

contextBridge.exposeInMainWorld('codexChannelAPI', api);
