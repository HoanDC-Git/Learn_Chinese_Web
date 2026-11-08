// Lưu local trên điện thoại: cấu hình + snapshot để học offline.
import type { GhConfig } from './github';
import type { SessionResult, SyncFile } from './sync';

const K_CONFIG = 'lcw:config';
const K_SNAPSHOT = 'lcw:snapshot';
const K_PENDING = 'lcw:pending';

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

export interface PendingCache {
  results: SessionResult[];
  finishedAt: number;
}

/** Kết quả học xong nhưng chưa đẩy lên cloud (thoát giữa chừng cũng không mất). */
export function savePending(results: SessionResult[]): void {
  const cache: PendingCache = { results, finishedAt: Date.now() };
  localStorage.setItem(K_PENDING, JSON.stringify(cache));
}

export function loadPending(): PendingCache | null {
  try {
    const raw = localStorage.getItem(K_PENDING);
    const c = raw ? (JSON.parse(raw) as PendingCache) : null;
    return c && Array.isArray(c.results) && c.results.length > 0 ? c : null;
  } catch {
    return null;
  }
}

export function clearPending(): void {
  localStorage.removeItem(K_PENDING);
}
