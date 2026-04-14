import { ipcMain } from 'electron';

import type {
  Channel,
  ChannelState,
  ClearHistoryResult,
  DeleteHistoryOneResult,
  FoxCodeLoginState,
  FoxCodeOpenLoginResult,
  FoxCodeQuotaResult,
  FoxCodeStatusResult,
  HistoryListResult,
  SwitchResult
} from '../types';

type MainIpcDependencies = {
  getState: () => ChannelState;
  switchChannel: (channel: Channel) => SwitchResult;
  clearHistory: () => ClearHistoryResult;
  listHistory: () => HistoryListResult;
  deleteHistoryOne: (sessionId: string) => DeleteHistoryOneResult;
  openFoxCodeLoginWindow: () => Promise<FoxCodeOpenLoginResult>;
  readFoxCodeLoginState: () => Promise<FoxCodeLoginState>;
  fetchFoxCodeQuota: () => Promise<FoxCodeQuotaResult>;
  fetchFoxCodeStatus: () => Promise<FoxCodeStatusResult>;
};

// 通过依赖注入隔离 IPC 与业务实现，入口层只负责编排，便于替换/测试具体服务。
export function registerIpcHandlers(deps: MainIpcDependencies): void {
  ipcMain.handle('state:get', async (): Promise<ChannelState> => deps.getState());

  ipcMain.handle('channel:switch', async (_event, channel: Channel): Promise<SwitchResult> => {
    if (channel !== 'default' && channel !== 'fox') {
      throw new Error(`不支持的通道: ${channel}`);
    }
    return deps.switchChannel(channel);
  });

  ipcMain.handle('history:clear', async (): Promise<ClearHistoryResult> => deps.clearHistory());

  ipcMain.handle('history:list', async (): Promise<HistoryListResult> => deps.listHistory());

  ipcMain.handle('history:delete-one', async (_event, sessionId: string): Promise<DeleteHistoryOneResult> => {
    return deps.deleteHistoryOne(sessionId);
  });

  ipcMain.handle('foxcode:open-login', async (): Promise<FoxCodeOpenLoginResult> => deps.openFoxCodeLoginWindow());

  ipcMain.handle('foxcode:login-state', async (): Promise<FoxCodeLoginState> => deps.readFoxCodeLoginState());

  ipcMain.handle('foxcode:fetch-quota', async (): Promise<FoxCodeQuotaResult> => deps.fetchFoxCodeQuota());

  ipcMain.handle('foxcode:fetch-status', async (): Promise<FoxCodeStatusResult> => deps.fetchFoxCodeStatus());
}
