import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Loader2 } from 'lucide-react';
import { cn } from '../utils/cn';

/* Record a voice note via MediaRecorder and hand the parent a File + duration.
 * The parent uploads it (server transcodes to MP3) and sends the chat message.
 *
 * Cross-browser: Chrome/Android record audio/webm(opus), Safari records
 * audio/mp4(aac). We feature-detect the first supported container and let the
 * backend normalise to MP3 so playback works everywhere. */

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

function extFor(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('aac')) return 'aac';
  if (mime.includes('ogg')) return 'ogg';
  return 'bin';
}

export const voiceRecordingSupported = (): boolean =>
  typeof MediaRecorder !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices &&
  !!navigator.mediaDevices.getUserMedia;

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceRecorder({
  onRecorded,
  onRecordingChange,
  uploading = false,
  disabled = false,
}: {
  onRecorded: (file: File, durationSec: number) => void;
  onRecordingChange?: (recording: boolean) => void;
  uploading?: boolean;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // On unmount (e.g. navigating away / Back mid-recording) cancel first so the
  // onstop handler discards the clip instead of uploading an abandoned recording,
  // and explicitly stop the recorder so it can't leak on browsers that don't
  // auto-stop when the track ends.
  useEffect(
    () => () => {
      cancelledRef.current = true;
      try {
        recorderRef.current?.stop();
      } catch {
        /* noop */
      }
      cleanupStream();
    },
    [],
  );

  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

  const start = async () => {
    if (!voiceRecordingSupported() || disabled || uploading) return;
    const mime = pickMime();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // If the mic track ends on its own — permission revoked, device unplugged,
      // an incoming call grabbing the mic — treat it as cancel: discard the
      // partial clip and reset the UI (track.stop() we call ourselves does NOT
      // fire 'ended', so this only catches genuine external interruptions).
      stream.getAudioTracks().forEach((t) => {
        t.onended = () => finish(true);
      });
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        // Always reset the recording UI, however the recorder stopped — otherwise
        // an external stop leaves the parent's input/send hidden forever.
        setRecording(false);
        const type = rec.mimeType || mime || 'audio/webm';
        const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const blob = new Blob(chunksRef.current, { type });
        cleanupStream();
        if (!cancelledRef.current && blob.size > 0) {
          const file = new File([blob], `voice.${extFor(type)}`, { type });
          onRecorded(file, durationSec);
        }
      };
      recorderRef.current = rec;
      rec.start();
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      cleanupStream();
      alert('Не удалось получить доступ к микрофону. Разрешите доступ в настройках браузера.');
    }
  };

  const finish = (cancel: boolean) => {
    cancelledRef.current = cancel;
    setRecording(false);
    try {
      recorderRef.current?.stop();
    } catch {
      cleanupStream();
    }
  };

  if (!voiceRecordingSupported()) return null;

  if (uploading) {
    return (
      <div className="w-12 h-12 rounded-full flex items-center justify-center bg-primary/10 text-primary/50 flex-shrink-0">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  if (recording) {
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => finish(true)}
          aria-label="Отменить запись"
          className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
        >
          <Trash2 size={16} />
        </button>
        <span className="flex items-center gap-1.5 text-xs font-bold text-red-500 tabular-nums">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {fmt(elapsed)}
        </span>
        <button
          type="button"
          onClick={() => finish(false)}
          aria-label="Остановить и отправить"
          className="w-12 h-12 rounded-full flex items-center justify-center bg-primary text-primary-inv hover:scale-105 active:scale-95 transition-all"
        >
          <Square size={16} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      aria-label="Записать голосовое сообщение"
      className={cn(
        'w-12 h-12 rounded-full flex items-center justify-center transition-all flex-shrink-0',
        disabled ? 'bg-primary/10 text-primary/30' : 'bg-primary/10 text-primary hover:bg-primary/20 active:scale-95',
      )}
    >
      <Mic size={18} />
    </button>
  );
}

export function AudioMessage({ src, dark = false }: { src: string; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      <Mic size={16} className={cn('flex-shrink-0', dark ? 'text-primary-inv/70' : 'text-primary/50')} />
      {/* Native controls play the MP3 on every browser, incl. iOS Safari. */}
      <audio controls src={src} preload="metadata" className="h-9 max-w-[220px] w-full" />
    </div>
  );
}
