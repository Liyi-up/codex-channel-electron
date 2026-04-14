import os from 'node:os';
import path from 'node:path';

import type { Channel } from './types';

export const BASE_DIR = path.join(os.homedir(), '.codex');
export const CONFIG_TARGET = path.join(BASE_DIR, 'config.toml');
export const AUTH_TARGET = path.join(BASE_DIR, 'auth.json');

export const CHANNEL_FILES: Record<Channel, { config: string; auth: string }> = {
  default: {
    config: path.join(BASE_DIR, 'config-default.toml'),
    auth: path.join(BASE_DIR, 'auth-default.json')
  },
  fox: {
    config: path.join(BASE_DIR, 'config-fox.toml'),
    auth: path.join(BASE_DIR, 'auth-fox.json')
  }
};

export const HISTORY_FILES = [path.join(BASE_DIR, 'history.jsonl'), path.join(BASE_DIR, 'session_index.jsonl')];

export const HISTORY_DIRS = [path.join(BASE_DIR, 'sessions'), path.join(BASE_DIR, 'archived_sessions')];
export const STATE_DB_PATH = path.join(BASE_DIR, 'state_5.sqlite');

export const APP_WINDOW_TITLE = 'Codex Channel';

export const FOXCODE_PARTITION = 'persist:foxcode-auth';
export const FOXCODE_LOGIN_URL = 'https://foxcode.rjj.cc/auth/login';
export const FOXCODE_DASHBOARD_URL = 'https://foxcode.rjj.cc/dashboard';
export const FOXCODE_STATUS_PAGE_API = 'https://status.rjj.cc/api/status-page/foxcode';
export const FOXCODE_STATUS_HEARTBEAT_API = 'https://status.rjj.cc/api/status-page/heartbeat/foxcode';
