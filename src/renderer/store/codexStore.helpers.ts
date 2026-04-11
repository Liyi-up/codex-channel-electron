import type { FoxcodeLoginState, FoxcodeQuotaResult } from '../types';

export function makeQuotaMeta(result: FoxcodeQuotaResult): string {
  const meta: string[] = [];

  if (result.requiresLogin) meta.push('状态: 需要登录');
  if (result.ok) meta.push('状态: 已更新');

  return meta.join(' | ');
}

export function buildLoginHint(loginState: FoxcodeLoginState): { envHint: string; showFoxLogin: boolean } {
  if (loginState.isAuthenticated) {
    return {
      showFoxLogin: false,
      envHint: '登录状态可用，可直接点击“获取额度”。'
    };
  }

  if (loginState.hasCookie) {
    return {
      showFoxLogin: true,
      envHint: '检测到已有登录信息，但状态失效，请点击“打开登录页”重新登录。'
    };
  }

  return {
    showFoxLogin: true,
    envHint: '未检测到登录态，请先点击“打开登录页”完成登录。'
  };
}
