// Выбор движка собеседника. Единственное место, которое знает про оба варианта, —
// приложение импортирует askPartner / askFeedback только отсюда и не догадывается,
// кто за ними стоит: сценарий в браузере или языковая модель.
//
// Переключается в src/config/engine.js одной строкой.

import { ENGINE } from "../config/engine.js";
import * as local from "./partner.local.js";
import * as claude from "./api.js";

const impl = ENGINE === "claude" ? claude : local;

export const askPartner = impl.askPartner;
export const askFeedback = impl.askFeedback;
export const resetPartner = impl.resetPartner;

// Локальному движку интернет не нужен — приложение показывает это пользователю честно.
export const isOffline = ENGINE !== "claude";
