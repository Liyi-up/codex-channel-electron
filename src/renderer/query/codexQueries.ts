import { useQuery } from '@tanstack/react-query';
import { withTimeout } from '../utils';

export const codexQueryKeys = {
  channelState: ['codex', 'channel-state'] as const,
  history: ['codex', 'history'] as const,
  loginState: ['codex', 'foxcode-login-state'] as const,
  quota: ['codex', 'foxcode-quota'] as const
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

export function useFoxcodeLoginStateQuery() {
  return useQuery({
    queryKey: codexQueryKeys.loginState,
    queryFn: () => withTimeout(window.codexChannelAPI.getFoxcodeLoginState(), 8000, '读取登录状态超时'),
    refetchInterval: 3000
  });
}

export function useFoxcodeQuotaQuery() {
  return useQuery({
    queryKey: codexQueryKeys.quota,
    queryFn: () =>
      withTimeout(window.codexChannelAPI.fetchFoxcodeQuota(), 12000, '请求超时（12s），请检查网络或重新登录后重试'),
    enabled: false
  });
}
