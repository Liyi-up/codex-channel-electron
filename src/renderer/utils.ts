import type { ChannelState, HistoryEntry } from './types';

export function nowText(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

export function formatUpdatedAt(value: string): string {
  if (!value || value === '-') return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function storageText(storage: HistoryEntry['storage']): string {
  if (storage === 'sessions') return '活跃';
  if (storage === 'archived_sessions') return '归档';
  return '仅索引';
}

export function toCurrentText(current: ChannelState['current']): string {
  return current === 'mixed' ? '混合/未识别' : current;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
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
