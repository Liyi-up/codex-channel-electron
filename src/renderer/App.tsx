import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import ChannelPanel from './components/ChannelPanel';
import QuotaPanel from './components/QuotaPanel';
import {
  useChannelStateQuery,
  useFoxcodeLoginStateQuery,
  useFoxcodeQuotaQuery,
  useHistoryQuery
} from './query/codexQueries';
import { buildLoginHint, makeQuotaMeta } from './store/codexStore.helpers';
import useCodexStore from './store/useCodexStore';
import { nowText } from './utils';

function App() {
  const {
    message,
    error,
    historyExpanded,
    actionLocked,
    isBusy: storeIsBusy,
    setHistoryExpanded,
    setFeedback,
    switchChannel,
    clearHistory,
    deleteHistoryOne,
    openFoxcodeLogin
  } = useCodexStore(
    useShallow((store) => ({
      message: store.message,
      error: store.error,
      historyExpanded: store.historyExpanded,
      actionLocked: store.actionLocked,
      isBusy: store.isBusy,
      setHistoryExpanded: store.setHistoryExpanded,
      setFeedback: store.setFeedback,
      switchChannel: store.switchChannel,
      clearHistory: store.clearHistory,
      deleteHistoryOne: store.deleteHistoryOne,
      openFoxcodeLogin: store.openFoxcodeLogin
    }))
  );

  const startupLoginPromptedRef = useRef(false);
  const lastLoginAuthenticatedRef = useRef(false);

  const stateQuery = useChannelStateQuery();
  const historyQuery = useHistoryQuery();
  const loginStateQuery = useFoxcodeLoginStateQuery();
  const quotaQuery = useFoxcodeQuotaQuery();

  const channelState = stateQuery.data ?? null;

  const history = historyQuery.data ?? { items: [], total: 0 };
  const historyMeta = useMemo(() => {
    if (historyQuery.isPending) return '加载中...';
    if (historyQuery.isError) return '历史会话读取失败';
    return history.items.length === 0 ? '总数: 0' : `展示 ${history.items.length} / 总数 ${history.total}`;
  }, [history.items.length, history.total, historyQuery.isError, historyQuery.isPending]);

  const loginHint = useMemo(() => {
    if (loginStateQuery.data) {
      return buildLoginHint(loginStateQuery.data);
    }

    if (loginStateQuery.isError) {
      return {
        showFoxLogin: true,
        envHint: '无法读取登录状态，请检查应用权限。'
      };
    }

    return {
      showFoxLogin: true,
      envHint: '正在检测登录状态...'
    };
  }, [loginStateQuery.data, loginStateQuery.isError]);

  const quotaView = useMemo(() => {
    if (!quotaQuery.data?.data) {
      return {
        total: '--',
        month: '--',
        username: '--',
        updatedAt: '--',
        meta: quotaQuery.data ? makeQuotaMeta(quotaQuery.data) : ''
      };
    }

    return {
      total: quotaQuery.data.data.totalQuota,
      month: quotaQuery.data.data.monthQuota,
      username: quotaQuery.data.data.username,
      updatedAt: nowText(),
      meta: makeQuotaMeta(quotaQuery.data)
    };
  }, [quotaQuery.data]);

  const isBusy = (key: string): boolean => {
    if (key === 'refresh') return stateQuery.isFetching;
    if (key === 'history') return historyQuery.isFetching;
    if (key === 'quota') return quotaQuery.isFetching;
    return storeIsBusy(key);
  };

  const refreshState = useCallback(async (): Promise<void> => {
    setFeedback('正在同步状态...');
    const result = await stateQuery.refetch();

    if (result.error) {
      setFeedback('', `读取状态失败: ${result.error.message || String(result.error)}`);
      return;
    }

    setFeedback('状态已刷新。', '');
  }, [setFeedback, stateQuery]);

  const refreshHistory = useCallback(async (): Promise<void> => {
    const result = await historyQuery.refetch();

    if (result.error) {
      setFeedback('', `读取历史会话失败: ${result.error.message || String(result.error)}`);
    }
  }, [historyQuery, setFeedback]);

  const fetchQuota = useCallback(
    async (silent: boolean): Promise<void> => {
      if (!silent) {
        setFeedback('正在获取额度...');
      }

      const result = await quotaQuery.refetch();
      if (result.error) {
        if (!silent) {
          setFeedback('', `获取额度失败: ${result.error.message || String(result.error)}`);
        }
        return;
      }

      if (!result.data) {
        if (!silent) {
          setFeedback('', '获取额度失败: 未获取到返回结果');
        }
        return;
      }

      if (!silent) {
        if (result.data.ok) {
          setFeedback(result.data.message, '');
        } else {
          setFeedback('', result.data.message);
        }
      }
    },
    [quotaQuery, setFeedback]
  );

  useEffect(() => {
    const loginState = loginStateQuery.data;
    if (!loginState) return;

    const authBecameReady = loginState.isAuthenticated && !lastLoginAuthenticatedRef.current;
    lastLoginAuthenticatedRef.current = loginState.isAuthenticated;

    if (authBecameReady) {
      void fetchQuota(true);
      return;
    }

    if (loginState.isAuthenticated || startupLoginPromptedRef.current) return;
    startupLoginPromptedRef.current = true;

    const needLoginNow = window.confirm('检测到未登录 FoxCode，是否现在打开登录页完成登录并自动拉取额度？');
    if (needLoginNow) {
      void openFoxcodeLogin();
    }
  }, [fetchQuota, loginStateQuery.data, openFoxcodeLogin]);

  return (
    <div className="app-bg h-screen overflow-hidden text-textMain antialiased">
      <main className="mx-auto flex h-screen w-full max-w-7xl flex-col px-4 py-4">
        <header className="mb-3 border-b border-border/70 pb-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-textSub">Desktop Utility</p>
          <h1 className="mt-1.5 text-[38px] font-semibold leading-none tracking-tight">codex channel</h1>
          <p className="mt-1 text-xs text-textSub">仅展示 FoxCode 仪表板额度数据（按量额度 / 月卡额度）。</p>
        </header>

        <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[332px_minmax(0,1fr)]">
          <ChannelPanel
            state={channelState}
            message={message}
            error={error}
            history={history}
            historyMeta={historyMeta}
            historyExpanded={historyExpanded}
            actionLocked={actionLocked}
            isBusy={isBusy}
            onToggleHistory={() => setHistoryExpanded(!historyExpanded)}
            onSwitchFox={() => void switchChannel('fox')}
            onSwitchDefault={() => void switchChannel('default')}
            onRefreshState={() => void refreshState()}
            onClearHistory={() => void clearHistory()}
            onRefreshHistory={() => void refreshHistory()}
            onDeleteHistory={(item) => void deleteHistoryOne(item)}
          />

          <QuotaPanel
            envHint={loginHint.envHint}
            showFoxLogin={loginHint.showFoxLogin}
            quota={quotaView}
            isBusy={isBusy}
            onOpenFoxLogin={() => void openFoxcodeLogin()}
            onFetchQuota={() => void fetchQuota(false)}
          />
        </section>
      </main>
    </div>
  );
}

export default App;
