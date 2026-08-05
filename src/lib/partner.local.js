// Локальный собеседник: работает в браузере, без ключей и без интернета.
// Интерфейс совпадает с lib/api.js (Claude), поэтому движки взаимозаменяемы.
//
// ГЛАВНОЕ ПРАВИЛО: вопрос Maya может родиться только из сказанного человеком.
// Вопрос «от себя» (OPENERS) достаётся, лишь когда зацепиться не за что,
// и только по теме, которую человек ещё не закрыл.
//
// Так выглядели провалы прошлых версий, и все три — из одного корня,
// «вопрос берётся из очереди тем»:
//   • «How long have you been doing that?» — когда человек ещё не сказал, чем занят;
//   • «What kind of work are you in?» пять раз подряд;
//   • «Have you been to any talks?» сразу после рассказа про доклад.
//
// В реплике максимум ОДИН вопрос — иначе получается допрос, а не разговор.

import { SCENARIO } from "../config/scenario.js";
import { LOCAL_THINKING_MS } from "../config/engine.js";
import {
  AGREEMENT_REACTIONS,
  ANSWERS,
  BOUNCE_BACK,
  CLARIFY_LEAD_IN,
  CLOSE,
  CLOSE_SIMPLE,
  CLOSE_WITH_NAME,
  NAME_ACK,
  NEUTRAL_REACTIONS,
  NOT_A_NAME,
  OPENERS,
  OPENER_NO,
  OPENER_YES,
  OPENING,
  OPENING_SIMPLE,
  PRE_CLOSE,
  PRE_CLOSE_SIMPLE,
  RULES,
  RUSSIAN_NUDGE,
  SHARES,
  SHORT_ANSWER_REACTIONS,
  UNKNOWN_ANSWERS,
} from "../config/partner-script.js";
import { GROWTHS, NOTHING_TO_REVIEW, WINS } from "../config/feedback-rules.js";

/* ================================================================== */
/* Состояние разговора                                                 */
/* ================================================================== */

let state = freshState();

function freshState() {
  return {
    name: null,
    nameGreeted: false,
    covered: new Set(),      // темы, которые человек закрыл сам
    usedOpeners: new Set(),  // вопросы «от себя» — каждый не больше раза
    usedFollowUps: new Set(),
    usedShares: 0,
    retried: new Set(),
    pendingOpener: null,     // на какой вопрос Maya ждёт ответа
    lastSimple: OPENING_SIMPLE, // упрощённая версия прошлой реплики — для переспроса
    counters: { neutral: 0, short: 0, unknown: 0, agree: 0 },
    closing: false,
  };
}

export function resetPartner() {
  state = freshState();
}

/* ================================================================== */
/* Разбор реплики человека                                             */
/* ================================================================== */

