import { app, BrowserWindow, ipcMain, session } from 'electron';
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

type FoxcodeQuotaData = {
  totalQuota: string;
  monthQuota: string;
  username: string;
};

type FoxcodeQuotaResult = {
  ok: boolean;
  requiresLogin: boolean;
  hasCookie: boolean;
  message: string;
  apiEndpoint?: string;
  data?: FoxcodeQuotaData;
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

const FOXCODE_PARTITION = 'persist:foxcode-auth';
const FOXCODE_LOGIN_URL = 'https://foxcode.rjj.cc/auth/login';
const FOXCODE_DASHBOARD_URL = 'https://foxcode.rjj.cc/dashboard';

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

function walkFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];

  const result: string[] = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        result.push(fullPath);
      }
    }
  }

  return result;
}

function normalizeSessionId(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function pickSessionIdFromRecord(record: Record<string, unknown>): string {
  const idKeys = ['id', 'session_id', 'sessionId', 'thread_id', 'threadId', 'conversation_id', 'conversationId'];
  for (const key of idKeys) {
    const value = normalizeSessionId(record[key]);
    if (value) return value;
  }

  return '';
}

function extractSessionIdFromLine(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) return '';

    const direct = pickSessionIdFromRecord(parsed);
    if (direct) return direct;

    const payload = parsed.payload;
    if (isRecord(payload)) return pickSessionIdFromRecord(payload);
  } catch {
    return '';
  }

  return '';
}

function readFirstLine(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const endIndex = content.indexOf('\n');
    return endIndex >= 0 ? content.slice(0, endIndex) : content;
  } catch {
    return '';
  }
}

function extractSessionId(filePath: string): string | null {
  const name = path.basename(filePath);
  const uuidMatch = name.match(/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})/i);
  if (uuidMatch && uuidMatch[1]) return uuidMatch[1].toLowerCase();

  const genericMatch = name.match(/(?:^|[-_])([a-z0-9]{6,}(?:-[a-z0-9]{2,}){2,})\.jsonl$/i);
  if (genericMatch && genericMatch[1]) return genericMatch[1].toLowerCase();

  const firstLineId = extractSessionIdFromLine(readFirstLine(filePath));
  if (firstLineId) return firstLineId;

  return null;
}

function safeDateValue(isoText: string): number {
  const value = Date.parse(isoText);
  return Number.isNaN(value) ? 0 : value;
}

function listHistory(limit = 120): HistoryListResult {
  const indexPath = path.join(BASE_DIR, 'session_index.jsonl');
  const fileMap = new Map<string, { active: boolean; archived: boolean }>();

  for (const filePath of walkFiles(path.join(BASE_DIR, 'sessions'))) {
    const id = extractSessionId(filePath);
    if (!id) continue;
    const bucket = fileMap.get(id) ?? { active: false, archived: false };
    bucket.active = true;
    fileMap.set(id, bucket);
  }

  for (const filePath of walkFiles(path.join(BASE_DIR, 'archived_sessions'))) {
    const id = extractSessionId(filePath);
    if (!id) continue;
    const bucket = fileMap.get(id) ?? { active: false, archived: false };
    bucket.archived = true;
    fileMap.set(id, bucket);
  }

  if (!fs.existsSync(indexPath)) {
    return { items: [], total: 0 };
  }

  const raw = fs.readFileSync(indexPath, 'utf8');
  const allItems: HistoryEntry[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!isRecord(parsed)) continue;

      const id = pickSessionIdFromRecord(parsed);
      if (!id) continue;

      const storageState = fileMap.get(id);
      let storage: HistoryEntry['storage'] = 'index_only';
      if (storageState?.active) {
        storage = 'sessions';
      } else if (storageState?.archived) {
        storage = 'archived_sessions';
      }

      const threadNameRaw = parsed.thread_name ?? parsed.threadName ?? parsed.name;
      const updatedAtRaw = parsed.updated_at ?? parsed.updatedAt ?? parsed.timestamp ?? parsed.ts;
      const updatedAt =
        typeof updatedAtRaw === 'number'
          ? new Date(updatedAtRaw < 1e12 ? updatedAtRaw * 1000 : updatedAtRaw).toISOString()
          : typeof updatedAtRaw === 'string'
            ? updatedAtRaw.trim()
            : '';

      allItems.push({
        id,
        threadName: typeof threadNameRaw === 'string' && threadNameRaw.trim() ? threadNameRaw.trim() : '(未命名会话)',
        updatedAt: updatedAt || '-',
        storage
      });
    } catch {
      // 忽略损坏行，避免单行异常阻断整个列表读取
    }
  }

  allItems.sort((a, b) => safeDateValue(b.updatedAt) - safeDateValue(a.updatedAt));
  return {
    total: allItems.length,
    items: allItems.slice(0, limit)
  };
}

