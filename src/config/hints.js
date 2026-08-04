// Банк подсказок. ТЗ v.02, блок 1:
// фиксированный банк в отдельном конфиге, ИИ подсказки НЕ генерирует —
// приложение выбирает только из этого файла.

// ВНИМАНИЕ: статус draft — банк собран для технической проверки цикла
// и требует вычитки преподавателем английского до показа реальным пользователям.
export const HINTS_STATUS = "draft";

// Тип 1 — фразы уточнения: пользователь НЕ ПОНЯЛ собеседника.
export const CLARIFICATION_HINTS = [
  {
    id: "c1",
    phrase: "Sorry, did you mean…?",
    note: "Если уловил примерно — переспроси своими словами.",
  },
  {
    id: "c2",
    phrase: "Could you say that again, please?",
    note: "Самое простое — попросить повторить.",
  },
  {
    id: "c3",
    phrase: "Sorry, could you speak a bit more slowly?",
    note: "Если собеседник говорит слишком быстро.",
  },
  {
    id: "c4",
    phrase: "I didn't catch the last part — what was that?",
    note: "Если потерял только конец фразы.",
  },
  {
    id: "c5",
    phrase: "What does … mean?",
    note: "Если не понял одно конкретное слово.",
  },
];

// Тип 2 — опоры для ответа: пользователь понял, но не знает, как ответить.
// Структура по ТЗ: коммуникативное намерение + речевой каркас + готовый пример.
// stage связывает опору с этапом разговора; порядок внутри этапа — от простого к сложному.
export const RESPONSE_SCAFFOLDS = [
  {
    id: "s1",
    stage: "greeting",
    intent: "Поздороваться и представиться",
    frame: "Hi, I'm ___. Nice to meet you.",
    example: "Hi, I'm Tania. Nice to meet you.",
  },
  {
    id: "s2",
    stage: "greeting",
    intent: "Сказать, почему ты здесь",
    frame: "I'm here for ___.",
    example: "I'm here for the design talks.",
  },
  {
    id: "s3",
    stage: "about",
    intent: "Коротко рассказать, чем занимаешься",
    frame: "I work in ___. I mostly ___.",
    example: "I work in education. I mostly design online courses.",
  },
  {
    id: "s4",
    stage: "about",
    intent: "Добавить одну деталь, чтобы ответ не был односложным",
    frame: "___. Right now I'm working on ___.",
    example: "I'm a teacher. Right now I'm working on a course for adults.",
  },
  {
    id: "s5",
    stage: "question",
    intent: "Задать встречный вопрос о работе",
    frame: "What about you — what do you do?",
    example: "What about you — what do you do?",
  },
  {
    id: "s6",
    stage: "question",
    intent: "Спросить про впечатления от события",
    frame: "How are you finding ___?",
    example: "How are you finding the conference so far?",
  },
  {
    id: "s7",
    stage: "question",
    intent: "Подхватить то, что сказал собеседник",
    frame: "You mentioned ___ — how did that go?",
    example: "You mentioned your talk — how did that go?",
  },
  {
    id: "s8",
    stage: "closing",
    intent: "Вежливо завершить разговор",
    frame: "It was really nice talking to you. Enjoy ___!",
    example: "It was really nice talking to you. Enjoy the rest of the day!",
  },
  {
    id: "s9",
    stage: "closing",
    intent: "Завершить и оставить контакт",
    frame: "I should get going, but it was great to meet you.",
    example: "I should get going, but it was great to meet you.",
  },
];

/**
 * Выбор опоры под текущий этап разговора.
 * Ничего не генерируем — только достаём из банка выше.
 *
 * @param {number} aiTurn      сколько реплик собеседник уже произнёс
 * @param {boolean} wrappingUp разговор идёт к завершению
 * @param {string[]} usedIds   уже показанные опоры — стараемся не повторяться
 */
export function pickScaffold({ aiTurn, wrappingUp, usedIds = [] }) {
  let stage;
  if (wrappingUp) stage = "closing";
  else if (aiTurn <= 1) stage = "greeting";
  else if (aiTurn <= 3) stage = "about";
  else stage = "question";

  const inStage = RESPONSE_SCAFFOLDS.filter((h) => h.stage === stage);
  const fresh = inStage.filter((h) => !usedIds.includes(h.id));
  const pool = fresh.length ? fresh : inStage;
  return pool[0];
}

/** Выбор фразы уточнения — по кругу, чтобы не показывать одну и ту же. */
export function pickClarification({ usedIds = [] }) {
  const fresh = CLARIFICATION_HINTS.filter((h) => !usedIds.includes(h.id));
  const pool = fresh.length ? fresh : CLARIFICATION_HINTS;
  return pool[0];
}
