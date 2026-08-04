// Локальный собеседник: работает в браузере, без ключей и без интернета.
// Интерфейс совпадает с lib/api.js (Claude), поэтому движки взаимозаменяемы.
//
// Это диалоговый менеджер, а не линейный сценарий. На каждом шаге он:
//   1) разбирает реплику человека — вопрос? тема? имя? односложно? не понял?
//   2) реагирует на СОДЕРЖАНИЕ: отвечает на вопрос или подхватывает тему;
//   3) выбирает следующий ход из тех, что ещё уместны.
//
// Ключевое отличие от первой версии: тема, которую человек закрыл сам,
// больше не всплывает. Раньше Maya спрашивала «what do you do?» после того,
// как ей уже рассказали про работу, — отсюда ощущение разговора невпопад.

import { SCENARIO } from "../config/scenario.js";
import { LOCAL_THINKING_MS } from "../config/engine.js";
import {
  ANSWERS,
  CLARIFY_LEAD_IN,
  CLOSE_WITH_NAME,
  MOVES,
  NAME_ACK,
  NEUTRAL_REACTIONS,
  NOT_A_NAME,
  RUSSIAN_NUDGE,
  SHORT_ANSWER_REACTIONS,
  TOPIC_REACTIONS,
  TOPICS,
  UNKNOWN_ANSWERS,
  WORK_REACTIONS,
} from "../config/partner-script.js";
import { GROWTHS, NOTHING_TO_REVIEW, WINS } from "../config/feedback-rules.js";

/* ------------------------------------------------------------------ */
/* Состояние разговора                                                 */
/* ------------------------------------------------------------------ */

let state = freshState();

function freshState() {
  return {
    name: null,          // имя человека, если удалось расслышать
    nameGreeted: false,  // уже отреагировали на имя
    covered: new Set(),  // темы, которые человек закрыл сам
    usedMoves: new Set(),
    lastMove: null,      // на что человек сейчас отвечает
    retriedMove: null,   // переспрашивали не больше одного раза
    counters: { neutral: 0, short: 0, unknown: 0 },
    turn: 0,
  };
}

export function resetPartner() {
  state = freshState();
}

/* ------------------------------------------------------------------ */
/* Разбор реплики человека                                             */
/* ------------------------------------------------------------------ */

