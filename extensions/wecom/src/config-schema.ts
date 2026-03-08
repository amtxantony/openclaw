import { z } from "zod";

export const WeComAccountSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().default(true),
  corpid: z.string().min(1),
  corpsecret: z.string().min(1),
  agentid: z.number().int().positive(),
  token: z.string().min(1), // for webhook signature verification
  encodingAesKey: z.string().optional(), // for message encryption
  dmPolicy: z.enum(["open", "pairing"]).default("pairing"),
  allowFrom: z.array(z.string()).default([]),
});

export const WeComConfigSchema = z
  .object({
    accounts: z.record(WeComAccountSchema).optional(),
    // top-level (single account) fields
    corpid: z.string().optional(),
    corpsecret: z.string().optional(),
    agentid: z.number().optional(),
    token: z.string().optional(),
    encodingAesKey: z.string().optional(),
    dmPolicy: z.enum(["open", "pairing"]).optional(),
    allowFrom: z.array(z.string()).optional(),
    enabled: z.boolean().optional(),
    name: z.string().optional(),
  })
  .optional();

export type WeComAccountInput = z.infer<typeof WeComAccountSchema>;
export type WeComConfigInput = z.infer<typeof WeComConfigSchema>;
