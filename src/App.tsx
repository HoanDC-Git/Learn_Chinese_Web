import { useEffect, useState } from 'react';
import { Session } from './components/Session';
import { getFile, putFile, ConflictError, type GhConfig } from './lib/github';
import {
  parseSyncFile,
  nextVersion,
  shuffled,
  isDueToday,
  UPDATED_BY_PHONE,
  type SessionResult,
  type SyncCard,
  type SyncFile,
} from './lib/sync';
import {
  loadConfig,
  saveConfig,
  clearConfig,
  loadSnapshot,
  saveSnapshot,
  savePending,
  loadPending,
  clearPending,
} from './lib/storage';

type Screen = 'home' | 'session' | 'done';
type Scope = 'today' | 'all';

const DEFAULT_OWNER = 'HoanDC-Git';
const DEFAULT_REPO = 'LearnChineseSync';
const DEFAULT_PATH = 'sync.json';

function fmtVersion(v: number): string {
  if (!v) return '—';
  return new Date(v * 1000).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Ép màn ngang (best-effort): PWA standalone thì manifest lo, tab thường thì thử API. */
function lockLandscape() {
  try {
    screen.orientation.lock('landscape').catch(() => {});
  } catch {
    /* CSS fallback tự xoay khi viewport dọc */
  }
}

function unlockOrientation() {
  try {
    screen.orientation.unlock();
  } catch {
    /* bỏ qua */
  }
}

export function App() {
  const [cfg, setCfg] = useState<GhConfig | null>(() => loadConfig());
  const [snapshot, setSnapshot] = useState<SyncFile | null>(() => loadSnapshot()?.file ?? null);
  const [screen, setScreen] = useState<Screen>('home');
  const [sessionCards, setSessionCards] = useState<SyncCard[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [pending, setPending] = useState<SessionResult[] | null>(() => loadPending()?.results ?? null);
  const [scope, setScope] = useState<Scope>('today');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);
  const [showCfg, setShowCfg] = useState(false);
  const [pushed, setPushed] = useState(false);
  const [cloudInfo, setCloudInfo] = useState<{ version: number; count: number } | null>(null);
  const [checking, setChecking] = useState(false);

  // Form cấu hình — owner/repo để sẵn, bấm vào sửa khi cần.
  const [fOwner, setFOwner] = useState(cfg?.owner ?? DEFAULT_OWNER);
  const [fRepo, setFRepo] = useState(cfg?.repo ?? DEFAULT_REPO);
  const [fPath, setFPath] = useState(cfg?.path ?? DEFAULT_PATH);
  const [fToken, setFToken] = useState('');

  const todayCount = snapshot ? snapshot.cards.filter(isDueToday).length : 0;

  const goHome = () => {
    unlockOrientation();
    setScreen('home');
    setMsg(null);
  };

  const startSession = (file: SyncFile) => {
    const list = scope === 'today' ? file.cards.filter(isDueToday) : file.cards;
    if (list.length === 0) {
      setMsg({
        kind: 'err',
        text:
          scope === 'today'
            ? 'Hôm nay không còn từ nào đến hạn. Chuyển sang “3 ngày” để ôn trước.'
            : 'Bản này không còn thẻ nào.',
      });
      return;
    }
    lockLandscape();
    setSessionCards(list);
    setOrder(shuffled(list.map((_, i) => i)));
    setResults([]);
    setPushed(false);
    setMsg(null);
    setScreen('session');
  };

  /** Kiểm tra nhẹ cloud mỗi khi về trang chủ: chỉ đọc version + số thẻ để báo bản mới. */
  const checkCloud = async () => {
    if (!cfg) {
      setCloudInfo(null);
      return;
    }
    setChecking(true);
    try {
      const remote = await getFile(cfg);
      if (remote) {
        const f = parseSyncFile(remote.text);
        setCloudInfo({ version: f.version, count: f.cards.length });
      } else {
        setCloudInfo(null);
      }
    } catch {
      /* im lặng — nút Cập nhật thủ công sẽ báo lỗi cụ thể */
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (screen === 'home') checkCloud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, cfg]);

  /** Kéo bản mới nhất từ cloud về máy (dùng chung cho Học bài và Cập nhật). */
  const pullLatest = async (): Promise<SyncFile | null> => {
    if (!cfg) {
      setMsg({ kind: 'err', text: 'Chưa cấu hình repo — mở Cấu hình bên dưới.' });
      setShowCfg(true);
      return null;
    }
    setBusy(true);
    setMsg(null);
    setOfflineReady(false);
    try {
      const remote = await getFile(cfg);
      if (!remote) {
        setMsg({ kind: 'err', text: 'Cloud chưa có file sync. Mở app laptop và ấn Đồng bộ ngay trước.' });
        return null;
      }
      const file = parseSyncFile(remote.text);
      saveSnapshot(file);
      setSnapshot(file);
      setCloudInfo({ version: file.version, count: file.cards.length });
      return file;
    } catch (e) {
      const cached = loadSnapshot();
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Tải thất bại.' });
      if (cached && cached.file.cards.length > 0) setOfflineReady(true);
      return null;
    } finally {
      setBusy(false);
    }
  };

  /** Nút Học bài: kéo bản mới nhất rồi vào phiên. */
  const pullAndStart = async () => {
    if (!cfg) {
      setMsg({ kind: 'err', text: 'Chưa cấu hình repo — mở Cấu hình bên dưới.' });
      setShowCfg(true);
      return;
    }
    lockLandscape();
    const file = await pullLatest();
    if (!file) return;
    if (file.cards.length === 0) {
      setMsg({ kind: 'err', text: 'Bản trên cloud không còn thẻ nào đến hạn. Tuyệt vời!' });
      return;
    }
    startSession(file);
  };

  /** Nút Cập nhật: chỉ refresh danh sách, không vào phiên học. */
  const refreshOnly = async () => {
    const file = await pullLatest();
    if (file) {
      setMsg({ kind: 'ok', text: `Đã cập nhật: ${file.cards.length} thẻ (bản ${fmtVersion(file.version)}).` });
    }
  };

  const startOffline = () => {
    const cached = loadSnapshot();
    if (!cached) return;
    setSnapshot(cached.file);
    startSession(cached.file);
  };

  /**
   * Đẩy kết quả lên cloud: merge vào bản cloud MỚI NHẤT (lấy sha tươi) rồi PUT.
   * Gặp Conflict thì tải-merge-đẩy lại đúng 1 lần. Xong thì xóa pending.
   */
  const pushResults = async (res: SessionResult[]): Promise<boolean> => {
    if (!cfg) return false;
    if (res.length === 0) {
      setMsg({ kind: 'err', text: 'Chưa có kết quả nào để lưu.' });
      return false;
    }
    setBusy(true);
    setMsg(null);
    try {
      const remote = await getFile(cfg);
      const base: SyncFile | null = remote ? parseSyncFile(remote.text) : loadSnapshot()?.file ?? null;
      if (!base) throw new Error('Không có bản nào để lưu lên. Hãy Học bài trước.');
      const resMap = new Map(res.map((r) => [r.id, r]));
      const merge = (cards: SyncCard[]) =>
        cards.map((c) => {
          const r = resMap.get(c.id);
          return r
            ? { ...c, level: r.new_level, next_review: r.next_review, remembered: r.remembered }
            : { ...c, remembered: null };
        });

      const nowSec = Math.floor(Date.now() / 1000);
      const v1 = nextVersion(nowSec, base.version);
      const text1 = JSON.stringify({
        version: v1,
        updated_by: UPDATED_BY_PHONE,
        updated_at: new Date().toISOString(),
        cards: merge(base.cards),
      });
      try {
        await putFile(cfg, text1, remote?.sha ?? null, `sync: phone results v${v1}`);
        finishPush(text1);
      } catch (e) {
        if (!(e instanceof ConflictError)) throw e;
        const fresh = await getFile(cfg);
        if (!fresh) throw new Error('File cloud biến mất, hãy thử lại.');
        const freshFile = parseSyncFile(fresh.text);
        const v2 = nextVersion(Math.floor(Date.now() / 1000), freshFile.version);
        const text2 = JSON.stringify({
          version: v2,
          updated_by: UPDATED_BY_PHONE,
          updated_at: new Date().toISOString(),
          cards: merge(freshFile.cards),
        });
        await putFile(cfg, text2, fresh.sha, `sync: phone results v${v2} (retry)`);
        finishPush(text2);
      }
      return true;
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Lưu thất bại.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const finishPush = (text: string) => {
    const saved = JSON.parse(text) as SyncFile;
    saveSnapshot(saved);
    setSnapshot(saved);
    clearPending();
    setPending(null);
    setPushed(true);
    setMsg({
      kind: 'ok',
      text: `Đã lưu lên cloud (bản ${fmtVersion(saved.version)}). Mở app laptop để kéo về.`,
    });
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
    const c: GhConfig = { owner: fOwner.trim(), repo: fRepo.trim(), path: fPath.trim() || DEFAULT_PATH, token };
    saveConfig(c);
    setCfg(c);
    setFToken('');
    setMsg({ kind: 'ok', text: 'Đã lưu cấu hình trên máy này.' });
  };

  // ---------------- Màn học ----------------
  if (screen === 'session') {
    return (
      <Session
        cards={sessionCards}
        order={order}
        onExit={goHome}
        onFinish={(r) => {
          setResults(r);
          savePending(r);
          setPending(r);
          setPushed(false);
          setScreen('done');
          setMsg(null);
          // Chế độ 2: tự đẩy 1 lần ngay khi xong 1 lượt. Lỗi thì pending
          // vẫn giữ + nút thủ công bên dưới để lưu lại.
          pushResults(r);
        }}
        onSavePartial={(r) => pushResults(r)}
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
              <button className="btn btn-primary" disabled={busy} onClick={() => pushResults(results)}>
                {busy ? 'Đang lưu…' : 'Lưu lại lên cloud'}
              </button>
            )}
            <button className="btn btn-ghost" onClick={goHome}>
              Về trang chủ
            </button>
          </div>
          {!pushed && (
            <p className="tiny">Web đã tự lưu 1 lần khi bạn học xong — nút này để lưu lại nếu lúc đó lỗi mạng.</p>
          )}
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
              Bản đã lưu: <b>{snapshot.cards.length} thẻ</b> · bản {fmtVersion(snapshot.version)}
            </>
          ) : (
            'Chưa có bản lưu nào trên máy này.'
          )}
        </div>
        <div className="sub">
          {checking
            ? 'Đang kiểm tra cloud…'
            : cloudInfo
              ? <>☁ Cloud: <b>{cloudInfo.count} thẻ</b> · bản {fmtVersion(cloudInfo.version)}</>
              : cfg ? 'Chưa kiểm tra được cloud — bấm Cập nhật.' : null}
        </div>

        {cloudInfo && (!snapshot || cloudInfo.version > snapshot.version) && (
          <div className="msg col">
            Cloud có bản mới hơn bản trên máy ({cloudInfo.count} thẻ). Cập nhật rồi hãy học.
            <button
              className="btn btn-primary"
              style={{ minHeight: 48, marginTop: 8 }}
              disabled={busy}
              onClick={refreshOnly}
            >
              {busy ? 'Đang tải…' : 'Cập nhật ngay'}
            </button>
          </div>
        )}

        {pending && pending.length > 0 && (
          <div className="msg err col">
            Còn <b>{pending.length} kết quả chưa lưu</b> lên cloud.
            <button
              className="btn btn-primary"
              style={{ minHeight: 48, marginTop: 8 }}
              disabled={busy || !cfg}
              onClick={() => pushResults(pending)}
            >
              {busy ? 'Đang lưu…' : 'Đồng bộ ngay'}
            </button>
          </div>
        )}

        {msg && <div className={`msg ${msg.kind} col`}>{msg.text}</div>}

        <div className="col">
          {snapshot && snapshot.cards.length > 0 && (
            <div className="scope" role="group" aria-label="Phạm vi ôn">
              <button
                className={scope === 'today' ? 'on' : ''}
                onClick={() => setScope('today')}
              >
                Hôm nay ({todayCount})
              </button>
              <button
                className={scope === 'all' ? 'on' : ''}
                onClick={() => setScope('all')}
              >
                3 ngày ({snapshot.cards.length})
              </button>
            </div>
          )}
          <div className="row2">
            <button className="btn btn-primary grow" disabled={busy} onClick={pullAndStart}>
              {busy ? 'Đang tải…' : 'Học bài'}
            </button>
            <button
              className="btn"
              style={{ minWidth: 56 }}
              disabled={busy || !cfg}
              onClick={refreshOnly}
              title="Cập nhật danh sách từ cloud (không vào phiên học)"
              aria-label="Cập nhật danh sách"
            >
              🔄
            </button>
          </div>
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
                Owner (bấm để sửa)
                <input value={fOwner} onChange={(e) => setFOwner(e.target.value)} autoComplete="off" />
              </label>
              <label>
                Repo sync private (bấm để sửa)
                <input value={fRepo} onChange={(e) => setFRepo(e.target.value)} autoComplete="off" />
              </label>
            </div>
            <label>
              Đường dẫn file
              <input value={fPath} onChange={(e) => setFPath(e.target.value)} autoComplete="off" />
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
