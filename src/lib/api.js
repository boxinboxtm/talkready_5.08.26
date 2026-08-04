// Вызовы AI через собственный прокси /api/chat.
// Ключ Anthropic живёт только на сервере (ТЗ, блок 11) — браузер его не видит.

import {
  SCENARIO,
  END_MARKER,
  buildPartnerSystemPrompt,
  buildFeedbackSystemPrompt,
} from "../config/scenario.js";
import { NOTHING_TO_REVIEW } from "../config/feedback-rules.js";

// У модели нет состояния между разговорами — сбрасывать нечего.
// Функция существует, чтобы интерфейс совпадал с локальным движком.
export function resetPartner() {}

async function callChat({ system, messages, max_tokens }) {
  let res;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ system, messages, max_tokens }),
    });
  } catch {
    throw new Error("Нет связи с сервером.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.error || "Сервис недоступен.");
  }

  const text = (data?.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (!text) throw new Error("Пустой ответ от сервиса.");
  return text;
}

/**
 * Следующая реплика собеседника.
 * @param {{role:'user'|'assistant', content:string}[]} history история диалога
 * @param {number} aiTurn  номер реплики собеседника (с 1)
 */
export async function askPartner({ history, aiTurn }) {
  const shouldWrapUp = aiTurn >= SCENARIO.aiTurns.min;

  // Anthropic ждёт, что первым идёт сообщение пользователя.
  // На старте диалога подставляем служебную реплику — на экран она не попадает.
  const messages = history.length
    ? history
    : [{ role: "user", content: "(You notice someone next to you. Start the conversation.)" }];

  const raw = await callChat({
    system: buildPartnerSystemPrompt({ aiTurn, shouldWrapUp }),
    messages,
    max_tokens: 300,
  });

  const ended = raw.includes(END_MARKER);
  const text = raw.replaceAll(END_MARKER, "").trim();

  return { text, ended };
}

/**
 * Итоговая обратная связь: ровно три части (ТЗ, блок 10).
 * @param {{role:string, content:string}[]} history завершённый диалог
 * @param {number} hintsUsed сколько раз пользователь брал подсказку
 */
export async function askFeedback({ history, hintsUsed }) {
  // Разговор прервали до первого ответа — разбирать нечего, и выдумывать не будем.
  if (!history.some((m) => m.role === "user")) return { ...NOTHING_TO_REVIEW };

  const transcript = history
    .map((m) => `${m.role === "user" ? "LEARNER" : "PARTNER"}: ${m.content}`)
    .join("\n");

  const hintLine =
    hintsUsed > 0
      ? `The learner asked for a hint ${hintsUsed} time(s). Do not shame them for it; mention it only if it is genuinely useful.`
      : `The learner did not ask for any hints.`;

  const raw = await callChat({
    system: buildFeedbackSystemPrompt(),
    messages: [
      {
        role: "user",
        content: `Scenario: ${SCENARIO.title}\n${hintLine}\n\nTranscript:\n${transcript}`,
      },
    ],
    max_tokens: 500,
  });

  return parseFeedback(raw);
}

// Модель просили вернуть чистый JSON, но подстрахуемся от обёртки в ```json.
function parseFeedback(raw) {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (parsed.done && parsed.grow && parsed.next) return parsed;
    } catch { /* разберём как текст ниже */ }
  }

  throw new Error("Не удалось разобрать обратную связь.");
}
