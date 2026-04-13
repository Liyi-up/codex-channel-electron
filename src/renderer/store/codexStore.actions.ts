import type { Channel, HistoryEntry } from '../types';
import { codexQueryKeys } from '../query/codexQueries';
import { queryClient } from '../query/queryClient';
import { setBusyFlag, setFeedback, type GetStore, type SetStore } from './codexStore.actionUtils';
import type { CodexStoreActions } from './codexStore.schema';

async function switchChannelAction(set: SetStore, channel: Channel): Promise<void> {
  set({ actionLocked: true });
  setBusyFlag(set, channel, true);
  setFeedback(set, '正在切换通道并刷新运行态...');

  try {
    const result = await window.codexChannelAPI.switchChannel(channel);

    let message = `切换完成: ${channel}`;
    if (result.runtime.actions.length > 0) {
      message += `\n${result.runtime.actions.join('\n')}`;
    }
    setFeedback(set, message, result.runtime.errors.join('\n'));

    await queryClient.invalidateQueries({ queryKey: codexQueryKeys.channelState });
  } catch (err) {
    setFeedback(set, '', `切换失败: ${(err as Error).message || String(err)}`);
  } finally {
    setBusyFlag(set, channel, false);
    set({ actionLocked: false });
  }
}

async function clearHistoryAction(set: SetStore): Promise<void> {
  const riskConfirmed = window.confirm(
    '高风险操作提醒：将清空当前 Codex 历史索引与会话文件，历史列表将不可恢复显示。\n\n系统会先做本地备份，但不保证所有会话都可直接恢复。\n\n是否继续？'
  );
  if (!riskConfirmed) return;

  const finalConfirmed = window.confirm(
    '最终确认：即将执行历史清理。\n\n将清空 history.jsonl / session_index.jsonl / sessions / archived_sessions。\n\n确认执行吗？'
  );
  if (!finalConfirmed) return;

  set({ actionLocked: true });
  setBusyFlag(set, 'clear', true);
  setFeedback(set, '正在备份并清理历史...');

  try {
    const result = await window.codexChannelAPI.clearHistory();
    setFeedback(set, ['历史清理完成', ...result.actions].join('\n'), result.errors.join('\n'));

    await queryClient.invalidateQueries({ queryKey: codexQueryKeys.history });
  } catch (err) {
    setFeedback(set, '', `历史清理失败: ${(err as Error).message || String(err)}`);
  } finally {
    setBusyFlag(set, 'clear', false);
    set({ actionLocked: false });
  }
}

async function deleteHistoryOneAction(set: SetStore, item: HistoryEntry): Promise<void> {
  const ok = window.confirm(`确认删除以下会话吗？\n${item.threadName}\n${item.id}`);
  if (!ok) return;

  const key = `delete:${item.id}`;
  setBusyFlag(set, key, true);
  setFeedback(set, `正在删除会话: ${item.id}`);

  try {
    const result = await window.codexChannelAPI.deleteHistoryOne(item.id);
    setFeedback(set, ['会话删除完成', ...result.actions].join('\n'), result.errors.join('\n'));

    await queryClient.invalidateQueries({ queryKey: codexQueryKeys.history });
  } catch (err) {
    setFeedback(set, '', `删除会话失败: ${(err as Error).message || String(err)}`);
  } finally {
    setBusyFlag(set, key, false);
  }
}

async function openFoxcodeLoginAction(set: SetStore): Promise<void> {
  setBusyFlag(set, 'login', true);

  try {
    const result = await window.codexChannelAPI.openFoxcodeLogin();
    setFeedback(set, result.message, '');

    await queryClient.invalidateQueries({ queryKey: codexQueryKeys.loginState });
  } catch (err) {
    setFeedback(set, '', `打开登录页失败: ${(err as Error).message || String(err)}`);
  } finally {
    setBusyFlag(set, 'login', false);
  }
}

export function createCodexStoreActions(set: SetStore, get: GetStore): CodexStoreActions {
  return {
    isBusy: (key: string): boolean => !!get().busy[key],

    setHistoryExpanded: (expanded: boolean): void => {
      set({ historyExpanded: expanded });
    },

    setFeedback: (message = '', error = ''): void => {
      setFeedback(set, message, error);
    },

    switchChannel: async (channel: Channel): Promise<void> => {
      await switchChannelAction(set, channel);
    },

    clearHistory: async (): Promise<void> => {
      await clearHistoryAction(set);
    },

    deleteHistoryOne: async (item: HistoryEntry): Promise<void> => {
      await deleteHistoryOneAction(set, item);
    },

    openFoxcodeLogin: async (): Promise<void> => {
      await openFoxcodeLoginAction(set);
    }
  };
}
