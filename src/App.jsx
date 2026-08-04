// TalkReady — первый прототип. ТЗ v.02, блок 9 («Логика работы»).
// Один сценарий, один собеседник, голосовой цикл, подсказка по кнопке,
// завершение и короткая обратная связь из трёх частей.

import { useCallback, useEffect, useRef, useState } from "react";
import { SCENARIO } from "./config/scenario.js";
import { pickClarification, pickScaffold } from "./config/hints.js";
import { askFeedback, askPartner, isOffline, resetPartner } from "./lib/engine.js";
import {
  ensureMicPermission,
  listen,
  speak,
  sttSupported,
  stopSpeaking,
  STT_ERRORS,
  warmUpVoices,
} from "./lib/speech.js";

// Сообщения о сбоях (ТЗ, блок 9, «Обработка сбоев»).
const ERRORS = {
  noSpeech: {
    kind: "stt",
    title: "Не удалось распознать ответ.",
    body: "Попробуйте сказать ещё раз.",
  },
  mic: {
    kind: "mic",
    title: "Нет доступа к микрофону.",
    body: "Разрешите доступ к микрофону, чтобы говорить с собеседником.",
    how: "В адресной строке нажмите на замок → «Разрешения» → «Микрофон» → разрешить, затем повторите.",
  },
  unsupported: {
    kind: "mic",
    title: "Браузер не умеет распознавать речь.",
    body: "Откройте тренажёр в Chrome — на Android или на компьютере.",
  },
};

