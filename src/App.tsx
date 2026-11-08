import { useState } from 'react';
import { Session, type CardResult } from './components/Session';
import { getFile, putFile, ConflictError, type GhConfig } from './lib/github';
import {
  parseSyncFile,
  nextVersion,
  shuffled,
  UPDATED_BY_PHONE,
  type SyncFile,
} from './lib/sync';
import {
  loadConfig,
  saveConfig,
  clearConfig,
  loadSnapshot,
  saveSnapshot,
} from './lib/storage';

type Screen = 'home' | 'session' | 'done';

function fmtVersion(v: number): string {
  if (!v) return '—';
  return new Date(v * 1000).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function App() {
  const [cfg, setCfg] = useState<GhConfig | null>(() => loadConfig());
  const [snapshot, setSnapshot] = useState<SyncFile | null>(() => loadSnapshot()?.file ?? null);
  const [screen, setScreen] = useState<Screen>('home');
  const [order, setOrder] = useState<number[]>([]);
  const [results, setResults] = useState<CardResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);
  const [showCfg, setShowCfg] = useState(false);
  const [pushed, setPushed] = useState(false);

  // Form cấu hình
  const [fOwner, setFOwner] = useState(cfg?.owner ?? '');
  const [fRepo, setFRepo] = useState(cfg?.repo ?? '');
  const [fPath, setFPath] = useState(cfg?.path ?? 'sync.json');
  const [fToken, setFToken] = useState('');

  const startSession = (file: SyncFile) => {
    setOrder(shuffled(file.cards.map((_, i) => i)));
    setResults([]);
    setPushed(false);
    setMsg(null);
    setScreen('session');
  };

  /** Nút Học bài: kéo bản mới nhất từ cloud (có mạng). */
  const pullAndStart = async () => {
    if (!cfg) {
      setMsg({ kind: 'err', text: 'Chưa cấu hình repo — mở Cấu hình bên dưới.' });
      setShowCfg(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    setOfflineReady(false);
    try {
      const remote = await getFile(cfg);
      if (!remote) {
        setMsg({ kind: 'err', text: 'Cloud chưa có file sync. Mở app laptop và ấn Đồng bộ ngay trước.' });
        return;
      }
      const file = parseSyncFile(remote.text);
      if (file.cards.length === 0) {
        setMsg({ kind: 'err', text: 'Bản trên cloud không còn thẻ nào đến hạn. Tuyệt vời!' });
        return;
      }
      saveSnapshot(file);
      setSnapshot(file);
      startSession(file);
    } catch (e) {
      const cached = loadSnapshot();
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Tải thất bại.' });
      if (cached && cached.file.cards.length > 0) setOfflineReady(true);
    } finally {
      setBusy(false);
    }
  };

  const startOffline = () => {
    const cached = loadSnapshot();
    if (!cached) return;
    setSnapshot(cached.file);
    startSession(cached.file);
  };

  /** Nút Lưu tiến trình: merge kết quả vào bản cloud MỚI NHẤT rồi đẩy (chống mất dữ liệu). */
  const pushResults = async () => {
    if (!cfg || !snapshot) return;
    setBusy(true);
    setMsg(null);
    try {
      // Lấy sha + bản mới nhất để merge (laptop có thể đã đẩy sau lúc ta học).
      const remote = await getFile(cfg);
      const base: SyncFile = remote ? parseSyncFile(remote.text) : snapshot;
      const resMap = new Map(results.map((r) => [r.id, r]));
      const mergedCards = base.cards.map((c) => {
        const r = resMap.get(c.id);
        return r
          ? { ...c, level: r.new_level, next_review: r.next_review, remembered: r.remembered }
          : { ...c, remembered: null };
      });
      const nowSec = Math.floor(Date.now() / 1000);
      const build = (version: number): SyncFile => ({
        version,
        updated_by: UPDATED_BY_PHONE,
        updated_at: new Date().toISOString(),
        cards: mergedCards,
      });

      let text = JSON.stringify(build(nextVersion(nowSec, base.version)));
      try {
        await putFile(cfg, text, remote?.sha ?? null, `sync: phone results v${nextVersion(nowSec, base.version)}`);
      } catch (e) {
        if (!(e instanceof ConflictError)) throw e;
        // Conflict: tải lại, merge lại, đẩy 1 lần nữa với sha mới.
        const fresh = await getFile(cfg);
        if (!fresh) throw new Error('File cloud biến mất, hãy thử lại.');
        const freshFile = parseSyncFile(fresh.text);
        const resMap2 = new Map(results.map((r) => [r.id, r]));
        const merged2 = freshFile.cards.map((c) => {
          const r = resMap2.get(c.id);
          return r
            ? { ...c, level: r.new_level, next_review: r.next_review, remembered: r.remembered }
            : { ...c, remembered: null };
        });
        const v2 = nextVersion(Math.floor(Date.now() / 1000), freshFile.version);
        text = JSON.stringify({ version: v2, updated_by: UPDATED_BY_PHONE, updated_at: new Date().toISOString(), cards: merged2 });
        await putFile(cfg, text, fresh.sha, `sync: phone results v${v2} (retry)`);
      }

      const saved = JSON.parse(text) as SyncFile;
      saveSnapshot(saved);
      setSnapshot(saved);
      setPushed(true);
      setMsg({ kind: 'ok', text: `Đã lưu ${results.length} kết quả lên cloud (bản ${fmtVersion(saved.version)}). Mở app laptop để kéo về.` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Lưu thất bại.' });
    } finally {
      setBusy(false);
    }
  };

  const saveCfgForm = () => {
    if (!fOwner.trim() || !fRepo.trim()) {
      setMsg({ kind: 'err', text: 'Owner và repo không được trống.' });
      return;
    }
    // Token để trống = giữ token đã lưu (chỉ lần đầu bắt buộc nhập).
    const token = fToken.trim() || cfg?.token || '';
    if (!token) {
      setMsg({ kind: 'err', text: 'Lần đầu phải nhập token.' });
      return;
    }
    const c: GhConfig = { owner: fOwner.trim(), repo: fRepo.trim(), path: fPath.trim() || 'sync.json', token };
    saveConfig(c);
    setCfg(c);
    setFToken('');
    setMsg({ kind: 'ok', text: 'Đã lưu cấu hình trên máy này.' });
  };

  // ---------------- Màn học ----------------
  if (screen === 'session' && snapshot) {
    return (
      <Session
        cards={snapshot.cards}
        order={order}
        onExit={() => setScreen('home')}
        onFinish={(r) => {
          setResults(r);
          setScreen('done');
        }}
      />
    );
  }

  // ---------------- Màn xong ----------------
  if (screen === 'done') {
    const remembered = results.filter((r) => r.remembered).length;
    return (
      <div className="app">
        <div className="topbar">
          <span className="title">Kết quả</span>
        </div>
        <div className="center">
          <div className="hero">✓</div>
          <div className="stats col">
            <div className="stat">
              <b style={{ color: 'var(--emerald-fg)' }}>{remembered}</b>
              <span>Nhớ</span>
            </div>
            <div className="stat">
              <b style={{ color: 'var(--rose-fg)' }}>{results.length - remembered}</b>
              <span>Quên</span>
            </div>
          </div>
          {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
          <div className="col">
            {!pushed && (
              <button className="btn btn-primary" disabled={busy} onClick={pushResults}>
                {busy ? 'Đang lưu…' : 'Lưu tiến trình lên cloud'}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => { setScreen('home'); setMsg(null); }}>
              Về trang chủ
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- Trang chủ ----------------
  return (
    <div className="app">
      <div className="topbar">
        <span className="title">📚 Ôn từ tiếng Trung</span>
      </div>
      <div className="center">
        <div className="hero">学</div>
        <div className="sub">
          {snapshot ? (
            <>
              Bản đã lưu: <b>{snapshot.cards.length} thẻ</b> · phiên bản {fmtVersion(snapshot.version)}
            </>
          ) : (
            'Chưa có bản lưu nào trên máy này.'
          )}
        </div>
        {msg && <div className={`msg ${msg.kind} col`}>{msg.text}</div>}
        <div className="col">
          <button className="btn btn-primary" disabled={busy} onClick={pullAndStart}>
            {busy ? 'Đang tải…' : 'Học bài'}
          </button>
          {offlineReady && (
            <button className="btn btn-ghost" onClick={startOffline}>
              Học với bản đã lưu (không mạng)
            </button>
          )}
          <button className="linklike" onClick={() => setShowCfg((v) => !v)}>
            {showCfg ? 'Ẩn cấu hình ▲' : 'Cấu hình repo & token ▼'}
          </button>
        </div>
        {showCfg && (
          <div className="config">
            <div className="row">
              <label>
                Owner
                <input value={fOwner} onChange={(e) => setFOwner(e.target.value)} placeholder="HoanDC-Git" autoComplete="off" />
              </label>
              <label>
                Repo sync (private)
                <input value={fRepo} onChange={(e) => setFRepo(e.target.value)} placeholder="LearnChineseSync" autoComplete="off" />
              </label>
            </div>
            <label>
              Đường dẫn file
              <input value={fPath} onChange={(e) => setFPath(e.target.value)} placeholder="sync.json" autoComplete="off" />
            </label>
            <label>
              Token (PAT quyền Contents)
              <input
                type="password"
                value={fToken}
                onChange={(e) => setFToken(e.target.value)}
                placeholder="github_pat_... (để trống nếu giữ nguyên)"
                autoComplete="off"
              />
            </label>
            <button className="btn btn-primary" style={{ minHeight: 48 }} onClick={saveCfgForm}>
              Lưu cấu hình
            </button>
            {cfg && (
              <button
                className="linklike"
                onClick={() => {
                  clearConfig();
                  setCfg(null);
                  setMsg({ kind: 'ok', text: 'Đã xóa cấu hình khỏi máy này.' });
                }}
              >
                Xóa cấu hình khỏi máy
              </button>
            )}
            <p className="tiny">
              Token chỉ nằm trong máy này, không gửi đi đâu ngoài api.github.com. Repo code web là public nhưng không chứa token.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
