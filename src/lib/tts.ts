/**
 * TTS cho web: dùng giọng tiếng Trung có sẵn trên thiết bị (Web Speech API).
 *
 * - Không cần server, không tải audio về nên không lưu file nào.
 * - Điện thoại đã cài giọng Trung (Google TTS / Ting-Ting) sẽ đọc offline;
 *   nghe lại gần như tức thì vì engine xử lý ngay trên máy.
 * - Edge TTS không gọi trực tiếp được từ trình duyệt điện thoại: Microsoft
 *   chặn WebSocket theo User-Agent (chỉ nhận Edge trên Windows).
 */

let cachedVoice: SpeechSynthesisVoice | null | undefined;
let activeRequest: { utterance: SpeechSynthesisUtterance; settle: () => void } | null =
  null;

function getSynth(): SpeechSynthesis | null {
  return typeof window === 'undefined' ? null : window.speechSynthesis ?? null;
}

function pickChineseVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;

  const synth = getSynth();
  if (!synth) return null;

  const voices = synth.getVoices();
  if (voices.length === 0) {
    // Một số trình duyệt nạp danh sách giọng bất đồng bộ.
    return null;
  }

  const chinese = voices.filter((voice) => /^zh([-_]|$)/i.test(voice.lang));
  const mainland = chinese.filter((voice) => /^zh[-_]cn/i.test(voice.lang));

  cachedVoice =
    mainland.find((voice) => voice.localService) ??
    mainland[0] ??
    chinese.find((voice) => voice.localService) ??
    chinese[0] ??
    null;

  return cachedVoice;
}

let voicesPrimed = false;

/** Gọi sớm (lúc mở app) để trình duyệt nạp sẵn danh sách giọng. */
export function primeDeviceVoices(): void {
  if (voicesPrimed) return;

  const synth = getSynth();
  if (!synth) return;

  voicesPrimed = true;
  pickChineseVoice();
  synth.addEventListener?.('voiceschanged', () => {
    cachedVoice = undefined;
    pickChineseVoice();
  });
}

/** Dừng câu đang đọc (nếu có). */
export function stopSpeech(): void {
  const synth = getSynth();
  const current = activeRequest;
  activeRequest = null;

  try {
    synth?.cancel();
  } catch {
    /* trình duyệt không hỗ trợ */
  }

  current?.settle();
}

/** Đọc một từ bằng giọng thiết bị. Promise xong khi đọc hết hoặc bị dừng. */
export function speakWithDeviceVoice(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const synth = getSynth();
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
      reject(new Error('Thiết bị không hỗ trợ đọc âm thanh.'));
      return;
    }

    const previous = activeRequest;
    activeRequest = null;
    try {
      synth.cancel();
    } catch {
      /* bỏ qua */
    }
    previous?.settle();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickChineseVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'zh-CN';
    utterance.rate = 0.9;
    utterance.pitch = 1;

    let settled = false;
    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (activeRequest?.utterance === utterance) activeRequest = null;
      if (error) reject(error);
      else resolve();
    };

    activeRequest = { utterance, settle: () => settle() };

    utterance.onend = () => settle();
    utterance.onerror = (event) => {
      if (event.error === 'canceled' || event.error === 'interrupted') {
        settle();
      } else if (event.error === 'not-allowed') {
        settle(new Error('Trình duyệt chặn phát âm thanh — bấm loa lại nhé.'));
      } else {
        settle(new Error('Thiết bị không đọc được từ này.'));
      }
    };

    try {
      synth.speak(utterance);
    } catch {
      settle(new Error('Không phát được âm thanh.'));
    }
  });
}
