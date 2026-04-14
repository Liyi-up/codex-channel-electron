import fs from 'node:fs';
import path from 'node:path';

import { BASE_DIR, HISTORY_DIRS, HISTORY_FILES, STATE_DB_PATH } from '../constants';
import {
  clearDirContent,
  ensureDir,
  isRecord,
  normalizeSessionId,
  runCmd,
  safeDateValue,
  toFiniteNumber,
  walkFiles
} from '../utils';
import type { ClearHistoryResult, DeleteHistoryOneResult, HistoryEntry, HistoryListResult } from '../types';

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

function readSqliteChanges(): number {
  const changes = runCmd('/usr/bin/sqlite3', [STATE_DB_PATH, 'SELECT changes();']);
  if (changes.status !== 0) return 0;
  const value = Number(String(changes.stdout ?? '').trim());
  return Number.isFinite(value) ? value : 0;
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

export function clearHistory(): ClearHistoryResult {
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

export function listHistory(limit = 120): HistoryListResult {
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

export function deleteHistoryOne(sessionId: string): DeleteHistoryOneResult {
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
