import type { StoreApi } from 'zustand';
import type { CodexStore } from './codexStore.schema';

export type SetStore = StoreApi<CodexStore>['setState'];
export type GetStore = StoreApi<CodexStore>['getState'];

export function setBusyFlag(set: SetStore, key: string, loading: boolean): void {
  set((prev) => ({
    busy: {
      ...prev.busy,
      [key]: loading
    }
  }));
}

export function setFeedback(set: SetStore, message = '', error = ''): void {
  set({ message, error });
}
