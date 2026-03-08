import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import {
  createReplyPrefixOptions,
  readJsonBodyWithLimit,
  registerWebhookTarget,
  resolveWebhookPath,
  resolveWebhookTargets,
  requestBodyErrorToText,
} from "openclaw/plugin-sdk";
import type { ResolvedWeComAccount } from "./accounts.js";
import { getWeComAccessToken, sendMessageWeCom } from "./send.js";
import { getWeComRuntime } from "./runtime.js";
import type { WeComInboundMessage } from "./types.js";

type WeComRuntimeEnv = {
  log?: (message: string) => void;
  error?: (message: string) => void;
};

type WeComWebhookTarget = {
  account: ResolvedWeComAccount;
  config: OpenClawConfig;
  runtime: WeComRuntimeEnv;
  path: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

const webhookTargets = new Map<string, WeComWebhookTarget[]>();

export function registerWeComWebhookTarget(target: WeComWebhookTarget): () => void {
  return registerWebhookTarget(webhookTargets, target).unregister;
}

/**
 * Verify WeCom webhook signature.
 * Sort [token, timestamp, nonce] lexicographically, join, sha1.
 */
function verifyWeComSignature(params: {
  token: string;
  timestamp: string;
  nonce: string;
  msgSignature: string;
}): boolean {
  const { token, timestamp, nonce, msgSignature } = params;
  const sorted = [token, timestamp, nonce].sort().join("");
  const hash = createHash("sha1").update(sorted).digest("hex");
  return hash === msgSignature;
}

export async function handleWeComWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const resolved = resolveWebhookTargets(req, webhookTargets);
  if (!resolved) {
    return false;
  }
  const { targets } = resolved;

  const url = new URL(req.url ?? "/", "http://localhost");
  const msgSignature = url.searchParams.get("msg_signature") ?? "";
  const timestamp = url.searchParams.get("timestamp") ?? "";
  const nonce = url.searchParams.get("nonce") ?? "";
  const echostr = url.searchParams.get("echostr");

  // GET request: signature verification (WeCom sends GET to verify the webhook URL)
  if (req.method === "GET") {
    if (!echostr) {
      res.statusCode = 400;
      res.end("missing echostr");
      return true;
    }

    const matchedTarget = targets.find((target) =>
      verifyWeComSignature({
        token: target.account.token,
        timestamp,
        nonce,
        msgSignature,
      }),
    );

    if (!matchedTarget) {
      res.statusCode = 403;
      res.end("signature verification failed");
      return true;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    res.end(echostr);
    return true;
  }

  // POST request: inbound message
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, POST");
    res.end("Method Not Allowed");
    return true;
  }

  const body = await readJsonBodyWithLimit(req, {
    maxBytes: 1024 * 1024,
    timeoutMs: 30_000,
    emptyObjectOnEmpty: false,
  });

  if (!body.ok) {
    res.statusCode =
      body.code === "PAYLOAD_TOO_LARGE" ? 413 : body.code === "REQUEST_BODY_TIMEOUT" ? 408 : 400;
    res.end(
      body.code === "REQUEST_BODY_TIMEOUT"
        ? requestBodyErrorToText("REQUEST_BODY_TIMEOUT")
        : body.error,
    );
    return true;
  }

  const raw = body.value;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    res.statusCode = 400;
    res.end("invalid payload");
    return true;
  }

  const matchedTarget = targets.find((target) =>
    verifyWeComSignature({
      token: target.account.token,
      timestamp,
      nonce,
      msgSignature,
    }),
  );

  if (!matchedTarget) {
    res.statusCode = 403;
    res.end("signature verification failed");
    return true;
  }

  matchedTarget.statusSink?.({ lastInboundAt: Date.now() });

  const message = raw as WeComInboundMessage;
  processWeComMessage(message, matchedTarget).catch((err) => {
    matchedTarget.runtime.error?.(
      `[${matchedTarget.account.accountId}] WeCom webhook processing failed: ${String(err)}`,
    );
  });

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain");
  res.end("ok");
  return true;
}

