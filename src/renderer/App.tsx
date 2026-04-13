import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MoonStar, SunMedium } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import ChannelPanel from './components/ChannelPanel';
import QuotaPanel from './components/QuotaPanel';
import { Button } from './components/ui/button';
import {
  useChannelStateQuery,
  useFoxcodeLoginStateQuery,
  useFoxcodeQuotaQuery,
  useHistoryQuery
} from './query/codexQueries';
import { buildLoginHint, makeQuotaMeta } from './store/codexStore.helpers';
import useCodexStore from './store/useCodexStore';
import { formatUpdatedAt } from './utils';

type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'codex-channel-theme';

function readInitialTheme(): ThemeMode {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  return saved === 'light' ? 'light' : 'dark';
}

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
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);

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
      updatedAt: quotaQuery.dataUpdatedAt ? formatUpdatedAt(new Date(quotaQuery.dataUpdatedAt).toISOString()) : '--',
      meta: makeQuotaMeta(quotaQuery.data)
    };
  }, [quotaQuery.data, quotaQuery.dataUpdatedAt]);

  const isBusy = (key: string): boolean => {
    if (key === 'history') return historyQuery.isFetching;
    if (key === 'quota') return quotaQuery.isFetching;
    return storeIsBusy(key);
  };

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

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <div className={`theme-root theme-${theme} app-bg h-screen overflow-hidden text-textMain antialiased`}>
      <main className="mx-auto flex h-screen w-full max-w-7xl flex-col px-4 py-4">
        <header className="mb-3 border-b border-border/70 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-textSub">Desktop Utility</p>
              <h1 className="mt-1.5 text-[38px] font-semibold leading-none tracking-tight">codex channel</h1>
              <p className="mt-1 text-xs text-textSub">仅展示 FoxCode 仪表板额度数据（按量额度 / 月卡额度）。</p>
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
            message={message}
            error={error}
            history={history}
            historyMeta={historyMeta}
            historyExpanded={historyExpanded}
            theme={theme}
            actionLocked={actionLocked}
            isBusy={isBusy}
            onToggleHistory={() => setHistoryExpanded(!historyExpanded)}
            onSwitchChannel={(channel) => void switchChannel(channel)}
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
