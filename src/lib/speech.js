// Голос: озвучка реплик собеседника (TTS) и распознавание ответов (STT).
// ТЗ v.02, блок 8: в прототипе достаточно базового браузерного распознавания.
// Целевая среда — Chrome на Android.

// Движок ищем в момент вызова, а не при загрузке модуля: так проще подменить его
// заглушкой в тестах и так честнее — браузер мог ещё не всё поднять.
function recognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function sttSupported() {
  return Boolean(recognitionCtor());
}

function ttsSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/* ------------------------------------------------------------------ */
/* TTS — собеседник говорит                                            */
/* ------------------------------------------------------------------ */

// Голоса в Chrome подгружаются асинхронно: сразу после загрузки страницы
// getVoices() часто возвращает пустой массив.
function getEnglishVoice() {
  if (!ttsSupported()) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  return (
    voices.find((v) => /^en[-_]US$/i.test(v.lang) && /female|samantha|zira|aria/i.test(v.name)) ||
    voices.find((v) => /^en[-_]US$/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    null
  );
}

/** Прогреть список голосов заранее, чтобы первая реплика не звучала «не тем» голосом. */
export function warmUpVoices() {
  if (!ttsSupported()) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    window.speechSynthesis.getVoices();
  });
}

/**
 * Озвучить текст. Промис резолвится, когда собеседник договорил, —
 * только после этого можно включать запись, иначе микрофон поймает сам синтезатор.
 * Ошибку не бросаем: если голос не сработал, текст на экране всё равно есть,
 * и цикл разговора не должен вставать (ТЗ, блок 6 — реплики дублируются текстом).
 */
export function speak(text) {
  return new Promise((resolve) => {
    if (!ttsSupported() || !text) {
      resolve({ spoken: false });
      return;
    }

    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    const voice = getEnglishVoice();
    if (voice) u.voice = voice;
    u.lang = voice?.lang || "en-US";
    u.rate = 0.95; // чуть медленнее обычного — слушатель уровня B1–B2
    u.pitch = 1;

    let done = false;
    const finish = (payload) => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      resolve(payload);
    };

    u.onend = () => finish({ spoken: true });
    u.onerror = () => finish({ spoken: false });

    // Подстраховка: на мобильном Chrome onend иногда не приходит вовсе.
    // Грубая оценка длительности: ~14 символов в секунду + запас.
    const guard = setTimeout(() => finish({ spoken: true }), text.length * 75 + 3000);

    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

/* ------------------------------------------------------------------ */
/* STT — пользователь отвечает                                         */
/* ------------------------------------------------------------------ */

export const STT_ERRORS = {
  UNSUPPORTED: "unsupported", // браузер не умеет распознавание
  MIC_DENIED: "mic-denied",   // нет доступа к микрофону
  NO_SPEECH: "no-speech",     // речь не распознана
  FAILED: "failed",           // прочий сбой движка
};

/**
 * Один сеанс распознавания.
 *
 * @param {(text:string)=>void} onPartial   промежуточный текст — показываем «на лету»
 * @param {(text:string)=>void} onFinal     финальный текст (реплика закончена)
 * @param {(code:string)=>void} onError     код из STT_ERRORS
 * @returns {{stop:()=>void, abort:()=>void}}
 */
export function listen({ onPartial, onFinal, onError }) {
  if (!sttSupported()) {
    onError?.(STT_ERRORS.UNSUPPORTED);
    return { stop() {}, abort() {} };
  }

  const Ctor = recognitionCtor();
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  // continuous=false: движок сам определяет конец реплики по паузе.
  // Пользователь при этом может закончить и вручную — кнопкой.
  rec.continuous = false;

  let finalText = "";
  let settled = false;
  let aborted = false;

  const settle = (fn, arg) => {
    if (settled) return;
    settled = true;
    fn?.(arg);
  };

  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    onPartial?.((finalText + " " + interim).trim());
  };

  rec.onerror = (e) => {
    if (aborted) return;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      settle(onError, STT_ERRORS.MIC_DENIED);
    } else if (e.error === "no-speech" || e.error === "audio-capture") {
      settle(onError, STT_ERRORS.NO_SPEECH);
    } else if (e.error !== "aborted") {
      settle(onError, STT_ERRORS.FAILED);
    }
  };

  // onend приходит и когда движок остановился сам, и когда мы вызвали stop().
  rec.onend = () => {
    if (aborted) return;
    const text = finalText.trim();
    if (text) settle(onFinal, text);
    else settle(onError, STT_ERRORS.NO_SPEECH);
  };

  try {
    rec.start();
  } catch {
    settle(onError, STT_ERRORS.FAILED);
  }

  return {
    // Пользователь закончил реплику: досказанное сохраняем и отправляем.
    stop() {
      try { rec.stop(); } catch { /* уже остановлен */ }
    },
    // Отмена без отправки (например, разговор прерван).
    abort() {
      aborted = true;
      try { rec.abort(); } catch { /* уже остановлен */ }
    },
  };
}

/**
 * Заранее спросить доступ к микрофону, чтобы отличить «пользователь запретил»
 * от «речь не распознана» ещё до первой попытки говорить.
 */
export async function ensureMicPermission() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    // Разрешение спросит сам движок распознавания.
    return { ok: true, unknown: true };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
