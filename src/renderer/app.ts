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

type CodexChannelAPI = {
  getState: () => Promise<ChannelState>;
  switchChannel: (channel: Channel) => Promise<SwitchResult>;
  clearHistory: () => Promise<ClearHistoryResult>;
  listHistory: () => Promise<HistoryListResult>;
  deleteHistoryOne: (sessionId: string) => Promise<DeleteHistoryOneResult>;
  openFoxcodeLogin: () => Promise<FoxcodeOpenLoginResult>;
  getFoxcodeLoginState: () => Promise<FoxcodeLoginState>;
  fetchFoxcodeQuota: () => Promise<FoxcodeQuotaResult>;
};

interface Window {
  codexChannelAPI: CodexChannelAPI;
}

const statusEl = document.getElementById('status') as HTMLDivElement;
const msgEl = document.getElementById('msg') as HTMLPreElement;
const errEl = document.getElementById('err') as HTMLPreElement;

const btnFox = document.getElementById('btn-fox') as HTMLButtonElement;
const btnDefault = document.getElementById('btn-default') as HTMLButtonElement;
const btnRefresh = document.getElementById('btn-refresh') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;

const btnHistoryRefresh = document.getElementById('btn-history-refresh') as HTMLButtonElement;
const historyMetaEl = document.getElementById('history-meta') as HTMLParagraphElement;
const historyListEl = document.getElementById('history-list') as HTMLDivElement;
const historyToggleBtn = document.getElementById('history-toggle') as HTMLButtonElement;
const historyContentEl = document.getElementById('history-content') as HTMLDivElement;

const btnFoxLogin = document.getElementById('btn-fox-login') as HTMLButtonElement;
const btnQuotaFetch = document.getElementById('btn-quota-fetch') as HTMLButtonElement;

const envHint = document.getElementById('env-hint') as HTMLParagraphElement;

const quotaTotal = document.getElementById('quota-total') as HTMLParagraphElement;
const quotaMonth = document.getElementById('quota-month') as HTMLParagraphElement;
const quotaUser = document.getElementById('quota-user') as HTMLSpanElement;
const quotaUpdated = document.getElementById('quota-updated') as HTMLSpanElement;
const quotaMeta = document.getElementById('quota-meta') as HTMLParagraphElement;

const actionButtons: HTMLButtonElement[] = [btnFox, btnDefault, btnRefresh, btnClear];
let quotaFetchInFlight = false;
let startupLoginPrompted = false;
let lastLoginAuthenticated = false;
let historyExpanded = false;
let historyAnimating = false;

function nowText(): string {
  const d = new Date();
  return d.toLocaleString('zh-CN', { hour12: false });
}

function setMessage(msg = '', err = ''): void {
  msgEl.textContent = msg;
  errEl.textContent = err;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timerId = 0;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timerId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    window.clearTimeout(timerId);
  }
}

function setButtonLoading(button: HTMLButtonElement, busy: boolean, busyText: string): void {
  const spinner = button.querySelector('.spinner') as HTMLSpanElement | null;
  const label = button.querySelector('.label') as HTMLSpanElement | null;

  if (spinner) spinner.classList.toggle('hidden', !busy);

  if (label) {
    if (busy) {
      label.dataset.originLabel = label.textContent ?? '';
      label.textContent = busyText;
    } else {
      label.textContent = label.dataset.originLabel || button.dataset.label || '';
    }
  }
}

function setActionLocked(locked: boolean): void {
  for (const button of actionButtons) {
    button.disabled = locked;
  }
}

function toCurrentText(current: ChannelState['current']): string {
  return current === 'mixed' ? '混合/未识别' : current;
}

function renderState(state: ChannelState): void {
  const pills = [
    {
      className: 'status-pill status-pill-current',
      text: `当前通道: ${toCurrentText(state.current)}`
    },
    {
      className: 'status-pill',
      text: `config.toml 匹配: ${state.configMatch}`
    },
    {
      className: 'status-pill',
      text: `auth.json 匹配: ${state.authMatch}`
    }
  ];

  statusEl.innerHTML = '';

  for (const item of pills) {
    const node = document.createElement('span');
    node.className = item.className;
    node.textContent = item.text;
    statusEl.appendChild(node);
  }
}

