import type { FoxCodeLoginState, FoxCodeQuotaResult } from '../types';

export function makeQuotaMeta(result: FoxCodeQuotaResult): string {
  const meta: string[] = [];

  if (result.requiresLogin) meta.push('状态: 需要登录');
  if (result.ok) meta.push('状态: 已更新');

  return meta.join(' | ');
}

export function buildLoginHint(loginState: FoxCodeLoginState): { envHint: string; showFoxLogin: boolean } {
  if (loginState.isAuthenticated) {
    return {
      showFoxLogin: false,
      envHint: ''
    };
  }

  if (loginState.hasCookie) {
    return {
      showFoxLogin: true,
      envHint: '检测到登录相关 Cookie，但应用暂未识别为有效登录态。若目标页已登录，请先点击“获取额度”刷新校验，仍失败再重新登录。'
    };
  }

  return {
    showFoxLogin: true,
    envHint: '未检测到登录态，请先点击“打开登录页”完成登录。'
  };
}
