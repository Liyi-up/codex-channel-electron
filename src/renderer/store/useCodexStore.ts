import { create } from 'zustand';
import { createCodexStoreActions } from './codexStore.actions';
import { INITIAL_STORE_STATE, type CodexStore } from './codexStore.schema';

const useCodexStore = create<CodexStore>((set, get) => ({
  ...INITIAL_STORE_STATE,
  ...createCodexStoreActions(set, get)
}));

export default useCodexStore;
