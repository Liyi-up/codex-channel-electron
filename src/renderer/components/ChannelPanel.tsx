import { ArrowLeftRight, History, LoaderCircle, RefreshCw, Trash2, X } from 'lucide-react';
import { formatUpdatedAt, storageText } from '../utils';
import type { Channel, ChannelState, HistoryEntry, HistoryListResult } from '../types';
import { cn } from '../lib/utils';
import { Card } from './ui/card';

type ChannelPanelProps = {
  state: ChannelState | null;
  history: HistoryListResult;
  historyMeta: string;
  actionLocked: boolean;
  isBusy: (key: string) => boolean;
  onSwitchChannel: (channel: Channel) => void;
  onClearHistory: () => void;
  onRefreshHistory: () => void;
  onDeleteHistory: (item: HistoryEntry) => void;
};

function ChannelPanel(props: ChannelPanelProps) {
  const {
    state,
    history,
    historyMeta,
    actionLocked,
    isBusy,
    onSwitchChannel,
    onClearHistory,
    onRefreshHistory,
    onDeleteHistory
  } = props;
  const switching = actionLocked || isBusy('fox') || isBusy('default');

  const preferredChannel: Channel = (() => {
    if (state?.current === 'fox' || state?.current === 'default') return state.current;
    if (state?.configMatch === 'fox' || state?.configMatch === 'default') return state.configMatch;
    if (state?.authMatch === 'fox' || state?.authMatch === 'default') return state.authMatch;
    return 'default';
  })();

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden p-4">
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

      <section className="panel-soft history-wrap mt-4 flex min-h-0 flex-1 flex-col rounded-xl border border-border/80 p-3">
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
              disabled={isBusy('history')}
              onClick={onRefreshHistory}
            >
              <RefreshCw className={cn('history-action-icon', isBusy('history') ? 'animate-spin' : '')} />
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-textSub">{historyMeta}</p>

        <div className="history-list mt-2">
          {history.items.length === 0 ? (
            <div className="history-empty">暂无历史会话记录。</div>
          ) : (
            history.items.map((item) => (
              <div key={item.id} className="history-item">
                <button
                  type="button"
                  className="history-item-delete history-item-delete-danger"
                  aria-label={`删除会话 ${item.threadName}`}
                  title="删除会话"
                  disabled={isBusy(`delete:${item.id}`)}
                  onClick={() => onDeleteHistory(item)}
                >
                  {isBusy(`delete:${item.id}`) ? (
                    <LoaderCircle className="history-item-delete-icon animate-spin" />
                  ) : (
                    <X className="history-item-delete-icon" />
                  )}
                </button>
                <div className="history-main pr-6">
                  <p className="history-title">{item.threadName}</p>
                  <p className="history-sub">
                    {formatUpdatedAt(item.updatedAt)} | {storageText(item.storage)} | {item.id}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </Card>
  );
}

export default ChannelPanel;