function removeLineBySessionId(filePath: string, sessionId: string): number {
  if (!fs.existsSync(filePath)) return 0;

  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  const kept: string[] = [];
  let removed = 0;
  const expected = sessionId.toLowerCase();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const currentId = extractSessionIdFromLine(trimmed);
    if (!currentId) {
      kept.push(line);
      continue;
    }

    if (currentId === expected) {
      removed += 1;
      continue;
    }

    kept.push(line);
  }

  const payload = kept.length > 0 ? `${kept.join('\n')}\n` : '';
  fs.writeFileSync(filePath, payload, 'utf8');
  return removed;
}

function deleteHistoryOne(sessionId: string): DeleteHistoryOneResult {
  const normalizedId = sessionId.trim().toLowerCase();
  if (!normalizedId) {
    throw new Error('会话 ID 不能为空');
  }

  const actions: string[] = [];
  const errors: string[] = [];

  const indexPath = path.join(BASE_DIR, 'session_index.jsonl');
  const historyPath = path.join(BASE_DIR, 'history.jsonl');
  try {
    const removed = removeLineBySessionId(indexPath, normalizedId);
    actions.push(removed > 0 ? `已移除索引记录: ${removed} 条` : '索引中未找到该会话');
  } catch (err) {
    errors.push(`处理 session_index.jsonl 失败: ${(err as Error).message}`);
  }

  try {
    const removed = removeLineBySessionId(historyPath, normalizedId);
    actions.push(removed > 0 ? `已移除历史记录: ${removed} 条` : 'history.jsonl 中未找到该会话');
  } catch (err) {
    errors.push(`处理 history.jsonl 失败: ${(err as Error).message}`);
  }

  const filesToDelete = [
    ...walkFiles(path.join(BASE_DIR, 'sessions')),
    ...walkFiles(path.join(BASE_DIR, 'archived_sessions'))
  ].filter((filePath) => extractSessionId(filePath) === normalizedId);

  if (filesToDelete.length === 0) {
    actions.push('未找到对应会话文件');
    return { actions, errors };
  }

  for (const filePath of filesToDelete) {
    try {
      fs.rmSync(filePath, { force: true });
      actions.push(`已删除文件: ${path.relative(BASE_DIR, filePath)}`);
    } catch (err) {
      errors.push(`删除文件失败(${filePath}): ${(err as Error).message}`);
    }
  }

  return { actions, errors };
}

type PageSnapshot = {
  onLogin: boolean;
  totalQuota: string;
  monthQuota: string;
  username: string;
};

type CapturedApiResponse = {
  url: string;
  status: number;
  body: string;
};

