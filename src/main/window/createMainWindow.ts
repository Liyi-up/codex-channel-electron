import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import { APP_WINDOW_TITLE } from '../constants';

function resolveRuntimeAssetPath(candidates: string[]): string {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0] ?? '';
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const preloadPath = resolveRuntimeAssetPath([
    path.join(__dirname, 'preload.js'),
    path.join(__dirname, '..', 'preload.js'),
    path.join(__dirname, '..', '..', 'preload.js')
  ]);
  const rendererIndexPath = resolveRuntimeAssetPath([
    path.join(__dirname, 'renderer', 'index.html'),
    path.join(__dirname, '..', 'renderer', 'index.html'),
    path.join(__dirname, '..', '..', 'renderer', 'index.html')
  ]);

  const windowRef = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 820,
    minHeight: 620,
    backgroundColor: '#0d1016',
    title: APP_WINDOW_TITLE,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  windowRef.removeMenu();

  const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererDevUrl) {
    await windowRef.loadURL(rendererDevUrl);
    return windowRef;
  }

  await windowRef.loadFile(rendererIndexPath);
  return windowRef;
}
