import { useQuery } from '@tanstack/react-query';
import { withTimeout } from '../utils';

const VIEWPORT_AUTO_REFRESH_THROTTLE_MS = 3 * 60 * 1000;

export const codexQueryKeys = {
  channelState: ['codex', 'channel-state'] as const,
  history: ['codex', 'history'] as const,
  loginState: ['codex', 'foxcode-login-state'] as const,
  quota: ['codex', 'foxcode-quota'] as const,
  foxcodeStatus: ['codex', 'foxcode-status'] as const
};

export function useChannelStateQuery() {
  return useQuery({
    queryKey: codexQueryKeys.channelState,
    queryFn: () => window.codexChannelAPI.getState()
  });
}

export function useHistoryQuery() {
  return useQuery({
    queryKey: codexQueryKeys.history,
    queryFn: () => window.codexChannelAPI.listHistory()
  });
}

export function useFoxCodeLoginStateQuery() {
  return useQuery({
    queryKey: codexQueryKeys.loginState,
    queryFn: () => withTimeout(window.codexChannelAPI.getFoxCodeLoginState(), 8000, '读取登录状态超时'),
    refetchInterval: 3000
  });
}

export function useFoxCodeQuotaQuery(enabled: boolean) {
  return useQuery({
    queryKey: codexQueryKeys.quota,
    queryFn: () =>
      withTimeout(window.codexChannelAPI.fetchFoxCodeQuota(), 12000, '请求超时（12s），请检查网络或重新登录后重试'),
    enabled,
    staleTime: VIEWPORT_AUTO_REFRESH_THROTTLE_MS,
    // 登录态可用但额度仍为空时，说明可能是瞬时网络/页面抖动，继续短轮询直到拿到有效数据。
    refetchInterval: (query) => {
      if (!enabled) return false;
      const data = query.state.data;
      if (!data) return 5000;
      if (!data.ok && !data.requiresLogin) return 10000;
      return false;
    },
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  });
}

export function useFoxCodeStatusQuery() {
  return useQuery({
    queryKey: codexQueryKeys.foxcodeStatus,
    queryFn: () => withTimeout(window.codexChannelAPI.fetchFoxCodeStatus(), 10000, '请求超时（10s），请稍后重试'),
    staleTime: VIEWPORT_AUTO_REFRESH_THROTTLE_MS,
    refetchInterval: 300000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  });
}
