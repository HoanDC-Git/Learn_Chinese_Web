import { useCallback, useEffect, useRef, useState } from 'react';
import {
  primeDeviceVoices,
  speakWithDeviceVoice,
  stopSpeech,
} from './tts';

export type TtsStatus = 'idle' | 'playing';

/**
 * Phát âm một từ Hán bằng giọng tiếng Trung của thiết bị.
 * Web không lưu file; engine đọc ngay trên máy nên nghe lại rất nhanh.
 */
export function useTts() {
  const [status, setStatus] = useState<TtsStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    primeDeviceVoices();
  }, []);

  const speak = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean) return;

    const id = ++runId.current;
    stopSpeech();
    setError(null);
    setStatus('playing');

    try {
      await speakWithDeviceVoice(clean);
    } catch (playbackError) {
      if (id !== runId.current) return;
      setError(
        playbackError instanceof Error
          ? playbackError.message
          : 'Không phát được âm thanh.',
      );
    } finally {
      if (id === runId.current) setStatus('idle');
    }
  }, []);

  const stop = useCallback(() => {
    runId.current += 1;
    stopSpeech();
    setStatus('idle');
  }, []);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4500);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(
    () => () => {
      runId.current += 1;
      stopSpeech();
    },
    [],
  );

  return { speak, stop, status, error };
}
