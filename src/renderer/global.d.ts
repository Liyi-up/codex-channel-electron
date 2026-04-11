import type { CodexChannelAPI } from './types';

declare global {
  interface Window {
    codexChannelAPI: CodexChannelAPI;
  }
}

export {};
