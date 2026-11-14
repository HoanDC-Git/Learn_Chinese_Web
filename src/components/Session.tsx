import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SessionResult, SyncCard } from '../lib/sync';
import { calculateNextReview, getMasteryLabel } from '../lib/sync';
import { stopSpeech } from '../lib/tts';
import { useTts } from '../lib/useTts';
import { Icon } from './Icon';

// Chữ Hán co theo độ dài để không tràn 2 bên: vừa khít chiều rộng stage,
// trần 60px, sàn 36px (vòng hiệu chỉnh có thể xuống 28px cho cụm rất dài).
// Hệ số 1.08 bù letter-spacing 0.06em + biên an toàn metrics font.
const HANZI_MAX = 60;
const HANZI_MIN = 36;
const HANZI_FLOOR = 28;

interface SessionProps {
  cards: SyncCard[];
  order: number[]; // index vào cards, đã shuffle
  /** Ấn X giữa phiên: App hiện dialog Lưu & thoát / Thoát không lưu / Ở lại. */
  onRequestExit: (results: SessionResult[]) => void;
  onFinish: (results: SessionResult[]) => void;
  /** Đẩy kết quả dở dang lên cloud (không rời phiên). Trả true khi xong. */
  onSavePartial: (results: SessionResult[]) => Promise<boolean>;
}

/**
 * Phiên ôn 1 cột (mirror app laptop): tap để lật nghĩa -> pinyin -> chữ,
 * tới bước chữ mới hiện Nhớ/Quên. Undo quay lại thẻ trước ở trạng thái mở full.
 */
export function Session({ cards, order, onRequestExit, onFinish, onSavePartial }: SessionProps) {
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState(0); // 0: nghĩa, 1: +pinyin, 2: +chữ
  const [results, setResults] = useState<SessionResult[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const hanziRef = useRef<HTMLDivElement>(null);
  const [hanziPx, setHanziPx] = useState(HANZI_MAX);
  const tts = useTts();

  // Đổi thẻ thì dừng audio đang đọc.
  useEffect(() => () => stopSpeech(), [idx]);

  // Lượt 1 (trước khi vẽ): ước cỡ từ độ dài, đã bù tracking + biên font.
  useLayoutEffect(() => {
    const w = (stageRef.current?.clientWidth ?? 800) - 32;
    const n = Math.max(cards[order[idx]]?.hanzi.length ?? 1, 1);
    setHanziPx(Math.max(HANZI_MIN, Math.min(HANZI_MAX, Math.floor(w / (n * 1.08)))));
  }, [cards, order, idx]);

  // Lượt 2 (sau khi vẽ, chỉ khi đã lộ chữ): đo tràn thật và co dần tới vừa.
  // Đảm bảo không tràn bất kể font nào đang render (FandolKai/fallback).
  useLayoutEffect(() => {
    if (step < 2) return;
    const el = hanziRef.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth + 1 && hanziPx > HANZI_FLOOR) {
      setHanziPx((px) => Math.max(HANZI_FLOOR, px - 2));
    }
  });

  const total = order.length;
  const card = cards[order[idx]];
  const canUndo = results.length > 0 && step === 0;
  const [saveTick, setSaveTick] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  const saveNow = async () => {
    if (results.length === 0 || saveTick === 'saving') return;
    setSaveTick('saving');
    const ok = await onSavePartial(results);
    setSaveTick(ok ? 'done' : 'error');
    setTimeout(() => setSaveTick('idle'), 2500);
  };

  const done = useMemo(
    () => results.filter((r) => r.remembered).length,
    [results],
  );
  const forgotten = results.length - done;
  const remaining = total - results.length;

  if (!card) return null;

  const grade = (remembered: boolean) => {
    const r = calculateNextReview(card.level, remembered);
    const next = [...results, { id: card.id, remembered, new_level: r.new_level, next_review: r.next_review }];
    setResults(next);
    if (idx + 1 >= total) {
      onFinish(next);
    } else {
      setIdx(idx + 1);
      setStep(0);
    }
  };

  const undo = () => {
    if (!canUndo) return;
    setResults(results.slice(0, -1));
    setIdx(idx - 1);
    setStep(2);
  };

  const quit = () => onRequestExit(results);

  return (
    <div className="session">
      <div className="topbar">
        <button className="icon-btn" onClick={quit} aria-label="Thoát">
          <Icon name="close" size={18} />
        </button>
        <span className="counter">
          Còn {remaining} thẻ · <span className="c-remember">Nhớ {done}</span> · <span className="c-forget">Quên {forgotten}</span>
        </span>
        <button
          className="icon-btn"
          onClick={saveNow}
          disabled={results.length === 0 || saveTick === 'saving'}
          aria-label="Lưu lên cloud"
          title={saveTick === 'done' ? 'Đã lưu ✓' : saveTick === 'error' ? 'Lưu lỗi, bấm lại' : 'Lưu tiến trình lên cloud'}
          style={saveTick === 'done' ? { borderColor: 'var(--emerald-line)', color: 'var(--emerald-fg)' } : saveTick === 'error' ? { borderColor: 'var(--rose-line)', color: 'var(--rose-fg)' } : undefined}
        >
          {saveTick === 'saving' ? (
            <Icon name="sync" size={18} spin />
          ) : saveTick === 'done' ? (
            <Icon name="cloudDone" size={18} />
          ) : saveTick === 'error' ? (
            <Icon name="cloudOff" size={18} />
          ) : (
            <Icon name="cloudUpload" size={18} />
          )}
        </button>
        <button className="icon-btn" onClick={undo} disabled={!canUndo} aria-label="Hoàn tác">
          <Icon name="undo" size={18} />
        </button>
      </div>

      <div className="segments" aria-hidden>
        {order.map((_, i) => (
          <i key={i} className={i < results.length ? 'done' : ''} />
        ))}
      </div>

      <div ref={stageRef} className="stage" onClick={() => setStep((s) => Math.min(s + 1, 2))}>
        <button
          className={'icon-btn speak-btn' + (tts.status !== 'idle' ? ' active' : '')}
          onClick={(e) => {
            e.stopPropagation();
            void tts.speak(card.hanzi);
          }}
          aria-label="Nghe phát âm"
          title="Nghe phát âm"
        >
          <Icon name="volumeUp" size={18} />
        </button>
        <div className={`lvl lvl-${card.level}`}>Lv{card.level} · {getMasteryLabel(card.level)}</div>
        <div className={step === 0 ? 'meaning' : 'meaning dim'}>{card.meaning || 'Chưa có nghĩa'}</div>
        {step >= 1 && <div className="pinyin">{card.pinyin || '—'}</div>}
        {step >= 2 && (
          <div ref={hanziRef} className="hanzi" style={{ fontSize: hanziPx }}>
            {card.hanzi}
          </div>
        )}
        {step < 2 && <div className="hint">Chạm để {step === 0 ? 'xem pinyin' : 'xem chữ Hán'}</div>}
        {tts.error && (
          <div className="tts-error" role="alert">
            {tts.error}
          </div>
        )}
      </div>

      <div className="actions">
        {step < 2 ? (
          <button className="btn btn-next" onClick={() => setStep((s) => Math.min(s + 1, 2))}>
            {step === 0 ? 'Xem pinyin' : 'Xem chữ Hán'}
          </button>
        ) : (
          <>
            <button className="btn btn-forget" onClick={() => grade(false)}>
              Quên
            </button>
            <button className="btn btn-remember" onClick={() => grade(true)}>
              Nhớ
            </button>
          </>
        )}
      </div>
    </div>
  );
}
