import { BrowserWindow, session } from 'electron';
import type { Cookie } from 'electron';

import {
  FOXCODE_DASHBOARD_URL,
  FOXCODE_LOGIN_URL,
  FOXCODE_PARTITION,
  FOXCODE_STATUS_HEARTBEAT_API,
  FOXCODE_STATUS_PAGE_API
} from '../constants';
import { delay, isRecord, toFiniteNumber, withTimeout } from '../utils';
import type {
  FoxCodeLoginState,
  FoxCodeOpenLoginResult,
  FoxCodeQuotaData,
  FoxCodeQuotaResult,
  FoxCodeStatusData,
  FoxCodeStatusResult
} from '../types';

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

type QuotaCandidate = {
  value: string;
  score: number;
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
  const inferIntervalMinutes = (rows: Array<Record<string, unknown>>): number | null => {
    if (rows.length < 2) return null;

    const diffs: number[] = [];
    for (let i = 1; i < rows.length; i += 1) {
      const prev = Date.parse(String(rows[i - 1]?.time ?? ''));
      const curr = Date.parse(String(rows[i]?.time ?? ''));
      if (Number.isNaN(prev) || Number.isNaN(curr) || curr <= prev) continue;
      const diffMinutes = (curr - prev) / 60000;
      if (diffMinutes > 0 && diffMinutes <= 60) {
        diffs.push(diffMinutes);
      }
    }

    if (diffs.length === 0) return null;
    diffs.sort((a, b) => a - b);
    const mid = Math.floor(diffs.length / 2);
    const midValue = diffs[mid];
    if (midValue === undefined) return null;
    const leftValue = diffs[mid - 1];
    const median =
      diffs.length % 2 === 0 && leftValue !== undefined ? (leftValue + midValue) / 2 : midValue;
    return Number.isFinite(median) ? median : null;
  };

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
  // Uptime Kuma 状态条语义更接近“采样窗口长度”（采样间隔 × 点数），而不是严格首尾差值。
  const inferredIntervalMinutes = inferIntervalMinutes(displayRows);
  if (inferredIntervalMinutes !== null && heartbeatPoints.length > 0) {
    windowMinutes = Math.max(1, Math.round(inferredIntervalMinutes * heartbeatPoints.length));
  } else if (!Number.isNaN(firstTimestamp) && !Number.isNaN(lastTimestamp) && lastTimestamp >= firstTimestamp) {
    windowMinutes = Math.max(1, Math.round((lastTimestamp - firstTimestamp) / 60000));
  }

  if (windowMinutes === 0) {
    windowMinutes = heartbeatPoints.length * 5;
  }

  windowMinutes = Math.min(windowMinutes, MAX_HEARTBEAT_WINDOW_MINUTES);

  if (windowMinutes >= 60) {
    const hours = windowMinutes / 60;
    const roundedHours = Math.round(hours);
    heartbeatWindowLabel = Math.abs(hours - roundedHours) < 0.05 ? `${roundedHours}h` : `${hours.toFixed(1)}h`;
  } else {
    heartbeatWindowLabel = `${windowMinutes}m`;
  }

  return { uptime24h, latestStatus, latestCheckedAt, heartbeatPoints, heartbeatWindowLabel };
}

export async function fetchFoxCodeStatus(): Promise<FoxCodeStatusResult> {
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

function hasFoxCodeAuthCookie(cookies: Cookie[]): boolean {
  const names = new Set(cookies.map((cookie) => cookie.name.toLowerCase()));
  return names.has('__cookie_session__') || names.has('auth_user') || names.has('auth_token');
}

export async function readFoxCodeLoginState(): Promise<FoxCodeLoginState> {
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

export async function openFoxCodeLoginWindow(): Promise<FoxCodeOpenLoginResult> {
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

export async function fetchFoxCodeQuota(): Promise<FoxCodeQuotaResult> {
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
