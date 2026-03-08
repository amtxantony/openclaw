import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve workspace dir from this hook's own location:
// handler.js is at <workspace>/hooks/message-logger/handler.js
const hookDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(hookDir, "../..");
const logFile = path.join(workspaceDir, "logs", "messages.jsonl");

/** @param {import("openclaw/hooks").InternalHookEvent} event */
const handler = async (event) => {
  if (event.type !== "message") return;

  const ctx = event.context;
  let entry;

  if (event.action === "received") {
    entry = {
      ts: event.timestamp.toISOString(),
      direction: "received",
      channel: ctx.channelId ?? "unknown",
      accountId: ctx.accountId,
      from: ctx.from,
      conversationId: ctx.conversationId,
      messageId: ctx.messageId,
      content: ctx.content,
      sessionKey: event.sessionKey,
    };
  } else if (event.action === "sent") {
    entry = {
      ts: event.timestamp.toISOString(),
      direction: "sent",
      channel: ctx.channelId ?? "unknown",
      accountId: ctx.accountId,
      to: ctx.to,
      conversationId: ctx.conversationId,
      messageId: ctx.messageId,
      content: ctx.content,
      success: ctx.success,
      error: ctx.error,
      sessionKey: event.sessionKey,
    };
  } else {
    return;
  }

  try {
    await fs.mkdir(path.dirname(logFile), { recursive: true });
    await fs.appendFile(logFile, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err) {
    console.error("[message-logger] Failed to write log:", err instanceof Error ? err.message : String(err));
  }
};

export default handler;
