import { ArrowLeftRight, ChevronDown, History, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react';
import { IllustrationNoContent, IllustrationNoContentDark } from '@douyinfe/semi-illustrations';
import ActionButton from './ActionButton';
import { formatUpdatedAt, storageText } from '../utils';
import type { Channel, ChannelState, HistoryEntry, HistoryListResult } from '../types';
import { cn } from '../lib/utils';
import { Card } from './ui/card';

type ChannelPanelProps = {
  state: ChannelState | null;
  message: string;
  error: string;
  history: HistoryListResult;
  historyMeta: string;
  historyExpanded: boolean;
  theme: 'dark' | 'light';
  actionLocked: boolean;
  isBusy: (key: string) => boolean;
  onToggleHistory: () => void;
  onSwitchChannel: (channel: Channel) => void;
  onClearHistory: () => void;
  onRefreshHistory: () => void;
  onDeleteHistory: (item: HistoryEntry) => void;
};

function ChannelPanel(props: ChannelPanelProps) {
  const {
    state,
    message,
    error,
    history,
    historyMeta,
    historyExpanded,
    theme,
    actionLocked,
    isBusy,
    onToggleHistory,
    onSwitchChannel,
    onClearHistory,
    onRefreshHistory,
    onDeleteHistory
  } = props;
  const hasMessage = message.trim().length > 0;
  const hasError = error.trim().length > 0;
  const hasAnyLog = hasMessage || hasError;
  const EmptyLogIllustration = theme === 'dark' ? IllustrationNoContentDark : IllustrationNoContent;
  const switching = actionLocked || isBusy('fox') || isBusy('default');

  const preferredChannel: Channel = (() => {
    if (state?.current === 'fox' || state?.current === 'default') return state.current;
    if (state?.configMatch === 'fox' || state?.configMatch === 'default') return state.configMatch;
    if (state?.authMatch === 'fox' || state?.authMatch === 'default') return state.authMatch;
    return 'default';
  })();

  return (
    <Card className="panel-scroll flex h-full min-h-0 flex-col p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <ArrowLeftRight className="h-4 w-4 text-textSub" />
        通道控制
      </h2>
      <p className="mt-1 text-xs text-textSub">切换后会尝试刷新 Codex CLI / App 运行态。</p>

      <section className="panel-soft mt-3 rounded-xl border border-border/80 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-wide text-textSub">通道选择</p>
          <p className="text-[11px] text-textSub">
            当前: <span className="text-textMain">{state?.current ?? 'mixed'}</span>
          </p>
        </div>
        <div className="channel-select-wrap mt-2">
          <select
            className="channel-select"
            value={preferredChannel}
            disabled={switching}
            onChange={(event) => {
              const nextChannel = event.target.value === 'fox' ? 'fox' : 'default';
              onSwitchChannel(nextChannel);
            }}
          >
            <option value="fox">fox</option>
            <option value="default">default</option>
          </select>
        </div>
        <p className="channel-meta mt-2">
          config: <span>{state?.configMatch ?? 'unknown'}</span> · auth: <span>{state?.authMatch ?? 'unknown'}</span>
        </p>
      </section>

      <section className="panel-soft history-wrap mt-4 flex shrink-0 flex-col rounded-xl border border-border/80 p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-textMain">
            <History className="h-3.5 w-3.5 text-textSub" />
            历史会话
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="history-action-trigger history-action-danger"
              aria-label="清空历史会话（高风险）"
              title="清空历史会话（高风险）"
              disabled={actionLocked || isBusy('clear')}
              onClick={onClearHistory}
            >
              {isBusy('clear') ? (
                <LoaderCircle className="history-action-icon animate-spin" />
              ) : (
                <Trash2 className="history-action-icon" />
              )}
            </button>
            <button
              type="button"
              className="history-action-trigger"
              aria-label="刷新历史会话"
              title="刷新历史会话"
              onClick={onRefreshHistory}
            >
              <RefreshCw className={cn('history-action-icon', isBusy('history') ? 'animate-spin' : '')} />
            </button>
            <button
              type="button"
              className="history-action-trigger"
              aria-label={historyExpanded ? '收起历史会话' : '展开历史会话'}
              title={historyExpanded ? '收起历史会话' : '展开历史会话'}
              onClick={onToggleHistory}
            >
              <ChevronDown className={cn('history-action-icon', historyExpanded ? 'rotate-0' : '-rotate-90')} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className={`history-content ${historyExpanded ? 'is-open' : ''}`}>
          <div className="history-content-inner">
            <p className="mt-2 text-[11px] text-textSub">{historyMeta}</p>

            <div className="history-list mt-2">
              {history.items.length === 0 ? (
                <div className="history-empty">暂无历史会话记录。</div>
              ) : (
                history.items.map((item) => (
                  <div key={item.id} className="history-item">
                    <div className="history-main">
                      <p className="history-title">{item.threadName}</p>
                      <p className="history-sub">
                        {formatUpdatedAt(item.updatedAt)} | {storageText(item.storage)} | {item.id}
                      </p>
                    </div>
                    <ActionButton
                      className="shrink-0"
                      variant="danger"
                      size="sm"
                      label="删除"
                      busyText="删除中..."
                      loading={isBusy(`delete:${item.id}`)}
                      icon={Trash2}
                      onClick={() => onDeleteHistory(item)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
        <p className="text-[11px] text-textSub">运行日志</p>
        <div className="log-box min-h-[150px] flex-1">
          {hasMessage ? <p className="log-text-success whitespace-pre-wrap">{message}</p> : null}
          {hasError ? <p className={`log-text-error ${hasMessage ? 'mt-2' : ''} whitespace-pre-wrap`}>{error}</p> : null}
          {!hasAnyLog ? (
            <div className="log-empty-state">
              <EmptyLogIllustration className="log-empty-illustration" aria-hidden="true" />
              <p className="text-textSub/80">暂无运行日志</p>
            </div>
          ) : null}
        </div>
      </section>
    </Card>
  );
}

export default ChannelPanel;
