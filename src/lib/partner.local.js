// Локальный собеседник: работает в браузере, без ключей и без интернета.
// Интерфейс совпадает с lib/api.js (Claude), поэтому движки взаимозаменяемы.
//
// Живость даёт не длинный банк реплик, а три слоя поверх сценария:
//   1) прямой вопрос пользователя получает прямой ответ;
//   2) сфера работы подхватывается конкретной реакцией, а не «интересно»;
//   3) «не понял» → та же мысль повторяется проще, и разговор НЕ едет дальше.

import { SCENARIO } from "../config/scenario.js";
import { LOCAL_THINKING_MS } from "../config/engine.js";
import {
  ANSWERS,
  CLARIFY_LEAD_IN,
  NEUTRAL_REACTIONS,
  RUSSIAN_NUDGE,
  SHORT_ANSWER_REACTIONS,
  STAGES,
  WORK_REACTIONS,
} from "../config/partner-script.js";
import { GROWTHS, NOTHING_TO_REVIEW, WINS } from "../config/feedback-rules.js";

/* ------------------------------------------------------------------ */
/* Состояние одного разговора                                          */
/* ------------------------------------------------------------------ */

// Этап отделён от номера реплики: переспрос добавляет реплику, но не двигает сценарий.
let stageIndex = 0;
let neutralIndex = 0;
let shortIndex = 0;

export function resetPartner() {
  stageIndex = 0;
  neutralIndex = 0;
  shortIndex = 0;
}

/* ------------------------------------------------------------------ */
/* Разбор реплики пользователя                                         */
/* ------------------------------------------------------------------ */

