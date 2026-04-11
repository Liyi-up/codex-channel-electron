import ActionButton from './ActionButton';
import { formatUpdatedAt, storageText, toCurrentText } from '../utils';
import type { ChannelState, HistoryEntry, HistoryListResult } from '../types';

type ChannelPanelProps = {
  state: ChannelState | null;
  message: string;
  error: string;
  history: HistoryListResult;
  historyMeta: string;
  historyExpanded: boolean;
  actionLocked: boolean;
  isBusy: (key: string) => boolean;
  onToggleHistory: () => void;
  onSwitchFox: () => void;
  onSwitchDefault: () => void;
  onRefreshState: () => void;
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
    actionLocked,
    isBusy,
    onToggleHistory,
    onSwitchFox,
    onSwitchDefault,
    onRefreshState,
    onClearHistory,
    onRefreshHistory,
    onDeleteHistory
  } = props;
  const hasMessage = message.trim().length > 0;
  const hasError = error.trim().length > 0;
  const hasAnyLog = hasMessage || hasError;

  return (
    <aside className="panel rounded-2xl border border-border/80 p-4 flex min-h-0 flex-col">
      <h2 className="text-base font-semibold">通道控制</h2>
      <p className="mt-1 text-xs text-textSub">切换后会尝试刷新 Codex CLI / App 运行态。</p>

      <section className="mt-3 flex flex-wrap gap-2">
        <span className="status-pill status-pill-current">当前通道: {toCurrentText(state?.current ?? 'mixed')}</span>
        <span className="status-pill">config.toml 匹配: {state?.configMatch ?? 'unknown'}</span>
        <span className="status-pill">auth.json 匹配: {state?.authMatch ?? 'unknown'}</span>
      </section>

      <section className="mt-3 grid gap-2">
        <ActionButton
          className="btn btn-fox"
          label="切到 fox"
          busyText="切换到 fox..."
          loading={isBusy('fox')}
          disabled={actionLocked}
          onClick={onSwitchFox}
        />
        <ActionButton
          className="btn btn-default"
          label="切到 default"
          busyText="切换到 default..."
          loading={isBusy('default')}
          disabled={actionLocked}
          onClick={onSwitchDefault}
        />
        <ActionButton
          className="btn btn-neutral"
          label="刷新状态"
          busyText="刷新中..."
          loading={isBusy('refresh')}
          disabled={actionLocked}
          onClick={onRefreshState}
        />
      </section>

      <section className="mt-4 rounded-xl border border-rose-400/35 bg-rose-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-rose-300">危险操作</h3>
          <p className="text-[11px] text-rose-200/85">先备份后清空</p>
        </div>
        <ActionButton
          className="btn btn-danger w-full"
          label="一键删除当前 Codex 历史对话"
          busyText="清理中..."
          loading={isBusy('clear')}
          disabled={actionLocked}
          onClick={onClearHistory}
        />
        <p className="mt-2 text-[11px] leading-relaxed text-rose-100/85">
          清空 <code className="inline-code">history.jsonl</code> /{' '}
          <code className="inline-code">session_index.jsonl</code> /<code className="inline-code">sessions</code> /{' '}
          <code className="inline-code">archived_sessions</code>
        </p>
      </section>

      <section className="history-wrap mt-4 rounded-xl border border-border/80 bg-black/20 p-3 flex min-h-0 flex-1 flex-col">
        <button type="button" className="history-summary" aria-expanded={historyExpanded} onClick={onToggleHistory}>
          <span className="text-xs font-semibold tracking-wide text-textMain">历史会话</span>
          <span className="history-summary-icon" aria-hidden="true">
            ▾
          </span>
        </button>
        <div className={`history-content ${historyExpanded ? 'is-open' : ''}`}>
          <div className="history-content-inner">
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-textSub">{historyMeta}</p>
              <ActionButton
                className="btn btn-neutral !px-2.5 !py-1.5 !text-xs"
                label="刷新列表"
                busyText="刷新中..."
                loading={isBusy('history')}
                onClick={onRefreshHistory}
              />
            </div>

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
                      className="btn btn-danger !px-2 !py-1 !text-xs shrink-0"
                      label="删除"
                      busyText="删除中..."
                      loading={isBusy(`delete:${item.id}`)}
                      onClick={() => onDeleteHistory(item)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-3 grid min-h-[180px] gap-2">
        <p className="text-[11px] text-textSub">运行日志</p>
        <div className="log-box min-h-[150px]">
          {hasMessage ? <p className="whitespace-pre-wrap text-emerald-300">{message}</p> : null}
          {hasError ? <p className={`${hasMessage ? 'mt-2' : ''} whitespace-pre-wrap text-rose-300`}>{error}</p> : null}
          {!hasAnyLog ? <p className="text-textSub/80">暂无日志</p> : null}
        </div>
      </section>
    </aside>
  );
}

export default ChannelPanel;