const norm = (s) =>
  (s || "").toLowerCase().replace(/[^\p{L}\p{N}\s'?]/gu, " ").replace(/\s+/g, " ").trim();
const words = (s) => norm(s).split(" ").filter(Boolean);
const hasCyrillic = (s) => /[Ѐ-ӿ]/.test(s || "");

const NOT_UNDERSTOOD =
  /\b(pardon|say (that|it) again|come again|repeat|what do you mean|what does that mean|didn'?t (catch|understand|get)|don'?t understand|slower|more slowly)\b/;

const QUESTION_START =
  /^(what|where|when|why|how|who|which|do|does|did|are|is|was|were|can|could|would|will|have|has|any|and you|what about|how about)\b/;

// Прощание. «nice to meet you» — это ПРИВЕТСТВИЕ; ловим прошедшее время и явные формулы.
const CLOSING =
  /\b(bye|goodbye|see you( later| around| soon)?|take care|have a (good|great|nice) (day|one|evening|time)|enjoy the rest|(it )?was (really |so |very )?(nice|great|good|lovely) (talking|meeting|to talk|to meet)|nice talking to you|i (have to|should|need to) (go|run))\b/;

const GREETING = /\b(hi|hello|hey|good (morning|afternoon|evening)|nice to meet)\b/;
const INTRO = /\b(i'?m|i am|my name is|call me)\b/;

const NEGATIVE = /\b(no|nope|not yet|not really|haven'?t|didn'?t|never|nothing yet|afraid not)\b/;
const AFFIRMATIVE = /\b(yes|yeah|yep|sure|of course|i did|i have|definitely|absolutely|exactly)\b/;
const AGREEMENT =
  /\b(sounds (good|interesting|nice|great)|that'?s (interesting|nice|cool|great)|interesting|cool|me too|same here)\b/;

const NO_CONTENT =
  /^(yes|yeah|yep|no|nope|ok|okay|sure|right|good|fine|nice|cool|thanks|thank you|hmm|uh|em|maybe|i see)\.?$/;

function isQuestion(text) {
  const n = norm(text);
  if (!n) return false;
  if (NOT_UNDERSTOOD.test(n)) return false; // просьба повторить — не вопрос по теме
  return n.includes("?") || QUESTION_START.test(n);
}

/** Имя из «I'm Tania» / «my name is Anna». Профессии и служебные слова отсекаем. */
function extractName(text) {
  const m = (text || "").match(
    /\b(?:i'?m|i am|my name is|call me|this is)\s+([A-Za-z][A-Za-z'-]{1,20})/i
  );
  if (!m) return null;
  const c = m[1].toLowerCase();
  if (NOT_A_NAME.test(c)) return null;
  return c[0].toUpperCase() + c.slice(1);
}

const pick = (list, i) => list[i % list.length];

/** Следующий вопрос «от себя»: не повторяемся и не лезем в закрытую тему. */
function nextOpener() {
  return OPENERS.find((o) => !state.usedOpeners.has(o.id) && !state.covered.has(o.topic)) || null;
}

function takeOpener(o) {
  state.usedOpeners.add(o.id);
  state.pendingOpener = o;
  state.lastSimple = o.simple;
  return o.line;
}

function nextShare() {
  return SHARES[state.usedShares++ % SHARES.length];
}

/* ================================================================== */
/* Сборка реплики                                                      */
/* ================================================================== */

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

  const raw = [...history].reverse().find((m) => m.role === "user")?.content || "";

  /* ---- первая реплика ---- */
  if (aiTurn === 1 || !raw) {
    state.lastSimple = OPENING_SIMPLE;
    return { text: OPENING, ended: false };
  }

  const n = norm(raw);

  /* ---- русский: мягко возвращаем, ход не тратим (ТЗ, блок 2) ---- */
  if (hasCyrillic(raw)) return { text: RUSSIAN_NUDGE, ended: false };

  /* ---- не понял: повторяем СВОЮ прошлую реплику проще ---- */
  if (NOT_UNDERSTOOD.test(n)) {
    return { text: `${CLARIFY_LEAD_IN} ${state.lastSimple}`, ended: false };
  }

  /* ---- имя ---- */
  const found = extractName(raw);
  if (found && !state.name) state.name = found;

  /* ---- завершение ---- */
  if (aiTurn >= SCENARIO.aiTurns.max || (aiTurn >= 3 && CLOSING.test(n)) || state.closing) {
    state.lastSimple = CLOSE_SIMPLE;
    return { text: state.name ? CLOSE_WITH_NAME(state.name) : CLOSE, ended: true };
  }

  // Что человек сказал по существу. Правило может закрыть тему — тогда Maya
  // про неё уже не спросит, и «расскажите про доклад → были ли вы на докладах?» не случится.
  const rule = RULES.find((r) => r.match.test(n));
  if (rule) rule.covers.forEach((c) => state.covered.add(c));

  const parts = [];

  // На имя реагируем первым делом, даже если человек сразу задал вопрос.
  let greeted = false;
  if (state.name && !state.nameGreeted) {
    state.nameGreeted = true;
    greeted = true;
    parts.push(NAME_ACK(state.name));
  }

  // Предпоследний ход: предупреждаем об уходе, чтобы прощание не было резким.
  const wrapUp = aiTurn >= SCENARIO.aiTurns.max - 1;

  /* ================= человек задал вопрос ================= */
  if (isQuestion(raw)) {
    const hit = ANSWERS.find((a) => a.match.test(n));
    parts.push(hit ? hit.reply : pick(UNKNOWN_ANSWERS, state.counters.unknown++));
    state.lastSimple = hit ? hit.reply : parts[parts.length - 1];

    if (wrapUp) return closeSoon(parts);

    // Возвращаем мяч ровно один раз и только если человек ещё не рассказал о себе.
    // Повторный вопрос «от себя» здесь и давал пять «What kind of work are you in?» подряд.
    if (state.pendingOpener && !state.covered.has(state.pendingOpener.topic)) {
      const o = state.pendingOpener;
      if (!state.retried.has(o.id)) {
        state.retried.add(o.id);
        parts.push(o.retry);
        state.lastSimple = o.simple;
      }
      state.pendingOpener = null;
    } else if (hit && hit.id === "job" && !state.covered.has("work")) {
      parts.push(BOUNCE_BACK);
      state.lastSimple = BOUNCE_BACK;
    }
    return { text: parts.join(" "), ended: false };
  }

  /* ================= человек ответил ================= */
  const empty = NO_CONTENT.test(n) || words(raw).length <= 1;
  const pending = state.pendingOpener;

  // «Not yet» — содержательный ответ. Отвечаем именно на него, а не на пустоту.
  if (pending && !rule && NEGATIVE.test(n) && !AFFIRMATIVE.test(n)) {
    state.pendingOpener = null;
    parts.push(OPENER_NO[pending.topic]);
    state.covered.add(pending.topic);
    return wrapUp ? closeSoon(parts) : addTail(parts);
  }

  // «Yes» без подробностей — уточняем по той же теме.
  if (pending && !rule && AFFIRMATIVE.test(n) && words(raw).length <= 4) {
    state.pendingOpener = null;
    parts.push(OPENER_YES[pending.topic]);
    state.lastSimple = pending.simple;
    return { text: parts.join(" "), ended: false };
  }

  // Односложно и мимо темы — переспрашиваем иначе, тему не бросаем.
  if (empty && pending && !state.retried.has(pending.id)) {
    state.retried.add(pending.id);
    parts.push(pick(SHORT_ANSWER_REACTIONS, state.counters.short++));
    parts.push(pending.retry);
    state.lastSimple = pending.simple;
    return { text: parts.join(" "), ended: false };
  }

  // Есть за что зацепиться — реагируем и, если можно, углубляем ТУ ЖЕ тему.
  if (rule) {
    state.pendingOpener = null;
    parts.push(rule.react);
    state.lastSimple = rule.react;

    if (wrapUp) return closeSoon(parts);

    if (rule.followUp && !state.usedFollowUps.has(rule.id)) {
      state.usedFollowUps.add(rule.id);
      parts.push(rule.followUp);
      state.lastSimple = rule.followUp;
      return { text: parts.join(" "), ended: false };
    }
    return addTail(parts);
  }

  // Зацепиться не за что: общая реакция, дальше — вопрос «от себя» или реплика от себя.
  if (!greeted || words(raw).length > 3) {
    parts.push(
      AGREEMENT.test(n)
        ? pick(AGREEMENT_REACTIONS, state.counters.agree++)
        : words(raw).length <= 3
        ? pick(SHORT_ANSWER_REACTIONS, state.counters.short++)
        : pick(NEUTRAL_REACTIONS, state.counters.neutral++)
    );
  }

  return wrapUp ? closeSoon(parts) : addTail(parts);
}

/** Хвост реплики: вопрос «от себя», если он уместен, иначе — Maya говорит о себе. */
function addTail(parts) {
  const opener = nextOpener();
  if (opener) {
    parts.push(takeOpener(opener));
  } else {
    const share = nextShare();
    parts.push(share);
    state.lastSimple = share;
  }
  return { text: parts.join(" "), ended: false };
}

function closeSoon(parts) {
  state.closing = true;
  parts.push(PRE_CLOSE);
  state.lastSimple = PRE_CLOSE_SIMPLE;
  return { text: parts.join(" "), ended: false };
}

/* ================================================================== */
/* Обратная связь                                                      */
/* ================================================================== */

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
  const substantive = byLength.filter((x) => {
    const nn = norm(x);
    return !GREETING.test(nn) && !CLOSING.test(nn);
  });
  const pool = substantive.length ? substantive : byLength;
  const shortest = pool[pool.length - 1];

  const clarifyTurn = userTurns.find((x) => NOT_UNDERSTOOD.test(norm(x)));
  // Переспрос — не встречный вопрос: иначе разбор хвалит за любопытство там,
  // где человек просто не расслышал.
  const questionTurn = userTurns.find(isQuestion);
  const introTurn = userTurns.find((x) => INTRO.test(norm(x)));

  const stats = {
    turns: userTurns.length,
    hintsUsed,
    greeted: userTurns.some((x) => GREETING.test(norm(x))),
    introduced: Boolean(introTurn),
    introText: quote(introTurn),
    askedQuestion: Boolean(questionTurn),
    questionText: quote(questionTurn),
    clarified: Boolean(clarifyTurn),
    clarifyText: quote(clarifyTurn),
    longestWords: words(longest).length,
    longestText: quote(longest),
    shortestText: quote(shortest),
    avgWords: userTurns.reduce((s, x) => s + words(x).length, 0) / userTurns.length,
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
