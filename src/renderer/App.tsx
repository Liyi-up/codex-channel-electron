import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MoonStar, SunMedium } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import ChannelPanel from './components/ChannelPanel';
import QuotaPanel from './components/QuotaPanel';
import { Button } from './components/ui/button';
import {
  useChannelStateQuery,
  useFoxCodeLoginStateQuery,
  useFoxCodeQuotaQuery,
  useFoxCodeStatusQuery,
  useHistoryQuery
} from './query/codexQueries';
import { buildLoginHint } from './store/codexStore.helpers';
import useCodexStore from './store/useCodexStore';
import { useThemeMode } from './hooks/useThemeMode';
import { buildFoxCodexStatusView, buildQuotaView } from './view-models/foxCodeViewMappers';

function App() {
  const {
    actionLocked,
    isBusy: storeIsBusy,
    setFeedback,
    switchChannel,
    clearHistory,
    deleteHistoryOne,
    openFoxCodeLogin
  } = useCodexStore(
    useShallow((store) => ({
      actionLocked: store.actionLocked,
      isBusy: store.isBusy,
      setFeedback: store.setFeedback,
      switchChannel: store.switchChannel,
      clearHistory: store.clearHistory,
      deleteHistoryOne: store.deleteHistoryOne,
      openFoxCodeLogin: store.openFoxCodeLogin
    }))
  );

  const lastLoginAuthenticatedRef = useRef(false);
  const { theme, toggleTheme } = useThemeMode();
  const [historyRefreshing, setHistoryRefreshing] = useState(false);

  const stateQuery = useChannelStateQuery();
  const historyQuery = useHistoryQuery();
  const loginStateQuery = useFoxCodeLoginStateQuery();
  const quotaQuery = useFoxCodeQuotaQuery(loginStateQuery.data?.isAuthenticated ?? false);
  const foxcodeStatusQuery = useFoxCodeStatusQuery();

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
      envHint: ''
    };
  }, [loginStateQuery.data, loginStateQuery.isError]);

  const quotaExceptionHint = useMemo(() => {
    if (quotaQuery.isError) {
      return `额度获取异常：${quotaQuery.error?.message || '未知错误'}`;
    }

    const quotaResult = quotaQuery.data;
    if (quotaResult && !quotaResult.ok && !quotaResult.requiresLogin) {
      return quotaResult.message || '额度获取异常，请稍后重试。';
    }

    return '';
  }, [quotaQuery.data, quotaQuery.error?.message, quotaQuery.isError]);

  const quotaPanelHint = quotaExceptionHint || loginHint.envHint;

  const quotaView = useMemo(() => buildQuotaView(quotaQuery.data, quotaQuery.dataUpdatedAt), [quotaQuery.data, quotaQuery.dataUpdatedAt]);

  const foxCodexStatusView = useMemo(
    () =>
      buildFoxCodexStatusView({
        result: foxcodeStatusQuery.data,
        isPending: foxcodeStatusQuery.isPending,
        isError: foxcodeStatusQuery.isError,
        errorMessage: foxcodeStatusQuery.error?.message
      }),
    [foxcodeStatusQuery.data, foxcodeStatusQuery.error?.message, foxcodeStatusQuery.isError, foxcodeStatusQuery.isPending]
  );

  const isBusy = (key: string): boolean => {
    if (key === 'history') return historyRefreshing || historyQuery.isFetching;
    if (key === 'quota') return quotaQuery.isFetching;
    if (key === 'foxcode-status') return foxcodeStatusQuery.isFetching;
    return storeIsBusy(key);
  };

  const applyResultFeedback = useCallback(
    (
      actionName: string,
      data: { ok: boolean; message: string } | undefined,
      options?: { silent?: boolean }
    ): boolean => {
      const silent = options?.silent ?? false;
      if (!data) {
        if (!silent) {
          setFeedback('', `${actionName}失败: 未获取到返回结果`);
        }
        return false;
      }

      if (!silent) {
        if (data.ok) {
          setFeedback(data.message, '');
        } else {
          setFeedback('', data.message);
        }
      }
      return true;
    },
    [setFeedback]
  );

  const refreshHistory = useCallback(async (): Promise<void> => {
    if (historyRefreshing) return;
    setHistoryRefreshing(true);
    setFeedback('正在刷新历史会话...');
    const start = Date.now();

    try {
      const result = await historyQuery.refetch();
      const remaining = 350 - (Date.now() - start);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }

      if (result.error) {
        setFeedback('', `读取历史会话失败: ${result.error.message || String(result.error)}`);
        return;
      }

      setFeedback('历史会话已刷新。');
    } finally {
      setHistoryRefreshing(false);
    }
  }, [historyQuery, historyRefreshing, setFeedback]);

  const fetchQuota = useCallback(
    async (silent: boolean): Promise<void> => {
      if (!silent) {
        setFeedback('正在获取额度...');
      }

      const result = await quotaQuery.refetch();
      void foxcodeStatusQuery.refetch();
      if (result.error) {
        if (!silent) {
          setFeedback('', `获取额度失败: ${result.error.message || String(result.error)}`);
        }
        return;
      }

      applyResultFeedback('获取额度', result.data, { silent });
    },
    [applyResultFeedback, foxcodeStatusQuery, quotaQuery, setFeedback]
  );

  const refreshFoxCodeStatus = useCallback(async (): Promise<void> => {
    setFeedback('正在刷新状态...');
    const result = await foxcodeStatusQuery.refetch();
    if (result.error) {
      setFeedback('', `刷新状态失败: ${result.error.message || String(result.error)}`);
      return;
    }

    applyResultFeedback('刷新状态', result.data);
  }, [applyResultFeedback, foxcodeStatusQuery, setFeedback]);

  useEffect(() => {
    const loginState = loginStateQuery.data;
    if (!loginState) return;

    const authBecameReady = loginState.isAuthenticated && !lastLoginAuthenticatedRef.current;
    lastLoginAuthenticatedRef.current = loginState.isAuthenticated;

    if (authBecameReady) {
      void fetchQuota(true);
    }
  }, [fetchQuota, loginStateQuery.data]);

  return (
    <div className={`theme-root theme-${theme} app-bg h-screen overflow-hidden text-textMain antialiased`}>
      <main className="mx-auto flex h-screen w-full max-w-7xl flex-col px-4 py-4">
        <header className="mb-3 border-b border-border/70 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-textSub">Desktop Utility</p>
              <h1 className="mt-1.5 text-[38px] font-semibold leading-none tracking-tight">Codex Channel</h1>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="theme-switch shrink-0"
              aria-label={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}
              title={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 grid-rows-2 gap-4 pb-2 lg:grid-cols-[332px_minmax(0,1fr)] lg:grid-rows-1 lg:pb-0">
          <ChannelPanel
            state={channelState}
            history={history}
            historyMeta={historyMeta}
            actionLocked={actionLocked}
            isBusy={isBusy}
            onSwitchChannel={(channel) => void switchChannel(channel)}
            onClearHistory={() => void clearHistory()}
            onRefreshHistory={() => void refreshHistory()}
            onDeleteHistory={(item) => void deleteHistoryOne(item)}
          />

          <QuotaPanel
            envHint={quotaPanelHint}
            showFoxLogin={loginHint.showFoxLogin}
            quota={quotaView}
            foxCodexStatus={foxCodexStatusView}
            isBusy={isBusy}
            onOpenFoxLogin={() => void openFoxCodeLogin()}
            onFetchQuota={() => void fetchQuota(false)}
            onRefreshStatus={() => void refreshFoxCodeStatus()}
          />
        </section>
      </main>
    </div>
  );
}

export default App;
