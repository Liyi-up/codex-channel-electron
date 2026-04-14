import fs from 'node:fs';

import { AUTH_TARGET, CHANNEL_FILES, CONFIG_TARGET } from '../constants';
import { runCmd, sameConfigFile, sameFile } from '../utils';
import type { Channel, ChannelState, RuntimeRefreshResult, SwitchResult } from '../types';

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

export function getState(): ChannelState {
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

export function refreshCodexRuntime(): RuntimeRefreshResult {
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

export function switchChannel(channel: Channel): SwitchResult {
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