function renderQuota(result: FoxcodeQuotaResult): void {
  if (result.data) {
    quotaTotal.textContent = result.data.totalQuota;
    quotaMonth.textContent = result.data.monthQuota;
    quotaUser.textContent = result.data.username;
    quotaUpdated.textContent = nowText();
  }

  const meta: string[] = [];
  meta.push(result.hasCookie ? 'Cookie: 已存在' : 'Cookie: 未检测到');
  if (result.requiresLogin) meta.push('状态: 需要登录');
  if (result.ok) meta.push('状态: 已更新');
  if (result.apiEndpoint) meta.push(`接口: ${result.apiEndpoint}`);

  quotaMeta.textContent = meta.join(' | ');
}

function formatUpdatedAt(value: string): string {
  if (!value || value === '-') return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('zh-CN', { hour12: false });
}

function storageText(storage: HistoryEntry['storage']): string {
  if (storage === 'sessions') return '活跃';
  if (storage === 'archived_sessions') return '归档';
  return '仅索引';
}

function getHistoryContentHeight(): number {
  return Math.max(historyContentEl.scrollHeight, 0);
}

function syncHistoryExpandedHeight(): void {
  if (!historyExpanded || historyAnimating) return;
  historyContentEl.style.maxHeight = `${getHistoryContentHeight()}px`;
}

function setHistoryExpanded(nextExpanded: boolean): void {
  if (historyExpanded === nextExpanded) return;

  historyExpanded = nextExpanded;
  historyAnimating = true;
  historyToggleBtn.setAttribute('aria-expanded', String(nextExpanded));
  historyContentEl.classList.toggle('is-open', nextExpanded);

  if (nextExpanded) {
    historyContentEl.style.maxHeight = '0px';
    window.requestAnimationFrame(() => {
      historyContentEl.style.maxHeight = `${getHistoryContentHeight()}px`;
    });
    return;
  }

  historyContentEl.style.maxHeight = `${getHistoryContentHeight()}px`;
  window.requestAnimationFrame(() => {
    historyContentEl.style.maxHeight = '0px';
  });
}

function createDeleteButton(labelText: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.label = labelText;
  button.className = 'btn btn-danger !px-2 !py-1 !text-xs shrink-0';

  const spinner = document.createElement('span');
  spinner.className = 'spinner hidden';
  spinner.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = labelText;

  button.appendChild(spinner);
  button.appendChild(label);

  return button;
}

function renderHistoryList(result: HistoryListResult): void {
  historyListEl.innerHTML = '';

  if (result.items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = '暂无历史会话记录。';
    historyListEl.appendChild(empty);
    historyMetaEl.textContent = '总数: 0';
    return;
  }

  historyMetaEl.textContent = `展示 ${result.items.length} / 总数 ${result.total}`;

  for (const item of result.items) {
    const row = document.createElement('div');
    row.className = 'history-item';

    const main = document.createElement('div');
    main.className = 'history-main';

    const title = document.createElement('p');
    title.className = 'history-title';
    title.textContent = item.threadName;

    const sub = document.createElement('p');
    sub.className = 'history-sub';
    sub.textContent = `${formatUpdatedAt(item.updatedAt)} | ${storageText(item.storage)} | ${item.id}`;

    main.appendChild(title);
    main.appendChild(sub);

    const delBtn = createDeleteButton('删除');
    delBtn.addEventListener('click', () => void deleteHistoryOne(item, delBtn));

    row.appendChild(main);
    row.appendChild(delBtn);
    historyListEl.appendChild(row);
  }

  syncHistoryExpandedHeight();
}

