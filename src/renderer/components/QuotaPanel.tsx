import { Activity, LoaderCircle, LogIn, RefreshCw, Wallet } from 'lucide-react';
import { useState } from 'react';
import type { FoxCodexStatusView, QuotaView } from '../types';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';
import { cn } from '../lib/utils';

type QuotaPanelProps = {
  envHint: string;
  showFoxLogin: boolean;
  quota: QuotaView;
  foxCodexStatus: FoxCodexStatusView;
  isBusy: (key: string) => boolean;
  onOpenFoxLogin: () => void;
  onFetchQuota: () => void;
  onRefreshStatus: () => void;
};

function QuotaPanel(props: QuotaPanelProps) {
  const { envHint, showFoxLogin, quota, foxCodexStatus, isBusy, onOpenFoxLogin, onFetchQuota, onRefreshStatus } = props;
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const pointsCount = foxCodexStatus.heartbeatPoints.length;
  const hoveredPoint = hoveredPointIndex === null ? null : foxCodexStatus.heartbeatPoints[hoveredPointIndex] ?? null;
  const gridTemplateColumns = `repeat(${Math.max(pointsCount, 1)}, minmax(0, 1fr))`;
  const edgeThreshold = 3;
  const tooltipPosition: 'left' | 'center' | 'right' =
    hoveredPointIndex === null || pointsCount <= edgeThreshold * 2
      ? 'center'
      : hoveredPointIndex < edgeThreshold
        ? 'left'
        : hoveredPointIndex >= pointsCount - edgeThreshold
          ? 'right'
          : 'center';
  const tooltipLeftPercent =
    hoveredPointIndex === null || pointsCount === 0 ? 50 : ((hoveredPointIndex + 0.5) / pointsCount) * 100;

  return (
    <Card className="panel-scroll h-full min-h-0 p-4">
      <CardHeader className="space-y-1 p-0">
        <CardTitle className="text-base">FoxCode</CardTitle>
        <CardDescription>额度与状态</CardDescription>
      </CardHeader>

      <section className="meta-box mt-4 rounded-xl border border-border/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-textMain">
            <Wallet className="h-4 w-4 text-textSub" />
            额度
          </p>
          <div className="flex items-center gap-1.5">
            {showFoxLogin ? (
              <button
                type="button"
                className="history-action-trigger"
                aria-label="打开登录页"
                title="打开登录页"
                disabled={isBusy('login')}
                onClick={onOpenFoxLogin}
              >
                {isBusy('login') ? (
                  <LoaderCircle className="history-action-icon animate-spin" />
                ) : (
                  <LogIn className="history-action-icon" />
                )}
              </button>
            ) : null}
            <button
              type="button"
              className="history-action-trigger"
              aria-label="刷新额度"
              title="刷新额度"
              disabled={isBusy('quota')}
              onClick={onFetchQuota}
            >
              <RefreshCw className={cn('history-action-icon', isBusy('quota') ? 'animate-spin' : '')} />
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-3">
          {envHint ? <p className="hint-box rounded-lg border border-border/70 px-3 py-2 text-xs text-textSub">{envHint}</p> : null}

          <section className="grid gap-3 sm:grid-cols-2">
            <article className="quota-card quota-card-total">
              <p className="quota-title">按量额度</p>
              <p className="quota-value">{quota.total}</p>
            </article>
            <article className="quota-card quota-card-month">
              <p className="quota-title">账号信息状态</p>
              <p className="mt-2 text-sm text-textMain">
                账号：<span>{quota.username}</span>
              </p>
              <p className="mt-1 text-xs text-textSub">
                更新时间：<span>{quota.updatedAt}</span>
              </p>
              <p className="mt-1 text-xs text-textSub">{quota.meta}</p>
            </article>
          </section>
        </div>
      </section>

      <section className="meta-box mt-4 rounded-xl border border-border/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-textMain">
            <Activity className="h-4 w-4 text-textSub" />
            <span>状态</span>
            {isBusy('foxcode-status') ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-textSub" aria-hidden="true" />
            ) : null}
          </div>
          <button
            type="button"
            className="history-action-trigger"
            aria-label="刷新状态"
            title="刷新状态"
            disabled={isBusy('foxcode-status')}
            onClick={onRefreshStatus}
          >
            <RefreshCw className={cn('history-action-icon', isBusy('foxcode-status') ? 'animate-spin' : '')} />
          </button>
        </div>
        <div className="mt-3 text-xs text-textSub">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'status-pill inline-flex shrink-0 items-center px-2.5 py-0.5 text-[11px] font-semibold',
                {
                  'status-pill-up': foxCodexStatus.tone === 'up',
                  'status-pill-down': foxCodexStatus.tone === 'down',
                  'status-pill-current': foxCodexStatus.tone === 'unknown'
                }
              )}
            >
              {foxCodexStatus.uptime24hText}
            </span>
            <p className="truncate text-sm text-textMain">{foxCodexStatus.monitorName}</p>
          </div>

          <div className="relative mt-2">
            <div className="grid w-full items-center gap-1" style={{ gridTemplateColumns }}>
              {foxCodexStatus.heartbeatPoints.map((point, index) => (
                <button
                  key={`${point.tone}-${point.time}-${index}`}
                  type="button"
                  className={cn(
                    'heartbeat-point',
                    {
                      'heartbeat-point-up': point.tone === 'up',
                      'heartbeat-point-down': point.tone === 'down',
                      'heartbeat-point-unknown': point.tone === 'unknown'
                    }
                  )}
                  aria-label={`${point.statusText} ${point.time}`}
                  onMouseEnter={() => setHoveredPointIndex(index)}
                  onFocus={() => setHoveredPointIndex(index)}
                  onMouseLeave={() => setHoveredPointIndex((current) => (current === index ? null : current))}
                  onBlur={() => setHoveredPointIndex((current) => (current === index ? null : current))}
                />
              ))}
            </div>

            {hoveredPoint ? (
              <div
                className={cn(
                  'pointer-events-none absolute bottom-full z-20 mb-2 rounded-xl border border-border/80 bg-panel px-3 py-2 text-center shadow-xl',
                  {
                    'left-0': tooltipPosition === 'left',
                    'right-0': tooltipPosition === 'right',
                    '-translate-x-1/2': tooltipPosition === 'center'
                  }
                )}
                style={tooltipPosition === 'center' ? { left: `${tooltipLeftPercent}%` } : undefined}
              >
                <p
                  className={cn('text-sm font-semibold', {
                    'tooltip-tone-up': hoveredPoint.tone === 'up',
                    'tooltip-tone-down': hoveredPoint.tone === 'down',
                    'text-textMain': hoveredPoint.tone === 'unknown'
                  })}
                >
                  {hoveredPoint.statusText}
                </p>
                <p className="mt-1 whitespace-nowrap text-[12px] text-textSub">{hoveredPoint.time}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-1 flex items-center justify-between text-[11px] text-textSub">
            <span>窗口 {foxCodexStatus.heartbeatWindowLabel}</span>
            <span>{foxCodexStatus.latestCheckedAgoText}</span>
          </div>

          <p className="mt-2">
            状态：<span className="text-textMain">{foxCodexStatus.latestStatusText}</span>
            <span className="mx-1.5">·</span>
            最近检测：<span className="text-textMain">{foxCodexStatus.latestCheckedAt}</span>
          </p>
          <p className="mt-1">{foxCodexStatus.meta}</p>
        </div>
      </section>
    </Card>
  );
}

export default QuotaPanel;