const norm = (s) => (s || "").toLowerCase().replace(/[^\p{L}\p{N}\s'?]/gu, " ").replace(/\s+/g, " ").trim();
const words = (s) => norm(s).split(" ").filter(Boolean);

const hasCyrillic = (s) => /[Ѐ-ӿ]/.test(s || "");

// Просьба повторить / признание, что не понял.
const NOT_UNDERSTOOD =
  /\b(sorry|pardon|again|repeat|what do you mean|didn'?t (catch|understand|get)|say that again|what was that|slower|slowly|i don'?t understand)\b/;

// Вопрос: по знаку либо по вопросительному началу — распознавание часто съедает «?».
const QUESTION_START =
  /^(what|where|when|why|how|who|which|do|does|did|are|is|was|can|could|would|will|have|has|and you|what about)\b/;

function looksLikeQuestion(text) {
  const n = norm(text);
  if (!n) return false;
  return n.includes("?") || QUESTION_START.test(n);
}

// Прощание. Нужно и собеседнице (пора закругляться), и разбору.
// Осторожно: "nice to meet you" — это ПРИВЕТСТВИЕ. Прощание опознаём по прошедшему
// времени ("it was nice…") и по явным формулам, иначе разговор обрывается на второй реплике.
const CLOSING =
  /\b(bye|goodbye|see you( later| around)?|take care|have a (good|great|nice) (day|one|evening)|enjoy the rest|(it )?was (really |so |very )?(nice|great|good|lovely) (talking|meeting|to talk|to meet)|nice talking to you)\b/;

function pick(list, index) {
  return list[index % list.length];
}

/* ------------------------------------------------------------------ */
/* Реплика собеседницы                                                 */
/* ------------------------------------------------------------------ */

const delay = () => {
  const [lo, hi] = LOCAL_THINKING_MS;
  return new Promise((r) => setTimeout(r, lo + Math.random() * (hi - lo)));
};

/**
 * @param {{history: {role:string, content:string}[], aiTurn:number}} args
 * @returns {Promise<{text:string, ended:boolean}>}
 */
export async function askPartner({ history, aiTurn }) {
  await delay();

  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content || "";

  // Первая реплика: пользователь ещё ничего не сказал.
  if (aiTurn === 1 || !lastUser) {
    stageIndex = 1;
    return { text: STAGES[0].line, ended: false };
  }

  // Дальше собеседница физически не успеет попрощаться — закругляемся принудительно,
  // чтобы разговор не обрубился на середине лимитом из App.
  const forcedClose = aiTurn >= SCENARIO.aiTurns.max;

  // Ушли на русский — мягко возвращаем, сценарий стоит на месте (ТЗ, блок 2).
  if (!forcedClose && hasCyrillic(lastUser)) {
    return { text: RUSSIAN_NUDGE, ended: false };
  }

  // Не понял предыдущую реплику — повторяем её проще и НЕ двигаем сценарий.
  if (!forcedClose && NOT_UNDERSTOOD.test(norm(lastUser))) {
    const prev = STAGES[Math.max(0, stageIndex - 1)];
    return { text: `${CLARIFY_LEAD_IN} ${prev.simple}`, ended: false };
  }

  // Пользователь попрощался — продолжать сценарий было бы глухотой.
  // Не раньше третьей реплики: в самом начале это почти наверняка ложное срабатывание.
  const userSaidGoodbye = aiTurn >= 3 && CLOSING.test(norm(lastUser));
  if (forcedClose || userSaidGoodbye) stageIndex = STAGES.length - 1;

  const stage = STAGES[Math.min(stageIndex, STAGES.length - 1)];
  stageIndex = Math.min(stageIndex + 1, STAGES.length);

  const parts = [];

  // 1. Прямой вопрос — прямой ответ.
  const n = norm(lastUser);
  const answer = looksLikeQuestion(lastUser) ? ANSWERS.find((a) => a.match.test(n)) : null;
  if (answer) {
    parts.push(answer.reply);
  } else {
    // 2. Зацепка за сферу работы, иначе нейтральный подхват.
    const work = WORK_REACTIONS.find((w) => w.match.test(n));
    if (work) {
      parts.push(work.reply);
    } else if (words(lastUser).length <= 3) {
      parts.push(pick(SHORT_ANSWER_REACTIONS, shortIndex++));
    } else if (stage.id !== "close") {
      parts.push(pick(NEUTRAL_REACTIONS, neutralIndex++));
    }
  }

  parts.push(stage.line);

  return { text: parts.join(" "), ended: stage.id === "close" };
}

/* ------------------------------------------------------------------ */
/* Обратная связь                                                      */
/* ------------------------------------------------------------------ */

const GREETING = /\b(hi|hello|hey|good (morning|afternoon|evening)|nice to meet)\b/;
const INTRO = /\b(i'?m|i am|my name is|call me)\b/;

/** Короткая цитата: длинные реплики обрезаем, чтобы разбор не превращался в стену текста. */
function quote(text, max = 12) {
  const w = (text || "").trim().split(/\s+/);
  return w.length <= max ? w.join(" ") : w.slice(0, max).join(" ") + "…";
}

/**
 * @param {{history:{role:string,content:string}[], hintsUsed:number}} args
 * @returns {Promise<{done:string, grow:string, next:string}>}
 */
export async function askFeedback({ history, hintsUsed }) {
  await delay();

  const userTurns = history.filter((m) => m.role === "user").map((m) => m.content.trim()).filter(Boolean);
  if (!userTurns.length) return { ...NOTHING_TO_REVIEW };

  const byLength = [...userTurns].sort((a, b) => words(b).length - words(a).length);
  const longest = byLength[0];
  const last = userTurns[userTurns.length - 1];

  // «Hi, I'm Tania» и «Bye!» коротки по своей природе — ставить их в укор нечестно.
  // Ищем самый короткий среди содержательных реплик, а если таких нет — среди всех.
  const substantive = byLength.filter((t) => {
    const n = norm(t);
    return !GREETING.test(n) && !CLOSING.test(n);
  });
  const shortestPool = substantive.length ? substantive : byLength;
  const shortest = shortestPool[shortestPool.length - 1];

  const clarifyTurn = userTurns.find((t) => NOT_UNDERSTOOD.test(norm(t)));
  // «Sorry, could you say that again?» — это переспрос, а не встречный вопрос.
  // Иначе разбор хвалит за любопытство там, где человек просто не расслышал.
  const questionTurn = userTurns.find(
    (t) => looksLikeQuestion(t) && !NOT_UNDERSTOOD.test(norm(t))
  );
  const introTurn = userTurns.find((t) => INTRO.test(norm(t)));

  const stats = {
    turns: userTurns.length,
    hintsUsed,

    greeted: userTurns.some((t) => GREETING.test(norm(t))),

    introduced: Boolean(introTurn),
    introText: quote(introTurn),

    askedQuestion: Boolean(questionTurn),
    questionText: quote(questionTurn),

    clarified: Boolean(clarifyTurn),
    clarifyText: quote(clarifyTurn),

    longestWords: words(longest).length,
    longestText: quote(longest),
    shortestText: quote(shortest),

    avgWords: userTurns.reduce((sum, t) => sum + words(t).length, 0) / userTurns.length,

    closed: CLOSING.test(norm(last)),
    closeText: quote(last, 8),
  };

  const win = WINS.find((r) => r.when(stats));
  const growth = GROWTHS.find((r) => r.when(stats));

  return {
    done: win.text(stats),
    grow: growth.text(stats),
    next: growth.next(stats),
  };
}