async function refreshState(button: HTMLButtonElement | null = null): Promise<void> {
  if (button) {
    button.disabled = true;
    setButtonLoading(button, true, '刷新中...');
  }

  setMessage('正在同步状态...');

  try {
    const state = await window.codexChannelAPI.getState();
    renderState(state);
    setMessage('状态已刷新。');
  } catch (err) {
    setMessage('', `读取状态失败: ${(err as Error).message || String(err)}`);
  } finally {
    if (button) {
      button.disabled = false;
      setButtonLoading(button, false, '刷新中...');
    }
  }
}

async function loadHistoryList(button: HTMLButtonElement | null = null): Promise<void> {
  if (button) {
    button.disabled = true;
    setButtonLoading(button, true, '刷新中...');
  }

  historyMetaEl.textContent = '加载中...';

  try {
    const result = await window.codexChannelAPI.listHistory();
    renderHistoryList(result);
  } catch (err) {
    historyMetaEl.textContent = '历史会话读取失败';
    setMessage('', `读取历史会话失败: ${(err as Error).message || String(err)}`);
  } finally {
    if (button) {
      button.disabled = false;
      setButtonLoading(button, false, '刷新中...');
    }
  }
}

async function doSwitch(channel: Channel, button: HTMLButtonElement): Promise<void> {
  setActionLocked(true);
  setButtonLoading(button, true, channel === 'fox' ? '切换到 fox...' : '切换到 default...');
  setMessage('正在切换通道并刷新运行态...');

  try {
    const result = await window.codexChannelAPI.switchChannel(channel);
    renderState(result.state);

    let msg = `切换完成: ${channel}`;
    if (result.runtime.actions.length > 0) msg += `\n${result.runtime.actions.join('\n')}`;

    setMessage(msg, result.runtime.errors.join('\n'));
  } catch (err) {
    setMessage('', `切换失败: ${(err as Error).message || String(err)}`);
  } finally {
    setActionLocked(false);
    setButtonLoading(button, false, '处理中...');
  }
}

async function doClearHistory(button: HTMLButtonElement): Promise<void> {
  const ok = window.confirm('确认删除当前 Codex 历史对话吗？系统会先做本地备份。');
  if (!ok) return;

  setActionLocked(true);
  setButtonLoading(button, true, '清理中...');
  setMessage('正在备份并清理历史...');

  try {
    const result = await window.codexChannelAPI.clearHistory();
    setMessage(['历史清理完成', ...result.actions].join('\n'), result.errors.join('\n'));
    await loadHistoryList(btnHistoryRefresh);
  } catch (err) {
    setMessage('', `历史清理失败: ${(err as Error).message || String(err)}`);
  } finally {
    setActionLocked(false);
    setButtonLoading(button, false, '清理中...');
  }
}

async function deleteHistoryOne(item: HistoryEntry, button: HTMLButtonElement): Promise<void> {
  const ok = window.confirm(`确认删除以下会话吗？\n${item.threadName}\n${item.id}`);
  if (!ok) return;

  button.disabled = true;
  setButtonLoading(button, true, '删除中...');
  setMessage(`正在删除会话: ${item.id}`);

  try {
    const result = await window.codexChannelAPI.deleteHistoryOne(item.id);
    setMessage(['会话删除完成', ...result.actions].join('\n'), result.errors.join('\n'));
    await loadHistoryList(btnHistoryRefresh);
  } catch (err) {
    setMessage('', `删除会话失败: ${(err as Error).message || String(err)}`);
  } finally {
    button.disabled = false;
    setButtonLoading(button, false, '删除中...');
  }
}

async function openFoxcodeLogin(button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  setButtonLoading(button, true, '打开中...');

  try {
    const result = await window.codexChannelAPI.openFoxcodeLogin();
    setMessage(result.message);
    await loadFoxcodeLoginHint();
  } catch (err) {
    setMessage('', `打开登录页失败: ${(err as Error).message || String(err)}`);
  } finally {
    button.disabled = false;
    setButtonLoading(button, false, '打开中...');
  }
}

