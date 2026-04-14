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

type FoxCodeQuotaData = {
  totalQuota: string;
  monthQuota: string;
  username: string;
};

type FoxCodeQuotaResult = {
  ok: boolean;
  requiresLogin: boolean;
  hasCookie: boolean;
  message: string;
  apiEndpoint?: string;
  data?: FoxCodeQuotaData;
};

type FoxCodeStatusData = {
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

type FoxCodeStatusResult = {
  ok: boolean;
  message: string;
  data?: FoxCodeStatusData;
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
const STATE_DB_PATH = path.join(BASE_DIR, 'state_5.sqlite');

const APP_WINDOW_TITLE = 'Codex Channel';

const FOXCODE_PARTITION = 'persist:foxcode-auth';
const FOXCODE_LOGIN_URL = 'https://foxcode.rjj.cc/auth/login';
const FOXCODE_DASHBOARD_URL = 'https://foxcode.rjj.cc/dashboard';
const FOXCODE_STATUS_PAGE_API = 'https://status.rjj.cc/api/status-page/foxcode';
const FOXCODE_STATUS_HEARTBEAT_API = 'https://status.rjj.cc/api/status-page/heartbeat/foxcode';

function readBufferSafe(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function readTextSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function normalizeConfigForChannelCompare(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  let skippingProjectsSection = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, '');
    const trimmed = line.trim();
    const isTable = /^\s*\[[^\]]+\]\s*$/.test(trimmed);

    if (/^\s*\[projects\.".*"\]\s*$/.test(trimmed)) {
      skippingProjectsSection = true;
      continue;
    }

    if (isTable && skippingProjectsSection) {
      skippingProjectsSection = false;
    }

    if (skippingProjectsSection) continue;
    kept.push(line);
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sameFile(a: string, b: string): boolean {
  const aBuffer = readBufferSafe(a);
  const bBuffer = readBufferSafe(b);
  return !!aBuffer && !!bBuffer && aBuffer.equals(bBuffer);
}

function sameConfigFile(a: string, b: string): boolean {
  if (sameFile(a, b)) return true;

  const aText = readTextSafe(a);
  const bText = readTextSafe(b);
  if (aText === null || bText === null) return false;

  return normalizeConfigForChannelCompare(aText) === normalizeConfigForChannelCompare(bText);
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

  if (sameConfigFile(CONFIG_TARGET, CHANNEL_FILES.default.config)) configMatch = 'default';
  if (sameConfigFile(CONFIG_TARGET, CHANNEL_FILES.fox.config)) configMatch = 'fox';

  if (sameFile(AUTH_TARGET, CHANNEL_FILES.default.auth)) authMatch = 'default';
  if (sameFile(AUTH_TARGET, CHANNEL_FILES.fox.auth)) authMatch = 'fox';

  const current: ChannelState['current'] =
    configMatch === authMatch && configMatch !== 'unknown' ? configMatch : 'mixed';

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

  for (const filePath of HISTORY_FILES) {
    const fileName = path.basename(filePath);
    try {
      ensureDir(path.dirname(filePath));
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
      ensureDir(dirPath);
      clearDirContent(dirPath);
      actions.push(`已清空目录: ${dirName}`);
    } catch (err) {
      errors.push(`处理目录失败(${dirName}): ${(err as Error).message}`);
    }
  }

  try {
    const archivedCount = archiveAllSqliteThreads();
    actions.push(archivedCount > 0 ? `已归档本地状态线程: ${archivedCount} 条` : '本地状态线程无需归档');
  } catch (err) {
    errors.push(`处理本地状态线程失败: ${(err as Error).message}`);
  }

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

function epochToIso(value: unknown): string {
  const n = toFiniteNumber(value);
  if (n === null) return '-';
  const ms = n < 1e12 ? n * 1000 : n;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? '-' : date.toISOString();
}

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function readActiveThreadsFromStateSqlite(limit: number): HistoryEntry[] {
  if (!fs.existsSync(STATE_DB_PATH)) return [];

  const safeLimit = Math.max(1, Math.min(limit, 2000));
  const query = [
    'SELECT id, title, updated_at, archived',
    'FROM threads',
    'WHERE archived = 0',
    'ORDER BY updated_at DESC',
    `LIMIT ${safeLimit};`
  ].join(' ');

  const result = runCmd('/usr/bin/sqlite3', ['-json', STATE_DB_PATH, query]);
  if (result.status !== 0) return [];

  const text = String(result.stdout ?? '').trim();
  if (!text) return [];

  let rows: unknown;
  try {
    rows = JSON.parse(text);
  } catch {
    return [];
  }

  if (!Array.isArray(rows)) return [];

  const items: HistoryEntry[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = normalizeSessionId(row.id);
    if (!id) continue;

    const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : '(未命名会话)';
    const updatedAt = epochToIso(row.updated_at);
    items.push({
      id,
      threadName: title,
      updatedAt,
      storage: 'state_sqlite'
    });
  }

  return items;
}

function archiveSqliteThread(sessionId: string): number {
  if (!fs.existsSync(STATE_DB_PATH)) return 0;
  const safeId = sqlQuote(sessionId);
  const updateSql = [
    'UPDATE threads',
    "SET archived = 1, archived_at = CAST(strftime('%s','now') AS INTEGER)",
    `WHERE id = ${safeId} AND archived = 0;`
  ].join(' ');
  const result = runCmd('/usr/bin/sqlite3', [STATE_DB_PATH, updateSql]);
  if (result.status !== 0) return 0;
  return readSqliteChanges();
}

function archiveAllSqliteThreads(): number {
  if (!fs.existsSync(STATE_DB_PATH)) return 0;
  const updateSql = [
    'UPDATE threads',
    "SET archived = 1, archived_at = CAST(strftime('%s','now') AS INTEGER)",
    'WHERE archived = 0;'
  ].join(' ');
  const result = runCmd('/usr/bin/sqlite3', [STATE_DB_PATH, updateSql]);
  if (result.status !== 0) return 0;
  return readSqliteChanges();
}

function readSqliteChanges(): number {
  const changes = runCmd('/usr/bin/sqlite3', [STATE_DB_PATH, 'SELECT changes();']);
  if (changes.status !== 0) return 0;
  const value = Number(String(changes.stdout ?? '').trim());
  return Number.isFinite(value) ? value : 0;
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

  const allItemsMap = new Map<string, HistoryEntry>();
  const upsert = (item: HistoryEntry): void => {
    const existing = allItemsMap.get(item.id);
    if (!existing) {
      allItemsMap.set(item.id, item);
      return;
    }

    const nextDate = safeDateValue(item.updatedAt);
    const prevDate = safeDateValue(existing.updatedAt);
    const nextNameBetter = item.threadName && item.threadName !== '(未命名会话)' && existing.threadName === '(未命名会话)';

    if (nextDate > prevDate || nextNameBetter) {
      allItemsMap.set(item.id, {
        ...existing,
        threadName: item.threadName,
        updatedAt: item.updatedAt,
        storage: existing.storage === 'state_sqlite' ? item.storage : existing.storage
      });
      return;
    }

    if (existing.storage === 'index_only' && item.storage !== 'index_only') {
      allItemsMap.set(item.id, { ...existing, storage: item.storage });
    }
  };

  const sqliteItems = readActiveThreadsFromStateSqlite(Math.max(limit * 3, 240)).map((item) => {
    const storageState = fileMap.get(item.id);
    if (storageState?.active) return { ...item, storage: 'sessions' as const };
    if (storageState?.archived) return { ...item, storage: 'archived_sessions' as const };
    return item;
  });
  for (const item of sqliteItems) upsert(item);

  if (fs.existsSync(indexPath)) {
    const raw = fs.readFileSync(indexPath, 'utf8');
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

        upsert({
          id,
          threadName: typeof threadNameRaw === 'string' && threadNameRaw.trim() ? threadNameRaw.trim() : '(未命名会话)',
          updatedAt: updatedAt || '-',
          storage
        });
      } catch {
        // 忽略损坏行，避免单行异常阻断整个列表读取
      }
    }
  }

  const allItems = Array.from(allItemsMap.values());
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
  } else {
    for (const filePath of filesToDelete) {
      try {
        fs.rmSync(filePath, { force: true });
        actions.push(`已删除文件: ${path.relative(BASE_DIR, filePath)}`);
      } catch (err) {
        errors.push(`删除文件失败(${filePath}): ${(err as Error).message}`);
      }
    }
  }

  try {
    const archived = archiveSqliteThread(normalizedId);
    actions.push(archived > 0 ? '已归档本地状态线程' : '本地状态线程中未找到该会话或已归档');
  } catch (err) {
    errors.push(`处理本地状态线程失败: ${(err as Error).message}`);
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
  // 仪表盘 DOM 缺少稳定契约，按“关键词 + 数值”启发式提取；优先取 >0 的最大值，避免误拿到已用额度。
  return win.webContents.executeJavaScript(`(() => {
    const text = (document.body?.innerText || '').replace(/\\u00a0/g, ' ');
    const loginSelector = 'input[placeholder*="邮箱"], input[type="password"]';

    const toNumber = (value) => {
      const n = Number(String(value || '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : NaN;
    };

    const pickBest = (patterns) => {
      let positiveBestRaw = '';
      let positiveBestValue = Number.NEGATIVE_INFINITY;
      let fallbackBestRaw = '';
      let fallbackBestValue = Number.NEGATIVE_INFINITY;

      for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
          const raw = String(match[1] ?? '').trim();
          if (!raw) continue;
          const numberValue = toNumber(raw);
          if (Number.isNaN(numberValue)) continue;

          if (numberValue > fallbackBestValue) {
            fallbackBestValue = numberValue;
            fallbackBestRaw = raw;
          }

          if (numberValue > 0 && numberValue > positiveBestValue) {
            positiveBestValue = numberValue;
            positiveBestRaw = raw;
          }
        }
      }
      return positiveBestRaw || fallbackBestRaw;
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

    const onLogin = /登录账户/.test(text) || !!document.querySelector(loginSelector);

    return {
      onLogin,
      totalQuota,
      monthQuota,
      username: userMatch?.[1]?.trim() ?? ''
    };
  })()`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutError)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchJsonPayload(url: string): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function findFoxCodexMonitor(payload: unknown): { id: number; name: string; groupName: string } | null {
  if (!isRecord(payload)) return null;
  const groupList = payload.publicGroupList;
  if (!Array.isArray(groupList)) return null;

  type MonitorCandidate = {
    id: number;
    name: string;
    groupName: string;
    groupNameLower: string;
    monitorNameLower: string;
  };
  const candidates: MonitorCandidate[] = [];

  for (const group of groupList) {
    if (!isRecord(group)) continue;
    const rawGroupName = typeof group.name === 'string' ? group.name.trim() : '';
    const groupNameLower = rawGroupName.toLowerCase();
    const monitorList = group.monitorList;
    if (!Array.isArray(monitorList)) continue;

    for (const monitor of monitorList) {
      if (!isRecord(monitor)) continue;
      const monitorName = typeof monitor.name === 'string' ? monitor.name.trim() : '';
      if (!monitorName) continue;
      const monitorNameLower = monitorName.toLowerCase();

      const idNumber = toFiniteNumber(monitor.id);
      if (idNumber === null) continue;

      const relatedToCodex = groupNameLower.includes('codex') || monitorNameLower.includes('codex');
      if (!relatedToCodex) continue;

      candidates.push({
        id: idNumber,
        name: monitorName,
        groupName: rawGroupName || 'Codex 分组',
        groupNameLower,
        monitorNameLower
      });
    }
  }

  if (candidates.length === 0) return null;

  const preferred =
    candidates.find((item) => item.groupNameLower === 'codex 分组' && item.monitorNameLower === 'codex 官方线路') ??
    candidates.find((item) => item.groupNameLower === 'codex 分组' && item.monitorNameLower.includes('codex')) ??
    candidates.find((item) => item.groupNameLower.includes('codex') && item.monitorNameLower.includes('codex')) ??
    candidates[0];

  return preferred ?? null;
}

function parseFoxCodexHeartbeat(
  payload: unknown,
  monitorId: number
): Pick<FoxCodeStatusData, 'uptime24h' | 'latestStatus' | 'latestCheckedAt' | 'heartbeatPoints' | 'heartbeatWindowLabel'> {
  // 状态页返回结构并非强契约：任何关键层级缺失都回退为“未知占位”，避免单字段异常拖垮整卡片渲染。
  const MAX_HEARTBEAT_POINTS = 60;
  const MAX_HEARTBEAT_WINDOW_MINUTES = 5 * 60;
  let uptime24h: number | null = null;
  let latestStatus: FoxCodeStatusData['latestStatus'] = 'unknown';
  let latestCheckedAt = '-';
  let heartbeatPoints: FoxCodeStatusData['heartbeatPoints'] = [];
  let heartbeatWindowLabel = '-';
  const fallback = (): Pick<
    FoxCodeStatusData,
    'uptime24h' | 'latestStatus' | 'latestCheckedAt' | 'heartbeatPoints' | 'heartbeatWindowLabel'
  > => ({ uptime24h, latestStatus, latestCheckedAt, heartbeatPoints, heartbeatWindowLabel });

  if (!isRecord(payload)) {
    return fallback();
  }

  const uptimeListRaw = payload.uptimeList;
  if (isRecord(uptimeListRaw)) {
    const uptimeKey = `${monitorId}_24`;
    const uptimeValue = toFiniteNumber(uptimeListRaw[uptimeKey]);
    if (uptimeValue !== null) {
      uptime24h = Math.max(0, Math.min(1, uptimeValue));
    }
  }

  const heartbeatListRaw = payload.heartbeatList;
  if (!isRecord(heartbeatListRaw)) {
    return fallback();
  }

  const heartbeatRows = heartbeatListRaw[String(monitorId)];
  if (!Array.isArray(heartbeatRows)) {
    return fallback();
  }

  const normalizedRows = heartbeatRows.filter((row): row is Record<string, unknown> => isRecord(row));
  if (normalizedRows.length === 0) {
    return fallback();
  }

  // 与状态页保持一致：最多展示最近 5h 的点位（60 个），避免为铺满容器扩张时间窗口。
  const displayRows = normalizedRows.slice(-MAX_HEARTBEAT_POINTS);

  heartbeatPoints = displayRows.map((row) => {
    const statusValue = toFiniteNumber(row.status);
    const timeValue = typeof row.time === 'string' && row.time.trim() ? row.time.trim() : '-';
    if (statusValue === 1) return { status: 1, time: timeValue };
    if (statusValue === 0) return { status: 0, time: timeValue };
    return { status: -1, time: timeValue };
  });

  const latestRow = displayRows[displayRows.length - 1];
  const latestCheckedAtRaw = typeof latestRow?.time === 'string' ? latestRow.time.trim() : '';
  latestCheckedAt = latestCheckedAtRaw || '-';

  const latestStatusValue = toFiniteNumber(latestRow?.status);
  if (latestStatusValue === 1) latestStatus = 'up';
  else if (latestStatusValue === 0) latestStatus = 'down';

  const firstTimestamp = Date.parse(String(displayRows[0]?.time ?? ''));
  const lastTimestamp = Date.parse(String(displayRows[displayRows.length - 1]?.time ?? ''));

  let windowMinutes = 0;
  if (!Number.isNaN(firstTimestamp) && !Number.isNaN(lastTimestamp) && lastTimestamp >= firstTimestamp) {
    windowMinutes = Math.max(1, Math.round((lastTimestamp - firstTimestamp) / 60000));
  } else if (displayRows.length >= 2) {
    const prevTimestamp = Date.parse(String(displayRows[displayRows.length - 2]?.time ?? ''));
    if (!Number.isNaN(lastTimestamp) && !Number.isNaN(prevTimestamp)) {
      const intervalMinutes = Math.max(1, Math.round(Math.abs(lastTimestamp - prevTimestamp) / 60000));
      windowMinutes = intervalMinutes * heartbeatPoints.length;
    }
  }

  if (windowMinutes === 0) {
    windowMinutes = heartbeatPoints.length * 5;
  }

  windowMinutes = Math.min(windowMinutes, MAX_HEARTBEAT_WINDOW_MINUTES);

  const isFullFiveHourWindow = displayRows.length >= MAX_HEARTBEAT_POINTS;
  if (isFullFiveHourWindow) {
    heartbeatWindowLabel = '5h';
  } else if (windowMinutes >= 60) {
    const hours = windowMinutes / 60;
    heartbeatWindowLabel = Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
  } else {
    heartbeatWindowLabel = `${windowMinutes}m`;
  }

  return { uptime24h, latestStatus, latestCheckedAt, heartbeatPoints, heartbeatWindowLabel };
}

async function fetchFoxCodeStatus(): Promise<FoxCodeStatusResult> {
  try {
    const [statusPagePayload, heartbeatPayload] = await Promise.all([
      withTimeout(fetchJsonPayload(FOXCODE_STATUS_PAGE_API), 8000, 'FoxCode 状态页请求超时'),
      withTimeout(fetchJsonPayload(FOXCODE_STATUS_HEARTBEAT_API), 8000, 'FoxCode 心跳数据请求超时')
    ]);

    const monitor = findFoxCodexMonitor(statusPagePayload);
    if (!monitor) {
      return {
        ok: false,
        message: '未在 FoxCode 状态页中找到 Codex 分组监控。'
      };
    }

    const heartbeat = parseFoxCodexHeartbeat(heartbeatPayload, monitor.id);
    return {
      ok: true,
      message: 'FoxCodex 状态已更新。',
      data: {
        moduleName: 'FoxCode',
        submoduleName: 'FoxCodex 状态',
        groupName: monitor.groupName,
        monitorName: monitor.name,
        monitorId: monitor.id,
        uptime24h: heartbeat.uptime24h,
        latestStatus: heartbeat.latestStatus,
        latestCheckedAt: heartbeat.latestCheckedAt,
        heartbeatPoints: heartbeat.heartbeatPoints,
        heartbeatWindowLabel: heartbeat.heartbeatWindowLabel
      }
    };
  } catch {
    return {
      ok: false,
      message: '获取 FoxCodex 状态失败，请稍后重试。'
    };
  }
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

async function loadUrlWithTimeout(
  win: BrowserWindow,
  url: string,
  timeoutMs: number
): Promise<{ timedOut: boolean; error?: string }> {
  const loadPromise = win
    .loadURL(url)
    .then(() => ({ timedOut: false }))
    .catch((err: unknown) => ({ timedOut: false, error: (err as Error).message }));

  const timeoutPromise = new Promise<{ timedOut: boolean }>((resolve) => {
    setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });

  return Promise.race([loadPromise, timeoutPromise]);
}

function getFoxCodeSession() {
  return session.fromPartition(FOXCODE_PARTITION);
}

function hasFoxCodeAuthCookie(cookies: Electron.Cookie[]): boolean {
  const names = new Set(cookies.map((cookie) => cookie.name.toLowerCase()));
  return names.has('__cookie_session__') || names.has('auth_user') || names.has('auth_token');
}

async function readFoxCodeLoginState(): Promise<FoxCodeLoginState> {
  const cookies = await getFoxCodeSession().cookies.get({ url: FOXCODE_DASHBOARD_URL });
  const hasCookie = cookies.length > 0;
  const isAuthenticated = hasFoxCodeAuthCookie(cookies);
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

async function openFoxCodeLoginWindow(): Promise<FoxCodeOpenLoginResult> {
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
    message: '已打开登录页，请完成登录后回到 Codex Channel 点击“获取额度”。'
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

function pickBestQuotaCandidate(
  current: QuotaCandidate | null,
  key: string,
  value: unknown,
  scope: 'month' | 'total'
): QuotaCandidate | null {
  // 通过字段名语义评分筛选“剩余额度”，排除 used/consume 等消耗类字段，减少误判。
  const normalized = normalizeQuotaValue(value);
  if (!normalized) return current;

  const isMonthKey = /(month|monthly|month[_-]?quota|card|package|plan|月卡|月度|月额度)/i.test(key);
  const hasNegativeSignal = /(used|usage|consume|spent|cost|deduct|已用|消耗|消费)/i.test(key);
  if (hasNegativeSignal) return current;

  const positiveMonth =
    /(month.*(remaining|available|balance)|monthly.*(remaining|available|balance)|month[_-]?card.*(remaining|available|balance)|月卡.*(剩余|余额|额度)|月度.*(剩余|余额|额度))/i;
  const positiveTotal =
    /(remaining|available|balance|left|credit|quota_remaining|quota_balance|按量.*(剩余|余额|额度)|可用额度)/i;

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

function findQuotaFromJson(payload: unknown): FoxCodeQuotaData | null {
  // 采用广度优先扫描，尽量在外层对象先命中额度，避免深层统计字段覆盖更准确结果。
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

      const isMonthField = monthKey.test(key);
      if (isMonthField) {
        monthQuota = pickBestQuotaCandidate(monthQuota, key, value, 'month');
        continue;
      }

      if (totalKey.test(key)) {
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

function scoreQuotaResponse(url: string, data: FoxCodeQuotaData): number {
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

function parseQuotaFromApiResponses(
  responses: CapturedApiResponse[]
): { data: FoxCodeQuotaData; apiEndpoint: string } | null {
  // 多接口并行返回时，以“URL 语义 + 数值有效性”综合打分，优先取最可信的一条。
  let best: { data: FoxCodeQuotaData; apiEndpoint: string; score: number } | null = null;

  for (const response of responses) {
    if (response.status < 200 || response.status >= 400) continue;
    const parsed = parseJsonSafe(response.body);
    if (parsed === null) continue;
    const data = findQuotaFromJson(parsed);
    if (!data) continue;

    const score = scoreQuotaResponse(response.url, data);
    if (!best || score > best.score) {
      best = {
        data,
        apiEndpoint: response.url,
        score
      };
    }
  }

  return best ? { data: best.data, apiEndpoint: best.apiEndpoint } : null;
}

async function captureApiResponses(win: BrowserWindow): Promise<CapturedApiResponse[]> {
  // 仅监听 foxcode 域的 XHR/Fetch；读取 body 失败时跳过该请求，保证流程稳态返回。
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

function buildQuotaDataFromSnapshot(snapshot: PageSnapshot): FoxCodeQuotaData {
  return {
    totalQuota: snapshot.totalQuota || '0',
    monthQuota: snapshot.monthQuota || '0',
    username: snapshot.username || '-'
  };
}

function createQuotaSuccessResult(data: FoxCodeQuotaData, apiEndpoint?: string): FoxCodeQuotaResult {
  return {
    ok: true,
    requiresLogin: false,
    hasCookie: true,
    message: '额度已更新。',
    ...(apiEndpoint ? { apiEndpoint } : {}),
    data
  };
}

async function fetchFoxCodeQuota(): Promise<FoxCodeQuotaResult> {
  // 两阶段策略：先走页面快照拿“快路径”；若未拿到有效总额度，再降级抓接口并按评分择优。
  const loginState = await readFoxCodeLoginState();
  if (!loginState.isAuthenticated) {
    return {
      ok: false,
      requiresLogin: true,
      hasCookie: loginState.hasCookie,
      message: '请先完成登录后再获取额度。'
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
        message: '登录状态已失效，请重新登录后再获取额度。'
      };
    }

    if (shot.totalQuota && shot.totalQuota !== '0') {
      return createQuotaSuccessResult(buildQuotaDataFromSnapshot(shot));
    }

    const responses = await withTimeout(captureApiResponses(hiddenWindow), 7000, '额度接口抓取超时');
    const parsedByApi = parseQuotaFromApiResponses(responses);
    if (parsedByApi) {
      return createQuotaSuccessResult(parsedByApi.data, parsedByApi.apiEndpoint);
    }

    if (shot.totalQuota) {
      return createQuotaSuccessResult(buildQuotaDataFromSnapshot(shot));
    }

    return {
      ok: false,
      requiresLogin: false,
      hasCookie: true,
      message: '暂未获取到额度数据，请稍后重试。'
    };
  } catch {
    return {
      ok: false,
      requiresLogin: false,
      hasCookie: true,
      message: '获取额度失败，请稍后重试。'
    };
  } finally {
    if (!hiddenWindow.isDestroyed()) {
      hiddenWindow.destroy();
    }
  }
}

let windowRef: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
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

  const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererDevUrl) {
    await windowRef.loadURL(rendererDevUrl);
    return;
  }

  await windowRef.loadFile(path.join(__dirname, 'renderer', 'index.html'));
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

ipcMain.handle('foxcode:open-login', async (): Promise<FoxCodeOpenLoginResult> => openFoxCodeLoginWindow());

ipcMain.handle('foxcode:login-state', async (): Promise<FoxCodeLoginState> => readFoxCodeLoginState());

ipcMain.handle('foxcode:fetch-quota', async (): Promise<FoxCodeQuotaResult> => fetchFoxCodeQuota());

ipcMain.handle('foxcode:fetch-status', async (): Promise<FoxCodeStatusResult> => fetchFoxCodeStatus());

app.whenReady().then(() => {
  void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
