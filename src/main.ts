import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

type Channel = 'default' | 'fox';

type ChannelState = {
  current: Channel | 'mixed';
  configMatch: Channel | 'unknown';
  authMatch: Channel | 'unknown';
};

type RuntimeRefreshResult = {
  actions: string[];
  errors: string[];
};

type SwitchResult = {
  state: ChannelState;
  runtime: RuntimeRefreshResult;
};

type ClearHistoryResult = {
  actions: string[];
  errors: string[];
};

const BASE_DIR = path.join(os.homedir(), '.codex');
const CONFIG_TARGET = path.join(BASE_DIR, 'config.toml');
const AUTH_TARGET = path.join(BASE_DIR, 'auth.json');

const CHANNEL_FILES: Record<Channel, { config: string; auth: string }> = {
  default: {
    config: path.join(BASE_DIR, 'config-default.toml'),
    auth: path.join(BASE_DIR, 'auth-default.json')
  },
  fox: {
    config: path.join(BASE_DIR, 'config-fox.toml'),
    auth: path.join(BASE_DIR, 'auth-fox.json')
  }
};

const HISTORY_FILES = [path.join(BASE_DIR, 'history.jsonl'), path.join(BASE_DIR, 'session_index.jsonl')];

const HISTORY_DIRS = [path.join(BASE_DIR, 'sessions'), path.join(BASE_DIR, 'archived_sessions')];

const APP_WINDOW_TITLE = 'codex channel';

function readBufferSafe(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function sameFile(a: string, b: string): boolean {
  const aBuffer = readBufferSafe(a);
  const bBuffer = readBufferSafe(b);
  return !!aBuffer && !!bBuffer && aBuffer.equals(bBuffer);
}

function ensureRequired(): void {
  const requiredFiles = [
    CONFIG_TARGET,
    AUTH_TARGET,
    CHANNEL_FILES.default.config,
    CHANNEL_FILES.default.auth,
    CHANNEL_FILES.fox.config,
    CHANNEL_FILES.fox.auth
  ];

  const missing = requiredFiles.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length > 0) {
    throw new Error(`缺少必要文件: ${missing.join(', ')}`);
  }
}

function getState(): ChannelState {
  let configMatch: ChannelState['configMatch'] = 'unknown';
  let authMatch: ChannelState['authMatch'] = 'unknown';

  if (sameFile(CONFIG_TARGET, CHANNEL_FILES.default.config)) configMatch = 'default';
  if (sameFile(CONFIG_TARGET, CHANNEL_FILES.fox.config)) configMatch = 'fox';

  if (sameFile(AUTH_TARGET, CHANNEL_FILES.default.auth)) authMatch = 'default';
  if (sameFile(AUTH_TARGET, CHANNEL_FILES.fox.auth)) authMatch = 'fox';

  const current: ChannelState['current'] = configMatch === authMatch && configMatch !== 'unknown' ? configMatch : 'mixed';

  return { current, configMatch, authMatch };
}

function runCmd(command: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(command, args, { encoding: 'utf8' });
}

function pidsByPattern(pattern: string, exact = false): number[] {
  const args = [exact ? '-x' : '-f', pattern];
  const ret = runCmd('/usr/bin/pgrep', args);

  if (ret.status !== 0 || !ret.stdout) return [];

  const output = String(ret.stdout);
  const pids: number[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (/^\d+$/.test(trimmed)) pids.push(Number(trimmed));
  }
  return pids;
}

