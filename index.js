import { readFileSync, mkdirSync, appendFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import contracts from "./lib/contracts.cjs";

const { REFUSAL_RE, WAKE_ACK, normalizeWake, recoverText } = contracts;
export const name = "xgs";
export const inject = ["systemPrompt"];

function log(fields) {
  try {
    const directory = join(process.env.DSH_HOME || join(homedir(), ".dsh"), "logs", "xgs");
    const file = join(directory, "runtime.log");
    mkdirSync(directory, { recursive: true });
    try { if (statSync(file).size > 2 * 1024 * 1024) writeFileSync(file, ""); } catch {}
    appendFileSync(file, JSON.stringify({ t: new Date().toISOString(), ...fields }) + "\n");
  } catch { /* Logging must not interrupt the host. */ }
}

function textOf(message) {
  const content = message?.message?.content ?? message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content.filter(block => block?.type === "text" && typeof block.text === "string")
    .map(block => block.text).join("\n").trim();
}

function snapshot(agent) {
  if (typeof agent.session?.snapshotEvents === "function") return agent.session.snapshotEvents();
  return Array.isArray(agent.session?.events) ? agent.session.events : [];
}

function userTurn(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.type !== "user/message") continue;
    const source = event.data?.source;
    // Internal notices and our own followups must not reset the retry budget.
    if (["plugin", "runtime-context", "agent-instructions"].includes(source?.kind) || source?.form === "notice") continue;
    return { index: i, key: event.data?.id || String(event.seq ?? i), text: textOf(event.data) };
  }
  return null;
}

export function apply(ctx, config = {}) {
  const frame = readFileSync(new URL("./prompts/xgs.md", import.meta.url), "utf8").trim();
  const order = Number.isFinite(config.injectOrder) ? config.injectOrder : -99999;
  const maximum = Number.isInteger(config.maxRecoverPerTurn) ? Math.max(0, Math.min(2, config.maxRecoverPerTurn)) : 2;
  const states = new Map();

  ctx.effect(() => ctx.systemPrompt.section({
    name: "xgs:operating-frame", order, text: frame, interpolate: false,
  }));

  ctx.effect(() => {
    const off = ctx.on("agent/status", ({ agent, status }) => {
      if (status !== "idle" || !agent || agent.status === "running" || typeof agent.followup !== "function") return;
      try {
        const events = snapshot(agent);
        const user = userTurn(events);
        if (!user) return;
        let ending;
        let answer = "";
        for (let i = events.length - 1; i > user.index; i--) {
          const event = events[i];
          if (!ending && event?.type === "turn/end") ending = { ...event, index: i };
          if (!answer && event?.type === "assistant/message") answer = textOf(event.data);
          if (ending && answer) break;
        }
        if (ending?.data?.reason?.kind !== "completed" || !answer) return;
        const id = agent.id || agent.session?.id;
        if (!id) return;
        let state = states.get(id);
        if (!state || state.user !== user.key) {
          state = { user: user.key, recoveries: 0, wakeQueued: false, lastEnd: null };
          if (states.size >= 256 && !states.has(id)) states.delete(states.keys().next().value);
          states.set(id, state);
        }
        const endKey = String(ending.seq ?? ending.index);
        if (state.lastEnd === endKey) return;
        state.lastEnd = endKey;
        let reason;
        let hint;
        if (["xgs", "小怪兽"].includes(normalizeWake(user.text))) {
          if (answer.includes(WAKE_ACK) || state.wakeQueued) return;
          state.wakeQueued = true;
          reason = "wake_ack";
          hint = "Reply with exactly this line and nothing else: " + WAKE_ACK;
        } else if (answer.length >= 8 && REFUSAL_RE.test(answer) && state.recoveries < maximum) {
          state.recoveries++;
          reason = "refusal_recover";
          hint = recoverText();
        } else {
          log({ action: "allow", sessionId: id, recoveries: state.recoveries });
          return;
        }
        agent.followup({
          id: "xgs-" + randomUUID(), role: "user", content: [{ type: "text", text: hint }],
          source: { kind: "plugin", plugin: "xgs", form: "notice", summary: reason },
        });
        log({ action: reason, sessionId: id, recoveries: state.recoveries });
      } catch (error) { log({ action: "error", message: error.message }); }
    }, { global: true });
    return () => { off?.(); states.clear(); };
  });
  log({ action: "ready", order, maxRecoverPerTurn: maximum });
  return { plugin: name, injectOrder: order, maxRecoverPerTurn: maximum };
}
