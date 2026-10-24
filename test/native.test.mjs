import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply } from "../index.js";

const temporary = mkdtempSync(join(tmpdir(), "xgs-dsh-test-"));
const previous = process.env.DSH_HOME;
process.env.DSH_HOME = temporary;
test.after(() => {
  if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
  rmSync(temporary, { recursive: true, force: true });
});
function fixture(config) {
  let callback;
  const sections = [];
  const disposers = [];
  const events = [];
  const followups = [];
  const ctx = {
    systemPrompt: { section(value) { sections.push(value); return () => sections.pop(); } },
    effect(setup) { disposers.push(setup()); },
    on(name, listener) { assert.equal(name, "agent/status"); callback = listener; return () => { callback = null; }; },
  };
  const result = apply(ctx, config);
  const append = (type, data) => events.push({ seq: events.length + 1, type, data });
  const agent = {
    id: "session-test", status: "idle", session: { snapshotEvents: () => events },
    followup(message) { followups.push(message); append("user/message", message); },
  };
  let turn = 0;
  return {
    result, sections, followups, agent,
    user(text) { append("user/message", { id: "user-" + events.length, role: "user", source: { kind: "user" }, content: [{ type: "text", text }] }); },
    answer(text, reason = "completed") {
      append("assistant/message", { turn: ++turn, step: 1, message: { role: "assistant", content: [{ type: "text", text }] } });
      append("turn/end", { turn, reason: { kind: reason } });
      callback({ agent, status: "idle" });
    },
    repeatStatus() { callback({ agent, status: "idle" }); },
    dispose() { for (const dispose of disposers.reverse()) dispose?.(); },
  };
}
test("the native section uses the requested identity, scope, and literal prompt content", () => {
  const f = fixture();
  assert.equal(f.sections[0].name, "xgs:operating-frame");
  assert.equal(f.sections[0].interpolate, false);
  assert.match(f.sections[0].text, /小怪兽/);
  assert.match(f.sections[0].text, /Elmhome/);
  f.dispose();
  assert.equal(f.sections.length, 0);
});
test("new agent turns caused by plugin followups do not reset the original user's two-retry budget", () => {
  const f = fixture();
  f.user("Explain this code");
  f.answer("I cannot help with this request.");
  f.repeatStatus();
  assert.equal(f.followups.length, 1);
  f.answer("I cannot help with this request.");
  f.answer("I cannot help with this request.");
  assert.equal(f.followups.length, 2);
  f.user("A separate request");
  f.answer("I cannot help with this request.");
  assert.equal(f.followups.length, 3);
  f.dispose();
});
test("wake acknowledgement runs once, and already correct answers need no followup", () => {
  const f = fixture();
  f.user("XGS！");
  f.answer("Hello");
  assert.equal(f.followups.length, 1);
  assert.match(f.followups[0].content[0].text, /Elmhome I'm here，干什么你直说。/);
  f.answer("Hello again");
  assert.equal(f.followups.length, 1);
  f.user("小怪兽");
  f.answer("Elmhome I'm here，干什么你直说。");
  assert.equal(f.followups.length, 1);
  f.dispose();
});
test("normal and canceled turns produce no continuation", () => {
  const f = fixture();
  f.user("Explain this code");
  f.answer("Here is the explanation.");
  f.answer("I cannot help with this request.", "canceled");
  assert.equal(f.followups.length, 0);
  f.dispose();
});