function refreshCodexRuntime(): RuntimeRefreshResult {
  const actions: string[] = [];
  const errors: string[] = [];

  const appServerPids = pidsByPattern('codex app-server').filter((pid) => pid !== process.pid);
  if (appServerPids.length > 0) {
    for (const pid of appServerPids) {
      const ret = runCmd('/bin/kill', ['-TERM', String(pid)]);
      if (ret.status !== 0) errors.push(`结束 app-server(${pid}) 失败`);
    }
    actions.push(`已请求重启 app-server: ${appServerPids.join(', ')}`);
  }

  if (fs.existsSync('/Applications/Codex.app')) {
    const codexPids = pidsByPattern('Codex', true);
    if (codexPids.length > 0) {
      const quitRet = runCmd('/usr/bin/osascript', ['-e', 'tell application "Codex" to quit']);
      if (quitRet.status !== 0) {
        const forceRet = runCmd('/usr/bin/pkill', ['-x', 'Codex']);
        if (forceRet.status === 0 || forceRet.status === 1) {
          actions.push('已执行进程级重启 Codex.app');
        } else {
          errors.push('退出 Codex.app 失败');
        }
      } else {
        actions.push('已请求退出 Codex.app');
      }
    }

    const openRet = runCmd('/usr/bin/open', ['-a', 'Codex']);
    if (openRet.status === 0) {
      actions.push('已重新打开 Codex.app');
    } else {
      errors.push('打开 Codex.app 失败');
    }
  }

  return { actions, errors };
}

function switchChannel(channel: Channel): SwitchResult {
  ensureRequired();

  fs.copyFileSync(CHANNEL_FILES[channel].config, CONFIG_TARGET);
  fs.copyFileSync(CHANNEL_FILES[channel].auth, AUTH_TARGET);

  fs.chmodSync(CONFIG_TARGET, 0o600);
  fs.chmodSync(AUTH_TARGET, 0o600);

  return {
    state: getState(),
    runtime: refreshCodexRuntime()
  };
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function clearDirContent(dirPath: string): void {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.rmSync(fullPath, { force: true });
    }
  }
}

function clearHistory(): ClearHistoryResult {
  const actions: string[] = [];
  const errors: string[] = [];

  const backupRoot = path.join(BASE_DIR, '.history-backups');
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const backupDir = path.join(backupRoot, stamp);
  ensureDir(backupDir);

  for (const filePath of HISTORY_FILES) {
    const fileName = path.basename(filePath);
    try {
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, path.join(backupDir, fileName));
      } else {
        ensureDir(path.dirname(filePath));
      }
      fs.writeFileSync(filePath, '');
      fs.chmodSync(filePath, 0o600);
      actions.push(`已清空文件: ${fileName}`);
    } catch (err) {
      errors.push(`处理文件失败(${fileName}): ${(err as Error).message}`);
    }
  }

  for (const dirPath of HISTORY_DIRS) {
    const dirName = path.basename(dirPath);
    try {
      if (fs.existsSync(dirPath)) {
        fs.cpSync(dirPath, path.join(backupDir, dirName), { recursive: true });
      }
      ensureDir(dirPath);
      clearDirContent(dirPath);
      actions.push(`已清空目录: ${dirName}`);
    } catch (err) {
      errors.push(`处理目录失败(${dirName}): ${(err as Error).message}`);
    }
  }

  actions.push(`备份位置: ${backupDir}`);
  return { actions, errors };
}

let windowRef: BrowserWindow | null = null;

function createWindow(): void {
  windowRef = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 820,
    minHeight: 580,
    backgroundColor: '#0d1016',
    title: APP_WINDOW_TITLE,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  windowRef.removeMenu();
  windowRef.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('state:get', async (): Promise<ChannelState> => getState());

ipcMain.handle('channel:switch', async (_event, channel: Channel): Promise<SwitchResult> => {
  if (channel !== 'default' && channel !== 'fox') {
    throw new Error(`不支持的通道: ${channel}`);
  }
  return switchChannel(channel);
});

ipcMain.handle('history:clear', async (): Promise<ClearHistoryResult> => clearHistory());

ipcMain.handle('external:open', async (_event, url: string): Promise<void> => {
  if (!/^https?:\/\//.test(url)) throw new Error(`非法 URL: ${url}`);
  await shell.openExternal(url);
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