const norm = (s) =>
  (s || "").toLowerCase().replace(/[^\p{L}\p{N}\s'?]/gu, " ").replace(/\s+/g, " ").trim();
const words = (s) => norm(s).split(" ").filter(Boolean);

const hasCyrillic = (s) => /[Ѐ-ӿ]/.test(s || "");

const NOT_UNDERSTOOD =
  /\b(sorry|pardon|again|repeat|what do you mean|didn'?t (catch|understand|get)|say that again|what was that|slower|slowly|i don'?t understand)\b/;

const QUESTION_START =
  /^(what|where|when|why|how|who|which|do|does|did|are|is|was|can|could|would|will|have|has|and you|what about)\b/;

// Прощание. "nice to meet you" — это ПРИВЕТСТВИЕ, ловим только прошедшее время и явные формулы.
const CLOSING =
  /\b(bye|goodbye|see you( later| around)?|take care|have a (good|great|nice) (day|one|evening)|enjoy the rest|(it )?was (really |so |very )?(nice|great|good|lovely) (talking|meeting|to talk|to meet)|nice talking to you)\b/;

const GREETING = /\b(hi|hello|hey|good (morning|afternoon|evening)|nice to meet)\b/;
const INTRO = /\b(i'?m|i am|my name is|call me)\b/;

// Реплики без содержания: подтвердил и всё.
const NO_CONTENT = /^(yes|yeah|yep|no|nope|ok|okay|sure|right|good|fine|nice|cool|thanks|thank you|hmm|uh|em)\.?$/;

function looksLikeQuestion(text) {
  const n = norm(text);
  return Boolean(n) && (n.includes("?") || QUESTION_START.test(n));
}

/** Имя из «I'm Tania» / «my name is Anna». Профессии и служебные слова отсекаем. */
function extractName(text) {
  const m = (text || "").match(/\b(?:i'?m|i am|my name is|call me|this is)\s+([A-Za-z][A-Za-z'-]{1,20})/i);
  if (!m) return null;
  const candidate = m[1].toLowerCase();
  if (NOT_A_NAME.test(candidate)) return null;
  return candidate[0].toUpperCase() + candidate.slice(1);
}

const pick = (list, i) => list[i % list.length];

/* ------------------------------------------------------------------ */
/* Реплика собеседницы                                                 */
/* ------------------------------------------------------------------ */

const delay = () => {
  const [lo, hi] = LOCAL_THINKING_MS;
  return new Promise((r) => setTimeout(r, lo + Math.random() * (hi - lo)));
};

function chooseMove() {
  const move = MOVES.find((m) => !state.usedMoves.has(m.id) && m.needs(state));
  return move || MOVES[MOVES.length - 1]; // на дне списка — прощание
}

function takeMove(move) {
  state.usedMoves.add(move.id);
  state.lastMove = move;
  return move;
}

/** Подхват по существу: сфера работы или тема. Null, если зацепиться не за что. */
function substantiveAck(n, topics) {
  const work = WORK_REACTIONS.find((w) => w.match.test(n));
  if (work) return work.reply;

  for (const t of topics) {
    const bank = TOPIC_REACTIONS[t];
    if (bank) return pick(bank, state.counters.neutral++);
  }
  return null;
}

/** Подхват «ни о чём»: годится, только когда сказать по существу нечего. */
function genericAck(raw) {
  return words(raw).length <= 3
    ? pick(SHORT_ANSWER_REACTIONS, state.counters.short++)
    : pick(NEUTRAL_REACTIONS, state.counters.neutral++);
}

/**
 * @param {{history: {role:string, content:string}[], aiTurn:number}} args
 * @returns {Promise<{text:string, ended:boolean}>}
 */
export async function askPartner({ history, aiTurn }) {
  await delay();
  state.turn = aiTurn;

  const raw = [...history].reverse().find((m) => m.role === "user")?.content || "";

  // Первая реплика: человек ещё ничего не сказал.
  if (aiTurn === 1 || !raw) {
    const move = takeMove(MOVES.find((m) => m.id === "askWork"));
    return {
      text: "Hi! I don't think we've met. I'm Maya — I'm a product designer at Northwind Labs. " + move.line,
      ended: false,
    };
  }

  const n = norm(raw);

  // Ушли на русский — возвращаем мягко, ход не тратим (ТЗ, блок 2).
  if (hasCyrillic(raw)) return { text: RUSSIAN_NUDGE, ended: false };

  // Не понял — повторяем СВОЙ прошлый ход проще и не двигаемся дальше.
  if (NOT_UNDERSTOOD.test(n) && !looksLikeQuestionOther(n)) {
    const prev = state.lastMove || MOVES[0];
    return { text: `${CLARIFY_LEAD_IN} ${prev.simple || prev.line}`, ended: false };
  }

  // Имя запоминаем сразу, оно понадобится и в подхвате, и в прощании.
  const foundName = extractName(raw);
  if (foundName && !state.name) state.name = foundName;

  // Отмечаем темы, которые человек закрыл сам, — про них Maya больше не спросит.
  const topics = TOPICS.filter((t) => t.match.test(n)).map((t) => t.id);
  topics.forEach((t) => state.covered.add(t));

  const lastTurn = aiTurn >= SCENARIO.aiTurns.max;
  const saidGoodbye = aiTurn >= 3 && CLOSING.test(n);

  // Пора прощаться: человек попрощался сам или упёрлись в лимит реплик.
  if (lastTurn || saidGoodbye) {
    const close = MOVES.find((m) => m.id === "close");
    takeMove(close);
    return {
      text: state.name ? CLOSE_WITH_NAME(state.name) : close.line,
      ended: true,
    };
  }

  // Ответ без содержания на прямой вопрос — переспрашиваем иначе, а не едем дальше.
  const emptyAnswer = NO_CONTENT.test(n) || words(raw).length <= 1;
  if (
    emptyAnswer &&
    state.lastMove?.retry &&
    state.retriedMove !== state.lastMove.id
  ) {
    state.retriedMove = state.lastMove.id;
    return {
      text: `${pick(SHORT_ANSWER_REACTIONS, state.counters.short++)} ${state.lastMove.retry}`,
      ended: false,
    };
  }

  const parts = [];

  // На имя реагируем всегда и первым делом — даже если человек тут же задал вопрос.
  // Иначе «Hi, I'm Anna. Do you like dogs?» проходило мимо имени.
  let greetedNow = false;
  if (state.name && !state.nameGreeted) {
    state.nameGreeted = true;
    greetedNow = true;
    parts.push(NAME_ACK(state.name));
  }

  // Прямой вопрос получает прямой ответ. Нет ответа в банке — честно признаём.
  if (looksLikeQuestion(raw)) {
    const answer = ANSWERS.find((a) => a.match.test(n));
    parts.push(answer ? answer.reply : pick(UNKNOWN_ANSWERS, state.counters.unknown++));
  } else {
    const ack = substantiveAck(n, topics);
    // После «Max — nice to meet you» дежурное «Oh really?» звучало как тик.
    // Пустой подхват добавляем, только если по существу сказать нечего и имя уже отзвучало.
    if (ack) parts.push(ack);
    else if (!greetedNow) parts.push(genericAck(raw));
  }

  const move = takeMove(chooseMove());
  parts.push(move.line);

  return { text: parts.join(" "), ended: move.id === "close" };
}

// «Sorry, what do you do?» — это вопрос, а не просьба повторить.
// А вот «what do you mean» и «say that again» — именно просьба, и их надо оставить переспросу.
function looksLikeQuestionOther(n) {
  if (/\b(again|repeat|say that|mean|understand|catch|slower|slowly)\b/.test(n)) return false;
  return /\b(what|where|when|why|how|who|which)\b.*\b(you|your)\b/.test(n);
}

/* ------------------------------------------------------------------ */
/* Обратная связь                                                      */
/* ------------------------------------------------------------------ */

/** Короткая цитата: длинные реплики обрезаем, чтобы разбор не был стеной текста. */
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

  const userTurns = history
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean);

  if (!userTurns.length) return { ...NOTHING_TO_REVIEW };

  const byLength = [...userTurns].sort((a, b) => words(b).length - words(a).length);
  const longest = byLength[0];
  const last = userTurns[userTurns.length - 1];

  // «Hi, I'm Tania» и «Bye!» коротки по своей природе — ставить их в укор нечестно.
  const substantive = byLength.filter((t) => {
    const nn = norm(t);
    return !GREETING.test(nn) && !CLOSING.test(nn);
  });
  const shortestPool = substantive.length ? substantive : byLength;
  const shortest = shortestPool[shortestPool.length - 1];

  const clarifyTurn = userTurns.find((t) => NOT_UNDERSTOOD.test(norm(t)));
  // Переспрос — не встречный вопрос. Иначе разбор хвалит за любопытство там,
  // где человек просто не расслышал.
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
