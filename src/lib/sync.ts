// Logic sync + SRS — port 1-1 từ src-tauri/src/domain/{sync,srs}.rs của app laptop.
// Mọi thay đổi bảng SRS ở đây PHẢI đổi đồng thời phía Rust.

export const MAX_LEVEL = 8;
export const UPDATED_BY_PHONE = 'phone';
export const UPDATED_BY_LAPTOP = 'laptop';

export interface SyncCard {
  id: number;
  hanzi: string;
  pinyin: string | null;
  meaning: string | null;
  level: number;
  next_review: string | null;
  remembered?: boolean | null;
}

export interface SyncFile {
  version: number;
  updated_by: string;
  updated_at: string;
  cards: SyncCard[];
}

export interface SrsResult {
  new_level: number;
  next_review: string;
  days_interval: number;
}

/** Kết quả 1 thẻ sau phiên ôn (dùng chung Session/App/storage). */
export interface SessionResult {
  id: number;
  remembered: boolean;
  new_level: number;
  next_review: string;
}

/** Cuối ngày hôm nay (giờ local) — mốc lọc "từ đến hạn hôm nay". */
export function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Thẻ mới (chưa có hẹn) hoặc hẹn không quá cuối hôm nay. */
export function isDueToday(c: SyncCard): boolean {
  if (!c.next_review) return true;
  const t = new Date(c.next_review).getTime();
  return !Number.isNaN(t) && t <= endOfToday().getTime();
}

function daysInterval(level: number): number {
  switch (level) {
    case 0: return 0;
    case 1:
    case 2: return 1;
    case 3: return 3;
    case 4: return 7;
    case 5: return 14;
    case 6: return 30;
    case 7: return 60;
    default: return 120;
  }
}

/** Port của srs::calculate_next_review: level 0 -> ngay bây giờ, còn lại -> 0h local + N ngày. */
export function calculateNextReview(currentLevel: number, remembered: boolean): SrsResult {
  const new_level = remembered
    ? Math.min(currentLevel + 1, MAX_LEVEL)
    : Math.max(currentLevel - 1, 0);
  const days_interval = daysInterval(new_level);
  let next_review: string;
  if (new_level === 0) {
    next_review = new Date().toISOString();
  } else {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0); // 0h giờ local (khớp phía Rust)
    next_review = new Date(midnight.getTime() + days_interval * 86400_000).toISOString();
  }
  return { new_level, next_review, days_interval };
}

/** Version push mới = max(giờ hiện tại, remote+1) — tăng đơn điệu dù lệch đồng hồ. */
export function nextVersion(nowSec: number, remoteVersion: number): number {
  return Math.max(nowSec, remoteVersion + 1);
}

export function parseSyncFile(text: string): SyncFile {
  const f = JSON.parse(text) as SyncFile;
  if (typeof f.version !== 'number' || f.version <= 0) throw new Error('File sync thiếu version hợp lệ.');
  if (f.updated_by !== UPDATED_BY_PHONE && f.updated_by !== UPDATED_BY_LAPTOP) {
    throw new Error(`File sync có updated_by lạ: ${f.updated_by}`);
  }
  if (!Array.isArray(f.cards)) throw new Error('File sync thiếu danh sách cards.');
  return f;
}

/** Nhãn độ thuộc theo level SRS — copy từ app laptop (getMasteryLabel). */
export function getMasteryLabel(level: number): string {
  const labels: Record<number, string> = {
    0: 'Làm quen',
    1: 'Sơ cấp',
    2: 'Cơ bản',
    3: 'Trung cấp',
    4: 'Tiến bộ',
    5: 'Cao cấp',
    6: 'Thành thạo',
    7: 'Điêu luyện',
    8: 'Tinh thông',
  };
  return labels[level] ?? `Lvl ${level}`;
}

/** Xáo trộn thứ tự học (Fisher–Yates), không đột biến mảng gốc. */
export function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
