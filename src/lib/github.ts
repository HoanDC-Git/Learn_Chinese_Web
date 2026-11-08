// Client tối giản cho GitHub Contents API (đọc/ghi sync.json trong repo private).
// Token là fine-grained PAT chỉ quyền Contents read/write đúng 1 repo,
// do người dùng nhập trên máy mình và chỉ nằm trong localStorage.

const API_BASE = 'https://api.github.com';
const TIMEOUT_MS = 25000;

export interface RemoteFile {
  sha: string;
  text: string;
}

export class ConflictError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ConflictError';
  }
}

export interface GhConfig {
  owner: string;
  repo: string;
  path: string;
  token: string;
}

async function fetchJson(url: string, token: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    let body: unknown = null;
    try {
      body = await resp.json();
    } catch {
      body = null;
    }
    return { status: resp.status, body };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Mạng quá chậm (quá 25s), hãy thử lại.');
    throw new Error('Lỗi mạng, kiểm tra 4G/Wifi rồi thử lại.');
  } finally {
    clearTimeout(timer);
  }
}

function contentsUrl(cfg: GhConfig): string {
  const clean = cfg.path.trim().replace(/^\/+/, '');
  return `${API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/${clean}`;
}

function b64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function utf8ToB64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

/** Tải file. Trả null khi file chưa tồn tại (repo mới). */
export async function getFile(cfg: GhConfig): Promise<RemoteFile | null> {
  const { status, body } = await fetchJson(contentsUrl(cfg), cfg.token);
  if (status === 200) {
    const b = body as { sha: string; content?: string; encoding?: string };
    if (b.encoding !== 'base64' || typeof b.content !== 'string') throw new Error('GitHub trả định dạng lạ.');
    return { sha: b.sha, text: b64ToUtf8(b.content) };
  }
  if (status === 404) return null;
  if (status === 401) throw new Error('Token sai hoặc hết hạn, hãy tạo token mới.');
  if (status === 403) throw new Error('Token thiếu quyền Contents trên repo này.');
  throw new Error(`GitHub lỗi ${status} khi tải file.`);
}

/**
 * Ghi file. sha=null để tạo mới, sha=... để cập nhật (CAS: sha cũ -> ConflictError).
 * Trả về sha mới.
 */
export async function putFile(cfg: GhConfig, text: string, sha: string | null, message: string): Promise<string> {
  const payload: Record<string, unknown> = { message, content: utf8ToB64(text) };
  if (sha) payload.sha = sha;
  const { status, body } = await fetchJson(contentsUrl(cfg), cfg.token, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (status === 200 || status === 201) {
    const b = body as { content?: { sha?: string } };
    if (!b.content?.sha) throw new Error('GitHub không trả sha mới.');
    return b.content.sha;
  }
  if (status === 401) throw new Error('Token sai hoặc hết hạn, hãy tạo token mới.');
  if (status === 409 || status === 422) {
    throw new ConflictError('File trên cloud vừa đổi (có thể laptop vừa đẩy). Hãy tải lại rồi lưu tiếp.');
  }
  throw new Error(`GitHub lỗi ${status} khi lưu file.`);
}