async function processWeComMessage(
  message: WeComInboundMessage,
  target: WeComWebhookTarget,
): Promise<void> {
  const { account, config, runtime, statusSink } = target;
  const core = getWeComRuntime();

  const msgType = message.MsgType?.toLowerCase();
  const senderId = message.FromUserName ?? "";
  const content = message.Content ?? "";

  // Only handle text messages for now; skip events and other message types
  if (msgType !== "text" || !content.trim() || !senderId) {
    return;
  }

  // Check DM policy
  const dmPolicy = account.dmPolicy;
  const allowFrom = account.allowFrom ?? [];

  if (dmPolicy === "disabled") {
    return;
  }

  if (dmPolicy !== "open") {
    const isAllowed =
      allowFrom.includes("*") ||
      allowFrom.some((entry) => {
        const normalized = String(entry).trim().toLowerCase();
        return normalized === senderId.toLowerCase();
      });

    if (!isAllowed) {
      if (dmPolicy === "pairing") {
        try {
          const accessToken = await getWeComAccessToken(account.corpid, account.corpsecret);
          const { code, created } = await core.channel.pairing.upsertPairingRequest({
            channel: "wecom",
            id: senderId,
            meta: { name: senderId },
          });
          if (created) {
            const pairingText = core.channel.pairing.buildPairingReply({
              channel: "wecom",
              idLine: `Your WeCom user id: ${senderId}`,
              code,
            });
            await sendMessageWeCom(senderId, pairingText, {
              agentid: account.agentid,
              accessToken,
            });
            statusSink?.({ lastOutboundAt: Date.now() });
          }
        } catch (err) {
          runtime.error?.(`[${account.accountId}] WeCom pairing reply failed: ${String(err)}`);
        }
      }
      return;
    }
  }

  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: "wecom",
    accountId: account.accountId,
    peer: {
      kind: "direct",
      id: senderId,
    },
  });

  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });

  const rawBody = content.trim();
  const timestamp = message.CreateTime ? message.CreateTime * 1000 : undefined;

  const body = core.channel.reply.formatAgentEnvelope({
    channel: "WeCom",
    from: senderId,
    timestamp,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: rawBody,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: `wecom:${senderId}`,
    To: `wecom:${senderId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: senderId,
    SenderName: senderId,
    SenderId: senderId,
    Provider: "wecom",
    Surface: "wecom",
    MessageSid: message.MsgId,
    MessageSidFull: message.MsgId,
    OriginatingChannel: "wecom",
    OriginatingTo: `wecom:${senderId}`,
  });

  void core.channel.session
    .recordSessionMetaFromInbound({
      storePath,
      sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
      ctx: ctxPayload,
    })
    .catch((err) => {
      runtime.error?.(`wecom: failed updating session meta: ${String(err)}`);
    });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config,
    agentId: route.agentId,
    channel: "wecom",
    accountId: route.accountId,
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload) => {
        const text = payload.text;
        if (!text) return;
        try {
          const accessToken = await getWeComAccessToken(account.corpid, account.corpsecret);
          await sendMessageWeCom(senderId, text, {
            agentid: account.agentid,
            accessToken,
          });
          statusSink?.({ lastOutboundAt: Date.now() });
        } catch (err) {
          runtime.error?.(`[${account.accountId}] WeCom reply send failed: ${String(err)}`);
        }
      },
      onError: (err, info) => {
        runtime.error?.(
          `[${account.accountId}] WeCom ${info.kind} reply failed: ${String(err)}`,
        );
      },
    },
    replyOptions: {
      onModelSelected,
    },
  });
}

export function resolveWeComWebhookPath(params: { account: ResolvedWeComAccount }): string {
  const { accountId } = params.account;
  return resolveWebhookPath({
    defaultPath: `/webhooks/wecom/${accountId}`,
  }) ?? `/webhooks/wecom/${accountId}`;
}

export type WeComMonitorOptions = {
  account: ResolvedWeComAccount;
  config: OpenClawConfig;
  runtime: WeComRuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

export function startWeComMonitor(options: WeComMonitorOptions): () => void {
  const { account } = options;
  const path = resolveWeComWebhookPath({ account });

  const unregister = registerWeComWebhookTarget({
    account,
    config: options.config,
    runtime: options.runtime,
    path,
    statusSink: options.statusSink,
  });

  return unregister;
}