export default function App() {
  const [phase, setPhase] = useState("intro"); // intro | talk | feedback

  const [messages, setMessages] = useState([]);          // то, что видно на экране
  const historyRef = useRef([]);                          // то, что уходит в модель
  const [aiTurns, setAiTurns] = useState(0);
  const aiTurnsRef = useRef(0);

  const [turnState, setTurnState] = useState("idle");     // idle | thinking | speaking | listening
  const [partial, setPartial] = useState("");             // распознаётся прямо сейчас
  const [error, setError] = useState(null);

  const [hint, setHint] = useState(null);
  const [hintPicker, setHintPicker] = useState(false);
  const hintsUsedRef = useRef(0);
  const usedHintsRef = useRef({ clar: [], scaf: [] });

  const [feedback, setFeedback] = useState(null);
  const [feedbackError, setFeedbackError] = useState(null);

  // Браузер показывает запрос доступа к микрофону — ждём ответа пользователя.
  const [askingMic, setAskingMic] = useState(false);

  const recRef = useRef(null);
  const dialogRef = useRef(null);
  // Разговор завершён — не даём асинхронному циклу продолжиться после «Завершить».
  const overRef = useRef(false);

  useEffect(() => {
    warmUpVoices();
    return () => {
      stopSpeaking();
      recRef.current?.abort();
    };
  }, []);

  // Лента всегда прокручена к последней реплике.
  useEffect(() => {
    const el = dialogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, partial, hint, turnState]);

  /* ---------------- разговор ---------------- */

  const runPartnerTurn = useCallback(async () => {
    setError(null);
    setHint(null);
    setHintPicker(false);
    setTurnState("thinking");

    const nextTurn = aiTurnsRef.current + 1;

    let reply;
    try {
      reply = await askPartner({ history: historyRef.current, aiTurn: nextTurn });
    } catch (e) {
      if (overRef.current) return;
      // Уже показанный диалог не трогаем — только предлагаем повторить.
      setTurnState("idle");
      setError({
        kind: "api",
        title: "Собеседник не ответил.",
        body: e.message || "Сервис временно недоступен.",
        retry: "partner",
      });
      return;
    }

    if (overRef.current) return;

    historyRef.current = [...historyRef.current, { role: "assistant", content: reply.text }];
    aiTurnsRef.current = nextTurn;
    setAiTurns(nextTurn);
    setMessages((m) => [...m, { who: "partner", text: reply.text }]);

    setTurnState("speaking");
    await speak(reply.text);

    if (overRef.current) return;

    if (reply.ended || nextTurn >= SCENARIO.aiTurns.max) {
      finishConversation();
    } else {
      startListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = useCallback(() => {
    setPartial("");
    setError(null);
    setTurnState("listening");

    recRef.current = listen({
      onPartial: setPartial,
      onFinal: (text) => {
        recRef.current = null;
        setPartial("");
        historyRef.current = [...historyRef.current, { role: "user", content: text }];
        setMessages((m) => [...m, { who: "me", text }]);
        runPartnerTurn();
      },
      onError: (code) => {
        recRef.current = null;
        setPartial("");
        setTurnState("idle");
        // Разговор не продолжается автоматически — ждём действия пользователя.
        if (code === STT_ERRORS.MIC_DENIED) setError(ERRORS.mic);
        else if (code === STT_ERRORS.UNSUPPORTED) setError(ERRORS.unsupported);
        else setError(ERRORS.noSpeech);
      },
    });
  }, [runPartnerTurn]);

  const finishConversation = useCallback(async () => {
    if (overRef.current) return;
    overRef.current = true;
    recRef.current?.abort();
    recRef.current = null;
    stopSpeaking();
    setTurnState("idle");
    setPhase("feedback");
    loadFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFeedback = useCallback(async () => {
    setFeedback(null);
    setFeedbackError(null);

    try {
      setFeedback(
        await askFeedback({
          history: historyRef.current,
          hintsUsed: hintsUsedRef.current,
        })
      );
    } catch (e) {
      setFeedbackError(e.message || "Не удалось получить обратную связь.");
    }
  }, []);

  const beginConversation = useCallback(async () => {
    if (!sttSupported()) {
      setError(ERRORS.unsupported);
      return;
    }
    setError(null);
    setAskingMic(true);
    const perm = await ensureMicPermission();
    setAskingMic(false);
    if (!perm.ok) {
      setError(ERRORS.mic);
      return;
    }
    overRef.current = false;
    resetPartner();
    setPhase("talk");
    runPartnerTurn();
  }, [runPartnerTurn]);

  const restart = useCallback(() => {
    recRef.current?.abort();
    recRef.current = null;
    stopSpeaking();

    historyRef.current = [];
    aiTurnsRef.current = 0;
    hintsUsedRef.current = 0;
    usedHintsRef.current = { clar: [], scaf: [] };

    setMessages([]);
    setAiTurns(0);
    setPartial("");
    setHint(null);
    setHintPicker(false);
    setFeedback(null);
    setFeedbackError(null);
    setError(null);
    overRef.current = false;
    resetPartner();
    setPhase("talk");
    runPartnerTurn();
  }, [runPartnerTurn]);

  /* ---------------- кнопка записи ---------------- */

  const micTap = useCallback(() => {
    if (turnState === "listening") {
      recRef.current?.stop(); // пользователь закончил реплику
    } else if (turnState === "idle") {
      startListening();
    }
  }, [turnState, startListening]);

  /* ---------------- подсказка ---------------- */

  const showHint = useCallback(
    (kind) => {
      // Читать подсказку и одновременно говорить нельзя — снимаем запись без отправки.
      if (recRef.current) {
        recRef.current.abort();
        recRef.current = null;
        setPartial("");
        setTurnState("idle");
      }

      const used = usedHintsRef.current;
      let picked;
      if (kind === "clar") {
        picked = pickClarification({ usedIds: used.clar });
        used.clar.push(picked.id);
      } else {
        picked = pickScaffold({
          aiTurn: aiTurnsRef.current,
          wrappingUp: aiTurnsRef.current >= SCENARIO.aiTurns.min,
          usedIds: used.scaf,
        });
        used.scaf.push(picked.id);
      }

      hintsUsedRef.current += 1; // фиксируем для обратной связи
      setHint({ kind, ...picked });
      setHintPicker(false);
    },
    []
  );

  /* ---------------- экраны ---------------- */

  if (phase === "intro") {
    return (
      <div className="app">
        <div className="screen intro">
          <div>
            <div className="brand">TalkReady</div>
            <h1>{SCENARIO.title}</h1>
          </div>

          <div className="intro-task">{SCENARIO.task}</div>

          <div>
            <div className="section-label">Что стоит успеть</div>
            <ul className="goals">
              {SCENARIO.miniGoals.map((g, i) => (
                <li key={g}>
                  <span className="num">{i + 1}</span>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>

          {error && <Notice error={error} onRetry={beginConversation} />}

          <div className="spacer" />

          <button className="btn btn-primary" onClick={beginConversation} disabled={askingMic}>
            {askingMic ? "Разрешите доступ к микрофону…" : "Начать разговор"}
          </button>
          <div className="footnote">
            {askingMic
              ? "Браузер спрашивает разрешение — нажмите «Разрешить»."
              : "Нужен микрофон и Chrome. Это репетиция — ошибаться здесь можно."}
          </div>
          {isOffline && (
            <div className="footnote mode">
              Демо-режим: собеседницу играет сценарий в браузере, без интернета и ключей.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === "feedback") {
    return (
      <div className="app">
        <div className="screen feedback">
          <h2>Разговор окончен</h2>

          {!feedback && !feedbackError && (
            <div className="card">
              <p>Смотрю, что получилось…</p>
            </div>
          )}

          {feedbackError && (
            <>
              <Notice
                error={{
                  kind: "api",
                  title: "Не удалось собрать обратную связь.",
                  body: feedbackError,
                }}
              />
              <button className="btn btn-secondary" onClick={loadFeedback}>
                Повторить
              </button>
            </>
          )}

          {feedback && (
            <>
              <div className="card win">
                <div className="label">Что получилось</div>
                <p>{feedback.done}</p>
              </div>
              <div className="card">
                <div className="label">Одна зона роста</div>
                <p>{feedback.grow}</p>
              </div>
              <div className="card">
                <div className="label">На следующий раз</div>
                <p>{feedback.next}</p>
              </div>
            </>
          )}

          <div className="spacer" />

          <button className="btn btn-primary" onClick={restart}>
            Попробовать ещё раз
          </button>
          <div className="footnote">
            Разбор — только про этот разговор, а не про твой уровень английского.
          </div>
        </div>
      </div>
    );
  }

  // phase === "talk"
  const statusText =
    turnState === "thinking"
      ? "Собеседник думает…"
      : turnState === "speaking"
      ? "Собеседник говорит"
      : turnState === "listening"
      ? "Слушаю вас"
      : "Ваша очередь";

  const micDisabled = turnState === "thinking" || turnState === "speaking";

  return (
    <div className="app">
      <div className="topbar">
        <h2>{SCENARIO.partner.name} · {SCENARIO.title}</h2>
        <span className="turns">
          {aiTurns}/{SCENARIO.aiTurns.max}
        </span>
      </div>

      <div className="dialog" ref={dialogRef}>
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.who === "me" ? "me" : "partner"}`}>
            <span className="who">{m.who === "me" ? "Вы" : SCENARIO.partner.name}</span>
            {m.text}
          </div>
        ))}

        {partial && (
          <div className="bubble me draft">
            <span className="who">Вы</span>
            {partial}
          </div>
        )}

        {hint && <Hint hint={hint} />}
      </div>

      <div className={`status ${turnState}`}>
        <span className="dot" />
        {statusText}
      </div>

      {error && (
        <Notice
          error={error}
          onRetry={error.retry === "partner" ? runPartnerTurn : undefined}
        />
      )}

      <div className="controls">
        <button
          className={`mic ${turnState === "listening" ? "recording" : ""}`}
          onClick={micTap}
          disabled={micDisabled}
          aria-label={turnState === "listening" ? "Закончить реплику" : "Говорить"}
        >
          <span className="glyph">{turnState === "listening" ? "■" : "🎙"}</span>
          <span>{turnState === "listening" ? "Готово" : "Говорить"}</span>
        </button>

        {hintPicker ? (
          <div className="btn-row">
            <button className="btn btn-quiet" onClick={() => showHint("clar")}>
              Не понял(а)
            </button>
            <button className="btn btn-quiet" onClick={() => showHint("scaf")}>
              Не знаю, как ответить
            </button>
          </div>
        ) : (
          <button
            className="btn btn-secondary"
            onClick={() => setHintPicker(true)}
            disabled={turnState === "thinking"}
          >
            Мне нужна подсказка
          </button>
        )}

        <button className="btn btn-quiet" onClick={finishConversation}>
          Завершить разговор
        </button>
      </div>
    </div>
  );
}

/* ---------------- мелкие части ---------------- */

function Hint({ hint }) {
  return (
    <div className="hint">
      <div className="hint-kind">
        {hint.kind === "clar" ? "Если не понял(а)" : "Опора для ответа"}
      </div>
      {hint.kind === "clar" ? (
        <>
          <div className="hint-frame">{hint.phrase}</div>
          {hint.note && <div className="hint-note">{hint.note}</div>}
        </>
      ) : (
        <>
          <div className="hint-intent">{hint.intent}</div>
          <div className="hint-frame">{hint.frame}</div>
          <div className="hint-example">Например: {hint.example}</div>
        </>
      )}
    </div>
  );
}

function Notice({ error, onRetry }) {
  return (
    <div className="notice">
      <strong>{error.title}</strong>
      {error.body}
      {error.how && <div className="how">{error.how}</div>}
      {onRetry && (
        <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}
