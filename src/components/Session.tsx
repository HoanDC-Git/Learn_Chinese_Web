import { useMemo, useState } from 'react';
import type { SessionResult, SyncCard } from '../lib/sync';
import { calculateNextReview } from '../lib/sync';

interface SessionProps {
  cards: SyncCard[];
  order: number[]; // index vào cards, đã shuffle
  onExit: () => void;
  onFinish: (results: SessionResult[]) => void;
}

/**
 * Phiên ôn 1 cột (mirror app laptop): tap để lật nghĩa -> pinyin -> chữ,
 * tới bước chữ mới hiện Nhớ/Quên. Undo quay lại thẻ trước ở trạng thái mở full.
 */
export function Session({ cards, order, onExit, onFinish }: SessionProps) {
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState(0); // 0: nghĩa, 1: +pinyin, 2: +chữ
  const [results, setResults] = useState<SessionResult[]>([]);

  const total = order.length;
  const card = cards[order[idx]];
  const canUndo = results.length > 0 && step === 0;

  const done = useMemo(
    () => results.filter((r) => r.remembered).length,
    [results],
  );

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

  const quit = () => {
    if (window.confirm('Thoát phiên học? Kết quả chưa lưu sẽ mất.')) onExit();
  };

  return (
    <div className="app">
      <div className="topbar">
        <button className="icon-btn" onClick={quit} aria-label="Thoát">
          ✕
        </button>
        <span className="counter">
          Thẻ {Math.min(idx + 1, total)}/{total} · {done} nhớ
        </span>
        <button className="icon-btn" onClick={undo} disabled={!canUndo} aria-label="Hoàn tác">
          ↩
        </button>
      </div>

      <div className="segments" aria-hidden>
        {order.map((_, i) => (
          <i key={i} className={i < results.length ? 'done' : ''} />
        ))}
      </div>

      <div className="stage" onClick={() => setStep((s) => Math.min(s + 1, 2))}>
        <div className={step === 0 ? 'meaning' : 'meaning dim'}>{card.meaning || 'Chưa có nghĩa'}</div>
        {step >= 1 && <div className="pinyin">{card.pinyin || '—'}</div>}
        {step >= 2 && <div className="hanzi">{card.hanzi}</div>}
        {step < 2 && <div className="hint">Chạm để {step === 0 ? 'xem pinyin' : 'xem chữ Hán'}</div>}
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
