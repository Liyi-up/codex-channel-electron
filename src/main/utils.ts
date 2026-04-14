import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function readBufferSafe(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function readTextSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function normalizeConfigForChannelCompare(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  let skippingProjectsSection = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, '');
    const trimmed = line.trim();
    const isTable = /^\s*\[[^\]]+\]\s*$/.test(trimmed);

    if (/^\s*\[projects\.".*"\]\s*$/.test(trimmed)) {
      skippingProjectsSection = true;
      continue;
    }

    if (isTable && skippingProjectsSection) {
      skippingProjectsSection = false;
    }

    if (skippingProjectsSection) continue;
    kept.push(line);
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sameFile(a: string, b: string): boolean {
  const aBuffer = readBufferSafe(a);
  const bBuffer = readBufferSafe(b);
  return !!aBuffer && !!bBuffer && aBuffer.equals(bBuffer);
}

export function sameConfigFile(a: string, b: string): boolean {
  if (sameFile(a, b)) return true;

  const aText = readTextSafe(a);
  const bText = readTextSafe(b);
  if (aText === null || bText === null) return false;

  return normalizeConfigForChannelCompare(aText) === normalizeConfigForChannelCompare(bText);
}

export function runCmd(command: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(command, args, { encoding: 'utf8' });
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function clearDirContent(dirPath: string): void {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.rmSync(fullPath, { force: true });
    }
  }
}

export function walkFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];

  const result: string[] = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        result.push(fullPath);
      }
    }
  }

  return result;
}

export function normalizeSessionId(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

export function safeDateValue(isoText: string): number {
  const value = Date.parse(isoText);
  return Number.isNaN(value) ? 0 : value;
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutError)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
