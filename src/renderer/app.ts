type Channel = 'default' | 'fox';
type RemoteTab = 'dashboard' | 'status';

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

type CodexChannelAPI = {
  getState: () => Promise<ChannelState>;
  switchChannel: (channel: Channel) => Promise<SwitchResult>;
  clearHistory: () => Promise<ClearHistoryResult>;
  openExternal: (url: string) => Promise<void>;
};

interface WebviewElement extends HTMLElement {
  reload: () => void;
  addEventListener: (type: string, listener: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    codexChannelAPI: CodexChannelAPI;
  }
}

export {};

const REMOTE_URLS: Record<RemoteTab, string> = {
  dashboard: 'https://foxcode.rjj.cc/dashboard',
  status: 'https://status.rjj.cc/status/foxcode'
};

const statusEl = document.getElementById('status') as HTMLDivElement;
const msgEl = document.getElementById('msg') as HTMLPreElement;
const errEl = document.getElementById('err') as HTMLPreElement;

const btnFox = document.getElementById('btn-fox') as HTMLButtonElement;
const btnDefault = document.getElementById('btn-default') as HTMLButtonElement;
const btnRefresh = document.getElementById('btn-refresh') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;

const tabDashboard = document.getElementById('tab-dashboard') as HTMLButtonElement;
const tabStatus = document.getElementById('tab-status') as HTMLButtonElement;

const btnRemoteRefresh = document.getElementById('btn-remote-refresh') as HTMLButtonElement;
const btnOpenExternal = document.getElementById('btn-open-external') as HTMLButtonElement;

const loadingHint = document.getElementById('remote-loading') as HTMLSpanElement;
const remoteError = document.getElementById('remote-error') as HTMLParagraphElement;

const viewDashboard = document.getElementById('view-dashboard') as unknown as WebviewElement;
const viewStatus = document.getElementById('view-status') as unknown as WebviewElement;

const actionButtons: HTMLButtonElement[] = [btnFox, btnDefault, btnRefresh, btnClear];

let currentRemoteTab: RemoteTab = 'dashboard';

function setMessage(msg = '', err = ''): void {
  msgEl.textContent = msg;
  errEl.textContent = err;
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

function activeView(): WebviewElement {
  return currentRemoteTab === 'dashboard' ? viewDashboard : viewStatus;
}

function setRemoteLoading(loading: boolean): void {
  loadingHint.classList.toggle('hidden', !loading);
  btnRemoteRefresh.disabled = loading;
  setButtonLoading(btnRemoteRefresh, loading, '加载中...');
}

function showRemoteError(message: string): void {
  remoteError.textContent = message;
  remoteError.classList.remove('hidden');
}

function clearRemoteError(): void {
  remoteError.textContent = '';
  remoteError.classList.add('hidden');
}

function switchRemoteTab(tab: RemoteTab): void {
  currentRemoteTab = tab;

  const dashboardActive = tab === 'dashboard';
  viewDashboard.classList.toggle('hidden', !dashboardActive);
  viewStatus.classList.toggle('hidden', dashboardActive);

  tabDashboard.classList.toggle('tab-btn-active', dashboardActive);
  tabStatus.classList.toggle('tab-btn-active', !dashboardActive);

  clearRemoteError();
}

function bindWebviewEvents(view: WebviewElement, tab: RemoteTab): void {
  view.addEventListener('did-start-loading', () => {
    if (tab === currentRemoteTab) {
      clearRemoteError();
      setRemoteLoading(true);
    }
  });

  view.addEventListener('did-stop-loading', () => {
    if (tab === currentRemoteTab) {
      setRemoteLoading(false);
    }
  });

  view.addEventListener('did-fail-load', (...args: unknown[]) => {
    if (tab !== currentRemoteTab) return;
    setRemoteLoading(false);

    // Electron did-fail-load 的第一个参数是事件对象，错误码从第二个参数开始。
    const code = typeof args[1] === 'number' ? args[1] : undefined;
    const desc = typeof args[2] === 'string' ? args[2] : undefined;
    showRemoteError(`页面加载失败: ${desc || '未知错误'}${code ? ` (code: ${code})` : ''}`);
  });
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
  } catch (err) {
    setMessage('', `历史清理失败: ${(err as Error).message || String(err)}`);
  } finally {
    setActionLocked(false);
    setButtonLoading(button, false, '清理中...');
  }
}

function refreshRemoteView(): void {
  clearRemoteError();
  setRemoteLoading(true);
  activeView().reload();
}

async function openCurrentRemoteInBrowser(): Promise<void> {
  const url = REMOTE_URLS[currentRemoteTab];
  try {
    await window.codexChannelAPI.openExternal(url);
  } catch (err) {
    showRemoteError(`浏览器打开失败: ${(err as Error).message || String(err)}`);
  }
}

bindWebviewEvents(viewDashboard, 'dashboard');
bindWebviewEvents(viewStatus, 'status');

btnFox.addEventListener('click', () => void doSwitch('fox', btnFox));
btnDefault.addEventListener('click', () => void doSwitch('default', btnDefault));
btnRefresh.addEventListener('click', () => void refreshState(btnRefresh));
btnClear.addEventListener('click', () => void doClearHistory(btnClear));

btnRemoteRefresh.addEventListener('click', refreshRemoteView);
btnOpenExternal.addEventListener('click', () => void openCurrentRemoteInBrowser());

tabDashboard.addEventListener('click', () => switchRemoteTab('dashboard'));
tabStatus.addEventListener('click', () => switchRemoteTab('status'));

switchRemoteTab('dashboard');
void refreshState(null);
