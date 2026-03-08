// WeCom (Enterprise WeChat) API types

export type WeComAccessTokenResponse = {
  access_token: string;
  expires_in: number;
  errcode?: number;
  errmsg?: string;
};

export type WeComApiResponse = {
  errcode: number;
  errmsg: string;
};

export type WeComSendMessageResponse = WeComApiResponse & {
  msgid?: string;
  response_code?: string;
};

export type WeComInboundMessage = {
  ToUserName: string;
  FromUserName: string;
  CreateTime: number;
  MsgType: string;
  Content?: string;
  MsgId: string;
  AgentID?: number;
  Event?: string;
  MediaId?: string;
  Format?: string;
  ThumbMediaId?: string;
  Location_X?: number;
  Location_Y?: number;
  Scale?: number;
  Label?: string;
  Title?: string;
  Description?: string;
  Url?: string;
};

export type WeComTextContent = {
  content: string;
};

export type WeComTextCardContent = {
  title: string;
  description: string;
  url: string;
  btntxt?: string;
};

export type WeComSendTextPayload = {
  touser?: string;
  toparty?: string;
  totag?: string;
  msgtype: "text";
  agentid: number;
  text: WeComTextContent;
  safe?: number;
  enable_id_trans?: number;
  enable_duplicate_check?: number;
  duplicate_check_interval?: number;
};

export type WeComSendTextCardPayload = {
  touser?: string;
  toparty?: string;
  totag?: string;
  msgtype: "textcard";
  agentid: number;
  textcard: WeComTextCardContent;
  enable_id_trans?: number;
};

export type WeComAccountConfig = {
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

export type WeComChannelConfig = {
  accounts?: Record<string, WeComAccountConfig>;
  corpid?: string;
  corpsecret?: string;
  agentid?: number;
  token?: string;
  encodingAesKey?: string;
  dmPolicy?: string;
  allowFrom?: string[];
  enabled?: boolean;
  name?: string;
};

export type CoreConfig = {
  channels?: {
    wecom?: WeComChannelConfig;
  };
};
