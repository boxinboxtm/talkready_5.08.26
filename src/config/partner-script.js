// Контент собеседницы для офлайн-режима. Правится без программиста.
//
// Это НЕ линейный сценарий. Реплики собраны в «ходы» (MOVES), и движок выбирает
// следующий ход по состоянию разговора: про что уже поговорили, что человек назвал сам,
// на что ответил односложно. Поэтому Maya не спрашивает про работу, если ты уже
// про неё рассказала, — раньше спрашивала, и именно это ощущалось как «невпопад».
//
// Потолок честный: это правила, а не понимание. Снимается переключением ENGINE на "claude".

/* ------------------------------------------------------------------ */
/* Темы: про что человек уже сказал                                    */
/* ------------------------------------------------------------------ */

// Совпадение помечает тему как «закрытую» — Maya про неё больше не спросит.
// Формулировки узкие намеренно: широкий шаблон закрывал бы темы, которых не было.
export const TOPICS = [
  {
    id: "work",
    match: /\b(i work|i'?m a|i am a|i'?m an|i am an|my job|my work|i teach|i design|i study|i'?m studying|freelance|i run a|i manage)\b/,
  },
  { id: "talks", match: /\b(talks?|sessions?|keynotes?|speakers?|presentations?|workshops?)\b/ },
  { id: "city", match: /\b(lisbon|portugal|flew|flight|hotel|staying|i'?m from|i live|few days)\b/ },
  { id: "conference", match: /\b(conference|event|first time|last year|second year)\b/ },
];

/* ------------------------------------------------------------------ */
/* Подхват: реакция на то, ЧТО человек сказал                          */
/* ------------------------------------------------------------------ */

// Сфера работы. Проверяется первой — самый конкретный и самый заметный подхват.
//
// Границы слова СПРАВА намеренно нет: это основы, а не слова целиком.
// С `\beducat\b` шаблон не ловил «education», и подхват молчал там, где должен был сработать.
export const WORK_REACTIONS = [
  { match: /\b(teach|educat|school|universit|tutor|lectur)/, reply: "Oh, education — that's a world I keep bumping into." },
  { match: /\b(design|ux|ui)/, reply: "A designer too! Then we'll definitely have things to argue about." },
  { match: /\b(develop|engineer|programm|coding|software|backend|frontend)/, reply: "Engineering — I work with developers every day, they keep me honest." },
  { match: /\b(market|sales|brand|copywrit|advertis)/, reply: "Marketing — you're probably the reason half of us are here." },
  { match: /\b(product manager|founder|ceo|business|manage)/, reply: "That sounds like a lot of plates to keep spinning." },
  { match: /\b(doctor|nurse|medic|health|therap)/, reply: "Healthcare — that's a serious one. Bit different from my world." },
  { match: /\b(student|studying)/, reply: "Still studying — good time to be somewhere like this." },
  { match: /\b(research|analyst|scien)/, reply: "Research — then you'll like the room next door." },
  { match: /\b(translat|interpret|linguist)/, reply: "Languages — and here I am, monolingual and ashamed." },
];

// Подхват по теме, если сферу работы не узнали.
export const TOPIC_REACTIONS = {
  talks: ["Oh, I missed that one.", "I've heard good things about that session."],
  city: ["Lisbon's been kind to me so far.", "It's a good city to get stuck in for a few days."],
  conference: ["It's grown a lot since last year.", "Second year for me, and it's twice the size."],
  work: ["Oh, nice.", "That sounds like a good problem to have."],
};

// Когда зацепиться не за что.
export const NEUTRAL_REACTIONS = [
  "Oh, interesting.",
  "That makes sense.",
  "I like that.",
  "Fair enough.",
];

// Ответ был односложным — живой человек тоже подталкивает, не обучая.
export const SHORT_ANSWER_REACTIONS = ["Oh really?", "Go on.", "Ha, fair."];

/* ------------------------------------------------------------------ */
/* Ответы на прямые вопросы                                            */
/* ------------------------------------------------------------------ */

// Проверяются сверху вниз, первое совпадение выигрывает.
export const ANSWERS = [
  { match: /\b(what.*(you )?do|what.*your (job|work)|what do you work)\b/, reply: "Me? I'm a product designer — mostly research and prototypes." },
  { match: /\b(what.*your name|who are you|your name)\b/, reply: "Maya. Maya Ortega." },
  { match: /\b(where.*(you )?from|where.*you live|where.*based)\b/, reply: "I'm based here in Lisbon, but I grew up in Seville." },
  { match: /\b(first time|been here before|your first)\b/, reply: "Second year for me. Last year it was much smaller." },
  { match: /\b(your company|where do you work|northwind)\b/, reply: "Northwind Labs — we're small, about forty people." },
  { match: /\b(are you (speaking|presenting)|do you have a talk|give a talk|your talk)\b/, reply: "Not speaking this year. Maybe next one, if I'm brave." },
  { match: /\b(how (are|is) (you|it going)|how'?s it going|how are things)\b/, reply: "Good, thanks — one coffee too many already." },
  { match: /\b(how long|how many years|been (there|doing))\b/, reply: "About four years now. Longest I've stayed anywhere." },
  // Нужен предмет вопроса: без него «Do you like dogs?» получало ответ про конференцию.
  { match: /\b(do you like|do you enjoy|are you enjoying|how.*(finding|enjoying))\b.*\b(it|this|here|conference|event|talks?|lisbon)\b/, reply: "Better than I expected, honestly. The onboarding talk this morning was great." },
  { match: /\b(what.*(talks?|sessions?).*(you|going)|which talks?)\b/, reply: "The onboarding one this morning, and I'm trying to get into the research panel later." },
  { match: /\b(are you (from )?here|do you live here)\b/, reply: "I do, yes — about twenty minutes from this building." },
];

// Вопрос задан, но ответа в банке нет. Честнее признать, чем промолчать.
export const UNKNOWN_ANSWERS = [
  "Hm, good question — I'm not sure, honestly.",
  "You know, I have no idea.",
  "Ha, you've got me there.",
];

/* ------------------------------------------------------------------ */
/* Ходы: что Maya делает дальше                                        */
/* ------------------------------------------------------------------ */

// Движок берёт первый ход, который ещё не использован и чьё условие `needs` выполнено.
// needs(s) видит состояние: s.name, s.covered (Set тем), s.turn.
//
// line   — сам ход.
// simple — то же проще: показывается, если человек не понял.
// retry  — переспрос другими словами, если человек ответил односложно.
export const MOVES = [
  {
    id: "askName",
    needs: (s) => !s.name && s.turn <= 3,
    line: "Sorry — I didn't catch your name?",
    simple: "What's your name?",
    retry: "Your name, sorry?",
  },
  {
    id: "askWork",
    needs: (s) => !s.covered.has("work"),
    line: "So what brings you here — what do you do?",
    simple: "What is your job?",
    retry: "What kind of work are you in?",
  },
  {
    id: "shareWork",
    needs: () => true,
    line: "I mostly do research and prototypes — I spend half my week just talking to users.",
    simple: "I talk to users and make prototypes.",
  },
  {
    id: "askTalks",
    needs: (s) => !s.covered.has("talks"),
    line: "Have you made it to any of the talks yet?",
    simple: "Did you go to any talks?",
    retry: "Anything good in the programme today?",
  },
  {
    id: "shareTalks",
    needs: () => true,
    line: "The one on onboarding this morning was better than I expected.",
    simple: "The talk this morning was good.",
  },
  {
    id: "askCity",
    needs: (s) => !s.covered.has("city"),
    line: "And are you here just for the conference, or staying a few days?",
    simple: "Are you staying in Lisbon long?",
    retry: "Is this your first time in Lisbon?",
  },
  {
    id: "preClose",
    needs: () => true,
    line: "Listen — the next session starts in a few minutes and I promised a colleague I'd save her a seat.",
    simple: "I have to go soon. The next talk starts in a few minutes.",
  },
  {
    id: "close",
    needs: () => true,
    line: "It was really nice meeting you. Enjoy the rest of the conference!",
    simple: "Nice to meet you. Bye!",
  },
];

// Прощание с именем, если имя удалось узнать, — заметнее всего показывает, что тебя слушали.
export const CLOSE_WITH_NAME = (name) =>
  `It was really nice meeting you, ${name}. Enjoy the rest of the conference!`;

// Впервые услышали имя.
export const NAME_ACK = (name) => `${name} — nice to meet you.`;

// Ушли на русский. ТЗ, блок 2: мягко возвращаем, не переводим.
export const RUSSIAN_NUDGE = "Sorry, my Russian is terrible — can you try that in English?";

// Не понял — дальше движок повторит свой прошлый ход проще.
// Точка, а не тире: следующая фраза начинается с заглавной, и «— Did you…» выглядело обрывком.
export const CLARIFY_LEAD_IN = "Sure, sorry.";

// Слова, которые нельзя принимать за имя: "I'm a designer" → это не имя.
export const NOT_A_NAME =
  /^(a|an|the|not|from|here|so|just|really|very|good|fine|sorry|okay|ok|glad|happy|nice|going|working|trying|looking|new|still|also|too|and|but|in|at|on|my|your)$/;
