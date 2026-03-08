import type {
  WeComAccessTokenResponse,
  WeComSendMessageResponse,
  WeComSendTextPayload,
} from "./types.js";

const WECOM_API_BASE = "https://qyapi.weixin.qq.com/cgi-bin";

type TokenCacheEntry = {
  token: string;
  expiresAt: number;
};

// Module-level access token cache keyed by `${corpid}:${corpsecret}`
const tokenCache = new Map<string, TokenCacheEntry>();

export async function getWeComAccessToken(corpid: string, corpsecret: string): Promise<string> {
  const cacheKey = `${corpid}:${corpsecret}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const url = `${WECOM_API_BASE}/gettoken?corpid=${encodeURIComponent(corpid)}&corpsecret=${encodeURIComponent(corpsecret)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`WeCom gettoken HTTP error: ${response.status}`);
  }

  const data = (await response.json()) as WeComAccessTokenResponse;
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`WeCom gettoken API error ${data.errcode}: ${data.errmsg ?? "unknown"}`);
  }
  if (!data.access_token) {
    throw new Error("WeCom gettoken returned empty access_token");
  }

  // Cache with a 60-second buffer before actual expiry
  const expiresAt = Date.now() + (data.expires_in - 60) * 1000;
  tokenCache.set(cacheKey, { token: data.access_token, expiresAt });

  return data.access_token;
}

export function evictWeComTokenCache(corpid: string, corpsecret: string): void {
  const cacheKey = `${corpid}:${corpsecret}`;
  tokenCache.delete(cacheKey);
}

export async function sendMessageWeCom(
  userId: string,
  text: string,
  opts: {
    accountId?: string;
    agentid: number;
    accessToken: string;
  },
): Promise<{ messageId?: string }> {
  const { agentid, accessToken } = opts;

  const payload: WeComSendTextPayload = {
    touser: userId,
    msgtype: "text",
    agentid,
    text: { content: text },
  };

  const url = `${WECOM_API_BASE}/message/send?access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`WeCom message/send HTTP error: ${response.status}`);
  }

  const data = (await response.json()) as WeComSendMessageResponse;
  if (data.errcode !== 0) {
    throw new Error(`WeCom message/send API error ${data.errcode}: ${data.errmsg ?? "unknown"}`);
  }

  return { messageId: data.msgid };
}
