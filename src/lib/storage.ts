// Lưu local trên điện thoại: cấu hình + snapshot để học offline.
import type { GhConfig } from './github';
import type { SyncFile } from './sync';

const K_CONFIG = 'lcw:config';
const K_SNAPSHOT = 'lcw:snapshot';

export interface SnapshotCache {
  file: SyncFile;
  savedAt: number;
}

export function loadConfig(): GhConfig | null {
  try {
    const raw = localStorage.getItem(K_CONFIG);
    if (!raw) return null;
    const c = JSON.parse(raw) as GhConfig;
    if (!c.owner || !c.repo || !c.token) return null;
    return { owner: c.owner, repo: c.repo, path: c.path || 'sync.json', token: c.token };
  } catch {
    return null;
  }
}

export function saveConfig(cfg: GhConfig): void {
  localStorage.setItem(K_CONFIG, JSON.stringify(cfg));
}

export function clearConfig(): void {
  localStorage.removeItem(K_CONFIG);
}

export function loadSnapshot(): SnapshotCache | null {
  try {
    const raw = localStorage.getItem(K_SNAPSHOT);
    return raw ? (JSON.parse(raw) as SnapshotCache) : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(file: SyncFile): void {
  const cache: SnapshotCache = { file, savedAt: Date.now() };
  localStorage.setItem(K_SNAPSHOT, JSON.stringify(cache));
}
