import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
  type ChannelStatusIssue,
  type OpenClawConfig,
} from "openclaw/plugin-sdk";
import {
  listWeComAccountIds,
  resolveDefaultWeComAccountId,
  resolveWeComAccount,
  type ResolvedWeComAccount,
} from "./accounts.js";
import { resolveWeComWebhookPath, startWeComMonitor } from "./monitor.js";
import { getWeComRuntime } from "./runtime.js";
import { getWeComAccessToken, sendMessageWeCom } from "./send.js";
import { WeComConfigSchema } from "./config-schema.js";

export const wecomPlugin: ChannelPlugin<ResolvedWeComAccount> = {
  id: "wecom",
  meta: {
    id: "wecom",
    label: "WeCom",
    selectionLabel: "WeCom (Enterprise WeChat / 企业微信)",
    docsPath: "/channels/wecom",
    docsLabel: "wecom",
    blurb: "WeCom (Enterprise WeChat) channel via webhook.",
    aliases: ["enterprise-wechat", "wxwork"],
    order: 80,
    showConfigured: false,
  },
  capabilities: {
    chatTypes: ["direct", "group"],
  },
  reload: { configPrefixes: ["channels.wecom"] },
  configSchema: buildChannelConfigSchema(WeComConfigSchema),
  config: {
    listAccountIds: (cfg) => listWeComAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveWeComAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultWeComAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "wecom",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "wecom",
        accountId,
        clearBaseFields: ["corpid", "corpsecret", "agentid", "token", "encodingAesKey", "name"],
      }),
    isConfigured: (account) =>
      Boolean(account.corpid && account.corpsecret && account.agentid && account.token),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(
        account.corpid && account.corpsecret && account.agentid && account.token,
      ),
      dmPolicy: account.dmPolicy,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      resolveWeComAccount({ cfg, accountId }).allowFrom,
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((entry) => String(entry).trim()).filter(Boolean),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        (cfg.channels as Record<string, unknown> | undefined)?.["wecom"] &&
          typeof (cfg.channels as Record<string, { accounts?: Record<string, unknown> }>)?.["wecom"]
            ?.accounts === "object" &&
          (cfg.channels as Record<string, { accounts?: Record<string, unknown> }>)["wecom"]
            ?.accounts?.[resolvedAccountId],
      );
      const allowFromPath = useAccountPath
        ? `channels.wecom.accounts.${resolvedAccountId}.allowFrom`
        : "channels.wecom.allowFrom";
      return {
        policy: account.dmPolicy ?? "pairing",
        allowFrom: account.allowFrom ?? [],
        allowFromPath,
        approveHint: formatPairingApproveHint("wecom"),
        normalizeEntry: (raw) => raw.trim().replace(/^wecom:/i, ""),
      };
    },
    collectWarnings: ({ account }) => {
      const warnings: string[] = [];
      if (account.dmPolicy === "open") {
        warnings.push(
          `- WeCom DMs are open to anyone. Set channels.wecom.dmPolicy="pairing" to require approval.`,
        );
      }
      return warnings;
    },
  },
  pairing: {
    idLabel: "wecomUserId",
    normalizeAllowEntry: (entry) => entry.trim().replace(/^wecom:/i, ""),
  },
  setup: {
    resolveAccountId: ({ accountId }) => accountId?.trim() || DEFAULT_ACCOUNT_ID,
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "wecom",
        accountId,
        name,
      }),
    applyAccountConfig: ({ cfg, accountId, input }) => {
      // ChannelSetupInput doesn't include WeCom-specific fields; cast to access them
      const wecomInput = input as {
        name?: string;
        token?: string;
        corpid?: string;
        corpsecret?: string;
        agentid?: number;
        encodingAesKey?: string;
      };

      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "wecom",
        accountId,
        name: wecomInput.name,
      });

      const configPatch: Record<string, unknown> = {};
      if (wecomInput.corpid) configPatch["corpid"] = wecomInput.corpid;
      if (wecomInput.corpsecret) configPatch["corpsecret"] = wecomInput.corpsecret;
      if (wecomInput.agentid) configPatch["agentid"] = wecomInput.agentid;
      // `token` is in ChannelSetupInput; use it for the WeCom webhook verification token
      if (wecomInput.token) configPatch["token"] = wecomInput.token;
      if (wecomInput.encodingAesKey) configPatch["encodingAesKey"] = wecomInput.encodingAesKey;

      const channels = namedConfig.channels as Record<string, unknown> | undefined;
      const existing = (channels?.["wecom"] as Record<string, unknown>) ?? {};

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...namedConfig,
          channels: {
            ...namedConfig.channels,
            wecom: {
              ...existing,
              enabled: true,
              ...configPatch,
            },
          },
        } as OpenClawConfig;
      }

      const existingAccounts =
        (existing["accounts"] as Record<string, unknown> | undefined) ?? {};
      const existingAccount = (existingAccounts[accountId] as Record<string, unknown>) ?? {};

      return {
        ...namedConfig,
        channels: {
          ...namedConfig.channels,
          wecom: {
            ...existing,
            enabled: true,
            accounts: {
              ...existingAccounts,
              [accountId]: {
                ...existingAccount,
                enabled: true,
                ...configPatch,
              },
            },
          },
        },
      } as OpenClawConfig;
    },
  },
  outbound: {
    deliveryMode: "gateway",
    resolveTarget: ({ to }) => {
      const trimmed = to?.trim() ?? "";
      if (!trimmed) {
        return {
          ok: false,
          error: new Error("WeCom target (userid) is required."),
        };
      }
      const normalized = trimmed.replace(/^wecom:/i, "");
      if (!normalized) {
        return {
          ok: false,
          error: new Error("WeCom target (userid) is empty after normalization."),
        };
      }
      return { ok: true, to: normalized };
    },
    sendText: async ({ cfg, to, text, accountId }) => {
      const account = resolveWeComAccount({ cfg, accountId });
      const accessToken = await getWeComAccessToken(account.corpid, account.corpsecret);
      const result = await sendMessageWeCom(to, text, {
        agentid: account.agentid,
        accessToken,
      });
      return {
        channel: "wecom",
        messageId: result.messageId ?? "",
        chatId: to,
      };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts): ChannelStatusIssue[] =>
      accounts.flatMap((entry) => {
        const accountId = String(entry.accountId ?? DEFAULT_ACCOUNT_ID);
        const enabled = entry.enabled !== false;
        const configured = entry.configured === true;
        if (!enabled || !configured) return [];
        const issues: ChannelStatusIssue[] = [];
        if (!entry.webhookPath) {
          issues.push({
            channel: "wecom",
            accountId,
            kind: "config",
            message: "WeCom webhook path is not set.",
            fix: `Set channels.wecom.token and restart to register the webhook at /webhooks/wecom/${accountId}.`,
          });
        }
        return issues;
      }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(
        account.corpid && account.corpsecret && account.agentid && account.token,
      ),
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
      dmPolicy: account.dmPolicy,
      webhookPath: resolveWeComWebhookPath({ account }),
    }),
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      webhookPath: snapshot.webhookPath ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const core = getWeComRuntime();

      ctx.log?.info(`[${account.accountId}] starting WeCom webhook`);

      const webhookPath = resolveWeComWebhookPath({ account });
      ctx.setStatus({
        accountId: account.accountId,
        running: true,
        lastStartAt: Date.now(),
        webhookPath,
      });

      const logger = core.logging.getChildLogger({ channel: "wecom" });
      const unregister = startWeComMonitor({
        account,
        config: ctx.cfg,
        runtime: {
          log: (msg) => logger.info(msg),
          error: (msg) => logger.error(msg),
        },
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: account.accountId, ...patch }),
      });

      return () => {
        unregister();
        ctx.setStatus({
          accountId: account.accountId,
          running: false,
          lastStopAt: Date.now(),
        });
      };
    },
  },
};
