import { ValidationError } from "../todos/types";
import { readJsonBody, sendJson, type Route } from "./router";
import {
  BridgeNotReadyError,
  BridgeTimeoutError,
  getPomodoroState,
  sendPomodoroCommand,
  type PomodoroCommandAction,
} from "./pomodoro-bridge";

// The pomodoro surface of the agent API. Unlike todos (whose authority is a
// main-side SQLite db), the live timer lives in the renderer, so these handlers
// go through the renderer bridge. 503/504 are written directly here — the
// server's central error handler only maps 400/404/500.

const COMMAND_ACTIONS: PomodoroCommandAction[] = [
  "start",
  "pause",
  "stop",
  "skip",
  "reset",
  "set-preset",
  "stop-overtime",
];

const PRESET_IDS = ["25:5", "50:10", "100:20", "120:30"];

function asObject(body: unknown, what: string): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError(`${what} must be a JSON object`);
  }
  return body as Record<string, unknown>;
}

export const pomodoroRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/api/pomodoro",
    handler: (_req, res) => {
      const state = getPomodoroState();
      if (state === null) {
        sendJson(res, 503, { error: "pomodoro bridge not ready" });
        return;
      }
      sendJson(res, 200, state);
    },
  },
  {
    method: "POST",
    pattern: "/api/pomodoro/command",
    handler: async (req, res) => {
      const body = asObject(await readJsonBody(req), "body");
      const action = body.action;
      if (
        typeof action !== "string" ||
        !COMMAND_ACTIONS.includes(action as PomodoroCommandAction)
      ) {
        throw new ValidationError(`Unknown action: ${JSON.stringify(action)}`);
      }

      let presetId: string | undefined;
      if (action === "set-preset") {
        const p = body.presetId;
        if (typeof p !== "string" || !PRESET_IDS.includes(p)) {
          throw new ValidationError(
            `set-preset requires presetId in ${PRESET_IDS.join(", ")}`
          );
        }
        presetId = p;
      }

      try {
        const result = await sendPomodoroCommand(action as PomodoroCommandAction, presetId);
        sendJson(res, 200, result);
      } catch (error) {
        if (error instanceof BridgeNotReadyError) {
          sendJson(res, 503, { error: error.message });
          return;
        }
        if (error instanceof BridgeTimeoutError) {
          sendJson(res, 504, { error: error.message });
          return;
        }
        throw error;
      }
    },
  },
];