async function readDashboardSnapshot(win: BrowserWindow): Promise<PageSnapshot> {
  return win.webContents.executeJavaScript(`(() => {
    const text = (document.body?.innerText || '').replace(/\\u00a0/g, ' ');

    const toNumber = (value) => {
      const n = Number(String(value || '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : NaN;
    };

    const pickBest = (patterns) => {
      const candidates = [];
      for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
          const raw = (match && match[1] ? String(match[1]) : '').trim();
          if (!raw) continue;
          const numberValue = toNumber(raw);
          if (Number.isNaN(numberValue)) continue;
          candidates.push({ raw, numberValue });
        }
      }

      if (candidates.length === 0) return '';

      const nonZero = candidates.filter((item) => item.numberValue > 0);
      const pool = nonZero.length > 0 ? nonZero : candidates;
      pool.sort((a, b) => b.numberValue - a.numberValue);
      return pool[0] ? pool[0].raw : '';
    };

    const totalQuota = pickBest([
      /按量(?:剩余)?(?:额度|余额)\\s*[:：]?\\s*([\\d,\\.]+)/g,
      /(?:pay\\s*as\\s*you\\s*go|total\\s*quota|available\\s*quota)\\s*[:：]?\\s*([\\d,\\.]+)/gi
    ]);

    const monthQuota = pickBest([
      /月卡(?:剩余)?(?:额度|余额)\\s*[:：]?\\s*([\\d,\\.]+)/g,
      /(?:monthly|month\\s*card|plan)\\s*(?:quota|balance|remaining)?\\s*[:：]?\\s*([\\d,\\.]+)/gi
    ]);

    const userMatch = text.match(/欢迎回来[，,]\\s*([^\\n]+)/);

    const onLogin = /登录账户/.test(text) || !!document.querySelector('input[placeholder*="邮箱"], input[type="password"]');

    return {
      onLogin,
      totalQuota,
      monthQuota,
      username: userMatch ? userMatch[1].trim() : ''
    };
  })()`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: string): Promise<T> {
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    setTimeout(() => reject(new Error(timeoutError)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

async function waitForDashboardQuota(win: BrowserWindow, waitMs = 5000, intervalMs = 500): Promise<PageSnapshot> {
  let elapsed = 0;
  let latest = await readDashboardSnapshot(win);

  while (elapsed < waitMs) {
    const totalReady = !!latest.totalQuota && latest.totalQuota !== '0';
    const monthReady = !!latest.monthQuota && latest.monthQuota !== '0';
    if (latest.onLogin || totalReady || monthReady) return latest;
    await delay(intervalMs);
    elapsed += intervalMs;
    latest = await readDashboardSnapshot(win);
  }

  return latest;
}

async function loadUrlWithTimeout(win: BrowserWindow, url: string, timeoutMs: number): Promise<{ timedOut: boolean; error?: string }> {
  const loadPromise = win
    .loadURL(url)
    .then(() => ({ timedOut: false }))
    .catch((err: unknown) => ({ timedOut: false, error: (err as Error).message }));

  const timeoutPromise = new Promise<{ timedOut: boolean }>((resolve) => {
    setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });

  return Promise.race([loadPromise, timeoutPromise]);
}

function getFoxcodeSession() {
  return session.fromPartition(FOXCODE_PARTITION);
}

function hasFoxcodeAuthCookie(cookies: Electron.Cookie[]): boolean {
  const names = new Set(cookies.map((cookie) => cookie.name.toLowerCase()));
  return names.has('__cookie_session__') || names.has('auth_user');
}

async function readFoxcodeLoginState(): Promise<FoxcodeLoginState> {
  const cookies = await getFoxcodeSession().cookies.get({ url: FOXCODE_DASHBOARD_URL });
  const hasCookie = cookies.length > 0;
  const isAuthenticated = hasFoxcodeAuthCookie(cookies);
  return {
    hasCookie,
    isAuthenticated,
    cookieCount: cookies.length,
    message: isAuthenticated
      ? `已登录（Cookie ${cookies.length} 个）`
      : hasCookie
        ? `检测到 ${cookies.length} 个 Cookie，但未识别到有效登录态`
        : '未检测到登录 Cookie，请先登录'
  };
}

let foxcodeLoginWindow: BrowserWindow | null = null;

async function openFoxcodeLoginWindow(): Promise<FoxcodeOpenLoginResult> {
  if (foxcodeLoginWindow && !foxcodeLoginWindow.isDestroyed()) {
    foxcodeLoginWindow.focus();
    return {
      opened: true,
      message: '登录窗口已在前台，请在该窗口完成登录。'
    };
  }

  foxcodeLoginWindow = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    autoHideMenuBar: true,
    title: 'FoxCode 登录',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: FOXCODE_PARTITION
    }
  });

  foxcodeLoginWindow.on('closed', () => {
    foxcodeLoginWindow = null;
  });

  const loginLoad = await loadUrlWithTimeout(foxcodeLoginWindow, FOXCODE_LOGIN_URL, 12000);
  if (loginLoad.error) {
    return {
      opened: true,
      message: `登录页打开异常：${loginLoad.error}。已尝试打开窗口，请手动刷新该窗口。`
    };
  }

  if (loginLoad.timedOut) {
    return {
      opened: true,
      message: '登录页加载超时，但窗口已打开。请在该窗口等待页面加载后完成登录。'
    };
  }

  return {
    opened: true,
    message: '已打开登录页，请完成登录后回到 codex channel 点击“获取额度”。'
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeQuotaValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^-?\d[\d,]*(\.\d+)?$/.test(trimmed)) return trimmed;
  }

  return null;
}

