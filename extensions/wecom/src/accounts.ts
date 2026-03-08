import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";
import type { WeComChannelConfig, WeComAccountConfig } from "./types.js";

export type ResolvedWeComAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  corpid: string;
  corpsecret: string;
  agentid: number;
  token: string;
  encodingAesKey?: string;
  dmPolicy: string;
  allowFrom: string[];
};

function getWeComChannelConfig(cfg: OpenClawConfig): WeComChannelConfig | undefined {
  return (cfg.channels as Record<string, unknown> | undefined)?.[
    "wecom"
  ] as WeComChannelConfig | undefined;
}

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const channel = getWeComChannelConfig(cfg);
  const accounts = channel?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean);
}

export function listWeComAccountIds(cfg: OpenClawConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids.toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultWeComAccountId(cfg: OpenClawConfig): string {
  const ids = listWeComAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): Partial<WeComAccountConfig> | undefined {
  const channel = getWeComChannelConfig(cfg);
  const accounts = channel?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  return accounts[accountId];
}

function mergeWeComAccountConfig(cfg: OpenClawConfig, accountId: string): Partial<WeComAccountConfig> {
  const channel = getWeComChannelConfig(cfg);
  const { accounts: _ignored, ...base } = channel ?? {};
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account } as Partial<WeComAccountConfig>;
}

export function resolveWeComAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedWeComAccount {
  const accountId = normalizeAccountId(params.accountId);
  const channel = getWeComChannelConfig(params.cfg);
  const baseEnabled = channel?.enabled !== false;
  const merged = mergeWeComAccountConfig(params.cfg, accountId);
  const accountEnabled = (merged as { enabled?: boolean }).enabled !== false;
  const enabled = baseEnabled && accountEnabled;

  return {
    accountId,
    name: merged.name?.trim() || undefined,
    enabled,
    corpid: merged.corpid ?? "",
    corpsecret: merged.corpsecret ?? "",
    agentid: merged.agentid ?? 0,
    token: merged.token ?? "",
    encodingAesKey: merged.encodingAesKey,
    dmPolicy: merged.dmPolicy ?? "pairing",
    allowFrom: merged.allowFrom ?? [],
  };
}

export function listEnabledWeComAccounts(cfg: OpenClawConfig): ResolvedWeComAccount[] {
  return listWeComAccountIds(cfg)
    .map((accountId) => resolveWeComAccount({ cfg, accountId }))
    .filter(
      (account) =>
        account.enabled && account.corpid && account.corpsecret && account.agentid && account.token,
    );
}
