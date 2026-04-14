import { app, BrowserWindow } from 'electron';

import { registerIpcHandlers } from './main/ipc/registerIpcHandlers';
import { getState, switchChannel } from './main/services/channelService';
import { clearHistory, deleteHistoryOne, listHistory } from './main/services/historyService';
import {
  fetchFoxCodeQuota,
  fetchFoxCodeStatus,
  openFoxCodeLoginWindow,
  readFoxCodeLoginState
} from './main/services/foxcodeService';
import { createMainWindow } from './main/window/createMainWindow';

// main.ts 作为组合根（Composition Root）：仅装配依赖与生命周期，不承载业务细节。
function bootstrapMainProcess(): void {
  registerIpcHandlers({
    getState,
    switchChannel,
    clearHistory,
    listHistory,
    deleteHistoryOne,
    openFoxCodeLoginWindow,
    readFoxCodeLoginState,
    fetchFoxCodeQuota,
    fetchFoxCodeStatus
  });

  app.whenReady().then(() => {
    void createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

bootstrapMainProcess();