type QuotaCandidate = {
  value: string;
  score: number;
};

function pickBestQuotaCandidate(current: QuotaCandidate | null, key: string, value: unknown, scope: 'month' | 'total'): QuotaCandidate | null {
  const normalized = normalizeQuotaValue(value);
  if (!normalized) return current;

  const isMonthKey = /(month|monthly|month[_-]?quota|card|package|plan|月卡|月度|月额度)/i.test(key);
  const hasNegativeSignal = /(used|usage|consume|spent|cost|deduct|已用|消耗|消费)/i.test(key);
  if (hasNegativeSignal) return current;

  const positiveMonth = /(month.*(remaining|available|balance)|monthly.*(remaining|available|balance)|month[_-]?card.*(remaining|available|balance)|月卡.*(剩余|余额|额度)|月度.*(剩余|余额|额度))/i;
  const positiveTotal = /(remaining|available|balance|left|credit|quota_remaining|quota_balance|按量.*(剩余|余额|额度)|可用额度)/i;

  let score = 0;
  if (scope === 'month') {
    if (positiveMonth.test(key)) score += 80;
    else if (isMonthKey) score += 30;
    if (/total|overall|按量/.test(key)) score -= 10;
  } else {
    if (!isMonthKey && positiveTotal.test(key)) score += 80;
    else if (!isMonthKey && /(total|quota|credit|按量|额度|剩余)/i.test(key)) score += 30;
    if (isMonthKey) score -= 20;
  }

  if (!current || score > current.score) {
    return { value: normalized, score };
  }

  return current;
}

function findQuotaFromJson(payload: unknown): FoxcodeQuotaData | null {
  const queue: unknown[] = [payload];
  const userKey = /(user(name)?|nick(name)?|account|email|name)/i;
  const monthKey = /(month|monthly|month[_-]?quota|card|package|plan|月卡|月度|月额度)/i;
  const totalKey = /(total|quota|balance|credit|remaining|available|按量|额度|剩余)/i;

  while (queue.length > 0) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    if (!isRecord(current)) continue;

    let totalQuota: QuotaCandidate | null = null;
    let monthQuota: QuotaCandidate | null = null;
    let username: string | null = null;

    for (const [key, value] of Object.entries(current)) {
      if (typeof value === 'object' && value !== null) {
        queue.push(value);
      }

      if (monthKey.test(key)) {
        monthQuota = pickBestQuotaCandidate(monthQuota, key, value, 'month');
        continue;
      }

      if (totalKey.test(key) && !monthKey.test(key)) {
        totalQuota = pickBestQuotaCandidate(totalQuota, key, value, 'total');
        continue;
      }

      if (!username && userKey.test(key) && typeof value === 'string' && value.trim()) {
        username = value.trim();
      }
    }

    if (totalQuota || monthQuota) {
      return {
        totalQuota: totalQuota?.value ?? '0',
        monthQuota: monthQuota?.value ?? '0',
        username: username ?? '-'
      };
    }
  }

  return null;
}