async function fetchQuota(options: { silent?: boolean } = {}): Promise<void> {
  if (quotaFetchInFlight) return;
  quotaFetchInFlight = true;

  const silent = !!options.silent;
  btnQuotaFetch.disabled = true;
  setButtonLoading(btnQuotaFetch, true, '获取中...');
  if (!silent) {
    setMessage('正在基于登录 Cookie 拉取额度接口...');
  }

  try {
    const result = await withTimeout(
      window.codexChannelAPI.fetchFoxcodeQuota(),
      12000,
      '请求超时（12s），请检查网络或重新登录后重试'
    );
    renderQuota(result);

    if (result.ok) {
      if (!silent) {
        setMessage(result.message, '');
      }
    } else {
      if (!silent) {
        setMessage('', result.message);
      }
    }
  } catch (err) {
    if (!silent) {
      setMessage('', `获取额度失败: ${(err as Error).message || String(err)}`);
    }
  } finally {
    btnQuotaFetch.disabled = false;
    setButtonLoading(btnQuotaFetch, false, '获取中...');
    await loadFoxcodeLoginHint();
    quotaFetchInFlight = false;
  }
}

async function loadFoxcodeLoginHint(): Promise<FoxcodeLoginState | null> {
  try {
    const state = await withTimeout(window.codexChannelAPI.getFoxcodeLoginState(), 8000, '读取登录状态超时');
    const hasAuth = state.isAuthenticated;
    btnFoxLogin.classList.toggle('hidden', hasAuth);
    envHint.textContent = hasAuth
      ? `登录状态可用（Cookie ${state.cookieCount} 个），可直接点击“获取额度”。`
      : state.hasCookie
        ? `已检测到 Cookie ${state.cookieCount} 个，但登录态无效，请点击“打开登录页”重新登录。`
        : '未检测到登录态，请先点击“打开登录页”完成登录。';
    return state;
  } catch {
    btnFoxLogin.classList.remove('hidden');
    envHint.textContent = '无法读取登录状态，请检查应用权限。';
    return null;
  }
}

async function bootstrapFoxcodeQuota(): Promise<void> {
  const loginState = await loadFoxcodeLoginHint();
  if (!loginState) return;

  lastLoginAuthenticated = loginState.isAuthenticated;

  if (loginState.isAuthenticated) {
    await fetchQuota({ silent: true });
    return;
  }

  if (startupLoginPrompted) return;
  startupLoginPrompted = true;

  const needLoginNow = window.confirm('检测到未登录 FoxCode，是否现在打开登录页完成登录并自动拉取额度？');
  if (!needLoginNow) return;

  await openFoxcodeLogin(btnFoxLogin);
}

async function pollFoxcodeLoginState(): Promise<void> {
  const loginState = await loadFoxcodeLoginHint();
  if (!loginState) return;

  const authBecameReady = loginState.isAuthenticated && !lastLoginAuthenticated;
  lastLoginAuthenticated = loginState.isAuthenticated;
  if (authBecameReady) {
    await fetchQuota({ silent: true });
  }
}

btnFox.addEventListener('click', () => void doSwitch('fox', btnFox));
btnDefault.addEventListener('click', () => void doSwitch('default', btnDefault));
btnRefresh.addEventListener('click', () => void refreshState(btnRefresh));
btnClear.addEventListener('click', () => void doClearHistory(btnClear));
btnHistoryRefresh.addEventListener('click', () => void loadHistoryList(btnHistoryRefresh));
historyToggleBtn.addEventListener('click', () => {
  setHistoryExpanded(!historyExpanded);
});
historyContentEl.addEventListener('transitionend', (event) => {
  if (event.propertyName !== 'max-height') return;
  historyAnimating = false;
  if (!historyExpanded) return;
  syncHistoryExpandedHeight();
});
window.addEventListener('resize', () => {
  syncHistoryExpandedHeight();
});
btnFoxLogin.addEventListener('click', () => void openFoxcodeLogin(btnFoxLogin));
btnQuotaFetch.addEventListener('click', () => void fetchQuota());

void refreshState(null);
void loadHistoryList(null);
void bootstrapFoxcodeQuota();

// 轮询登录态，保证用户在登录窗口完成登录后主界面可自动更新
window.setInterval(() => {
  void pollFoxcodeLoginState();
}, 3000);
