import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import { APP_WINDOW_TITLE } from '../constants';

function resolveRuntimeAssetPath(candidates: string[]): string {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0] ?? '';
}

function resolveRuntimeDistPath(): string {
  if (!app.isPackaged) {
    return __dirname;
  }

  const appPath = app.getAppPath();
  const candidates = [
    path.join(appPath, 'dist'),
    path.join(process.resourcesPath, 'app.asar', 'dist'),
    path.join(process.resourcesPath, 'dist')
  ];

  return resolveRuntimeAssetPath(candidates);
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const distPath = resolveRuntimeDistPath();
  const preloadPath = resolveRuntimeAssetPath([
    path.join(distPath, 'preload.js'),
    path.join(__dirname, 'preload.js'),
    path.join(__dirname, '..', 'preload.js'),
    path.join(__dirname, '..', '..', 'preload.js')
  ]);
  const rendererIndexPath = resolveRuntimeAssetPath([
    path.join(distPath, 'renderer', 'index.html'),
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