function parseJsonSafe(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseQuotaNumber(text: string): number {
  const value = Number(text.replace(/,/g, ''));
  return Number.isFinite(value) ? value : 0;
}

function scoreQuotaResponse(url: string, data: FoxcodeQuotaData): number {
  let score = 0;
  if (/(quota|balance|credit|billing|account|dashboard)/i.test(url)) score += 20;
  if (/(remaining|available|left)/i.test(url)) score += 40;
  if (/(usage|used|consume|cost|stat)/i.test(url)) score -= 20;

  const totalValue = parseQuotaNumber(data.totalQuota);
  const monthValue = parseQuotaNumber(data.monthQuota);
  if (totalValue > 0) score += 15;
  if (monthValue > 0) score += 10;
  if (totalValue === 0 && monthValue === 0) score -= 5;

  return score;
}

function parseQuotaFromApiResponses(responses: CapturedApiResponse[]): { data: FoxcodeQuotaData; apiEndpoint: string } | null {
  let best: { data: FoxcodeQuotaData; apiEndpoint: string; score: number } | null = null;

  for (const response of responses) {
    if (response.status < 200 || response.status >= 400) continue;
    const parsed = parseJsonSafe(response.body);
    if (parsed === null) continue;
    const data = findQuotaFromJson(parsed);
    if (data) {
      const score = scoreQuotaResponse(response.url, data);
      if (!best || score > best.score) {
        best = {
          data,
          apiEndpoint: response.url,
          score
        };
      }
    }
  }

  if (best) {
    return {
      data: best.data,
      apiEndpoint: best.apiEndpoint
    };
  }

  return null;
}

async function captureApiResponses(win: BrowserWindow): Promise<CapturedApiResponse[]> {
  const debug = win.webContents.debugger;
  const pending = new Map<string, { url: string; status: number }>();
  const responses: CapturedApiResponse[] = [];

  const onMessage = async (_event: unknown, method: string, rawParams: Record<string, unknown>) => {
    if (method === 'Network.responseReceived') {
      const requestId = String(rawParams.requestId ?? '');
      if (!requestId) return;

      const response = (rawParams.response ?? {}) as Record<string, unknown>;
      const url = String(response.url ?? '');
      const status = Number(response.status ?? 0);
      const resourceType = String(rawParams.type ?? '');

      if (!url.includes('foxcode.rjj.cc')) return;
      if (resourceType !== 'XHR' && resourceType !== 'Fetch') return;

      pending.set(requestId, { url, status });
      return;
    }

    if (method === 'Network.loadingFinished') {
      const requestId = String(rawParams.requestId ?? '');
      if (!requestId) return;

      const meta = pending.get(requestId);
      if (!meta) return;
      pending.delete(requestId);

      try {
        const bodyRet = (await debug.sendCommand('Network.getResponseBody', { requestId })) as {
          body?: string;
          base64Encoded?: boolean;
        };

        const rawBody = String(bodyRet.body ?? '');
        const bodyText = bodyRet.base64Encoded ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody;

        responses.push({
          url: meta.url,
          status: meta.status,
          body: bodyText
        });
      } catch {
        // 忽略无法读取 body 的请求，继续处理其他请求
      }
    }
  };

  try {
    if (!debug.isAttached()) debug.attach('1.3');
    debug.on('message', onMessage);
    await debug.sendCommand('Network.enable');
    const loadResult = await loadUrlWithTimeout(win, FOXCODE_DASHBOARD_URL, 9000);
    if (loadResult.error) {
      throw new Error(`dashboard 加载失败: ${loadResult.error}`);
    }

    // 即使超时也继续读取已捕获网络数据，避免界面长时间卡住
    await delay(loadResult.timedOut ? 400 : 1000);
  } finally {
    debug.removeListener('message', onMessage);
    try {
      if (debug.isAttached()) {
        await debug.sendCommand('Network.disable');
        debug.detach();
      }
    } catch {
      // 忽略调试协议释放异常
    }
  }

  return responses;
}

async function fetchFoxcodeQuota(): Promise<FoxcodeQuotaResult> {
  const loginState = await readFoxcodeLoginState();
  if (!loginState.isAuthenticated) {
    return {
      ok: false,
      requiresLogin: true,
      hasCookie: loginState.hasCookie,
      message: '未检测到有效登录态，请点击“打开登录页”重新登录后再获取额度。'
    };
  }

  const hiddenWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: FOXCODE_PARTITION
    }
  });

  try {
    const quickLoad = await loadUrlWithTimeout(hiddenWindow, FOXCODE_DASHBOARD_URL, 7000);
    if (quickLoad.error) {
      throw new Error(`dashboard 快速加载失败: ${quickLoad.error}`);
    }

    const shot = await waitForDashboardQuota(hiddenWindow, 3500, 350);
    if (shot.onLogin) {
      return {
        ok: false,
        requiresLogin: true,
        hasCookie: true,
        message: 'Cookie 已失效或登录态过期，请重新登录后再获取额度。'
      };
    }

    if (shot.totalQuota && shot.totalQuota !== '0') {
      return {
        ok: true,
        requiresLogin: false,
        hasCookie: true,
        message: '未捕获到可用额度接口，已通过 Cookie 访问 dashboard 并解析额度。',
        data: {
          totalQuota: shot.totalQuota,
          monthQuota: shot.monthQuota || '0',
          username: shot.username || '-'
        }
      };
    }

    const responses = await withTimeout(
      captureApiResponses(hiddenWindow),
      7000,
      '额度接口抓取超时'
    );
    const parsedByApi = parseQuotaFromApiResponses(responses);
    if (parsedByApi) {
      return {
        ok: true,
        requiresLogin: false,
        hasCookie: true,
        message: '已通过登录 Cookie 拉取额度接口并更新数据。',
        apiEndpoint: parsedByApi.apiEndpoint,
        data: parsedByApi.data
      };
    }

    if (shot.totalQuota) {
      return {
        ok: true,
        requiresLogin: false,
        hasCookie: true,
        message: '额度接口未命中，已回退到 dashboard 文本解析结果。',
        data: {
          totalQuota: shot.totalQuota,
          monthQuota: shot.monthQuota || '0',
          username: shot.username || '-'
        }
      };
    }

    return {
      ok: false,
      requiresLogin: false,
      hasCookie: true,
      message: '已登录但未获取到额度数据，请刷新页面后重试。'
    };
  } catch (err) {
    return {
      ok: false,
      requiresLogin: false,
      hasCookie: true,
      message: `读取额度失败: ${(err as Error).message}`
    };
  } finally {
    if (!hiddenWindow.isDestroyed()) {
      hiddenWindow.destroy();
    }
  }
}

let windowRef: BrowserWindow | null = null;

function createWindow(): void {
  windowRef = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 820,
    minHeight: 620,
    backgroundColor: '#0d1016',
    title: APP_WINDOW_TITLE,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
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

ipcMain.handle('history:list', async (): Promise<HistoryListResult> => listHistory());

ipcMain.handle('history:delete-one', async (_event, sessionId: string): Promise<DeleteHistoryOneResult> => {
  return deleteHistoryOne(sessionId);
});

ipcMain.handle('foxcode:open-login', async (): Promise<FoxcodeOpenLoginResult> => openFoxcodeLoginWindow());

ipcMain.handle('foxcode:login-state', async (): Promise<FoxcodeLoginState> => readFoxcodeLoginState());

ipcMain.handle('foxcode:fetch-quota', async (): Promise<FoxcodeQuotaResult> => fetchFoxcodeQuota());

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
