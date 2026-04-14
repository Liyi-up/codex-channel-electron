import type { FoxCodeQuotaResult, FoxCodeStatusResult, FoxCodexStatusView, QuotaView } from '../types';
import { formatUpdatedAt } from '../utils';
import { makeQuotaMeta } from '../store/codexStore.helpers';

function parseStatusDate(value: string): Date | null {
  if (!value || value === '-') return null;

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const withTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
  const ts = Date.parse(withTimezone);
  if (Number.isNaN(ts)) return null;
  return new Date(ts);
}

function formatStatusLocalTime(value: string): string {
  const date = parseStatusDate(value);
  if (!date) return value || '--';

  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
}

function formatStatusRelativeTime(value: string): string {
  const date = parseStatusDate(value);
  if (!date) return '--';

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return '刚刚';

  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) return `${diffMinutes}m 前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h 前`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d 前`;
}

export function buildQuotaView(result?: FoxCodeQuotaResult, dataUpdatedAt?: number): QuotaView {
  if (!result?.data) {
    return {
      total: '--',
      username: '--',
      updatedAt: '--',
      meta: result ? makeQuotaMeta(result) : ''
    };
  }

  return {
    total: result.data.totalQuota,
    username: result.data.username,
    updatedAt: dataUpdatedAt ? formatUpdatedAt(new Date(dataUpdatedAt).toISOString()) : '--',
    meta: makeQuotaMeta(result)
  };
}

type StatusSnapshot = {
  result?: FoxCodeStatusResult;
  isPending: boolean;
  isError: boolean;
  errorMessage?: string;
};

function createUnknownHeartbeatPoints(): FoxCodexStatusView['heartbeatPoints'] {
  return Array.from({ length: 60 }, () => ({
    tone: 'unknown' as const,
    time: '-',
    statusText: '未知'
  }));
}

function createFallbackStatusView(
  options: Pick<FoxCodexStatusView, 'monitorName' | 'latestStatusText' | 'meta'>
): FoxCodexStatusView {
  return {
    moduleName: 'FoxCode',
    submoduleName: 'FoxCodex 状态',
    groupName: 'Codex 分组',
    monitorName: options.monitorName,
    uptime24hText: '--',
    latestStatusText: options.latestStatusText,
    latestCheckedAt: '--',
    latestCheckedAgoText: '--',
    heartbeatWindowLabel: '--',
    heartbeatPoints: createUnknownHeartbeatPoints(),
    tone: 'unknown' as const,
    meta: options.meta
  };
}

export function buildFoxCodexStatusView(snapshot: StatusSnapshot): FoxCodexStatusView {
  const { result, isPending, isError, errorMessage } = snapshot;
  const data = result?.data;

  if (!data) {
    if (isPending) {
      return createFallbackStatusView({
        monitorName: '加载中...',
        latestStatusText: '加载中',
        meta: '正在拉取状态数据...'
      });
    }

    return createFallbackStatusView({
      monitorName: '--',
      latestStatusText: '未知',
      meta: isError ? `状态接口异常: ${errorMessage || '未知错误'}` : result?.message ?? '状态数据暂不可用'
    });
  }

  const uptime24hText = data.uptime24h === null ? '--' : `${(data.uptime24h * 100).toFixed(2)}%`;
  const latestStatusText = data.latestStatus === 'up' ? '可用' : data.latestStatus === 'down' ? '异常' : '未知';
  const heartbeatPoints = data.heartbeatPoints.map((item) => {
    const tone = item.status === 1 ? 'up' : item.status === 0 ? 'down' : 'unknown';
    const statusText = item.status === 1 ? '正常' : item.status === 0 ? '异常' : '未知';
    return {
      tone,
      time: formatStatusLocalTime(item.time),
      statusText
    };
  });

  return {
    moduleName: data.moduleName,
    submoduleName: data.submoduleName,
    groupName: data.groupName || 'Codex 分组',
    monitorName: data.monitorName,
    uptime24hText,
    latestStatusText,
    latestCheckedAt: formatStatusLocalTime(data.latestCheckedAt),
    latestCheckedAgoText: formatStatusRelativeTime(data.latestCheckedAt),
    heartbeatWindowLabel: data.heartbeatWindowLabel || '--',
    heartbeatPoints,
    tone: data.latestStatus,
    meta: result?.message ?? ''
  };
}
