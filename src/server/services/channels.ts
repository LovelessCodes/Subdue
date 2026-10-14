import { and, asc, eq } from 'drizzle-orm'
import * as z from 'zod'
import { channel } from '../../lib/auth-schema'
import type { Database } from '../../lib/db'

export const channelTypes = [
  'email',
  'ntfy',
  'telegram',
  'discord',
  'webhook',
] as const
export type ChannelType = (typeof channelTypes)[number]

const emailConfig = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  username: z.string().optional(),
  password: z.string().optional(),
  from: z.string().min(3),
  to: z.string().min(3),
})

const ntfyConfig = z.object({
  server: z.url().default('https://ntfy.sh'),
  topic: z.string().min(1),
  token: z.string().optional(),
})

const telegramConfig = z.object({
  botToken: z.string().min(1),
  chatId: z.string().min(1),
})

const discordConfig = z.object({
  webhookUrl: z.url(),
})

const webhookConfig = z.object({
  url: z.url(),
  secret: z.string().optional(),
})

export const channelConfigSchemas = {
  email: emailConfig,
  ntfy: ntfyConfig,
  telegram: telegramConfig,
  discord: discordConfig,
  webhook: webhookConfig,
}

export type ChannelConfigMap = {
  email: z.infer<typeof emailConfig>
  ntfy: z.infer<typeof ntfyConfig>
  telegram: z.infer<typeof telegramConfig>
  discord: z.infer<typeof discordConfig>
  webhook: z.infer<typeof webhookConfig>
}

export type ChannelConfig = ChannelConfigMap[ChannelType]

export function parseChannelConfig<Type extends ChannelType>(
  type: Type,
  raw: unknown,
): ChannelConfigMap[Type] {
  return channelConfigSchemas[type].parse(raw) as ChannelConfigMap[Type]
}

export function decodeChannelConfig<Type extends ChannelType>(
  type: Type,
  stored: string,
): ChannelConfigMap[Type] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    throw new Error('stored channel config is not valid JSON')
  }
  return parseChannelConfig(type, parsed)
}

export type Channel = typeof channel.$inferSelect

export type ChannelInput = {
  type: ChannelType
  name: string
  config: ChannelConfig
  enabled?: boolean
}

export type ChannelPatch = {
  name?: string
  config?: unknown
  enabled?: boolean
}

export type ChannelView = Omit<Channel, 'config'> & {
  config: ChannelConfig | string
}

export function channelView(row: Channel): ChannelView {
  let config: ChannelConfig | string = row.config
  try {
    config = decodeChannelConfig(row.type as ChannelType, row.config)
  } catch {
    // keep the raw string so a corrupt row is visible instead of fatal
  }
  return { ...row, config }
}

export async function listChannels(
  db: Database,
  userId: string,
): Promise<Channel[]> {
  return db
    .select()
    .from(channel)
    .where(eq(channel.userId, userId))
    .orderBy(asc(channel.createdAt))
}

export async function listEnabledChannels(
  db: Database,
  userId: string,
): Promise<Channel[]> {
  return db
    .select()
    .from(channel)
    .where(and(eq(channel.userId, userId), eq(channel.enabled, true)))
    .orderBy(asc(channel.createdAt))
}

export async function getChannel(
  db: Database,
  userId: string,
  id: string,
): Promise<Channel | null> {
  const rows = await db
    .select()
    .from(channel)
    .where(and(eq(channel.id, id), eq(channel.userId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createChannel(
  db: Database,
  userId: string,
  input: ChannelInput,
): Promise<Channel> {
  const rows = await db
    .insert(channel)
    .values({
      id: crypto.randomUUID(),
      userId,
      type: input.type,
      name: input.name,
      enabled: input.enabled ?? true,
      config: JSON.stringify(input.config),
      createdAt: new Date(),
    })
    .returning()

  const row = rows[0]
  if (!row) {
    throw new Error('CHANNEL_CREATE_FAILED')
  }
  return row
}

export async function updateChannel(
  db: Database,
  userId: string,
  id: string,
  patch: ChannelPatch,
): Promise<Channel | null> {
  const existing = await getChannel(db, userId, id)
  if (!existing) {
    return null
  }

  const values: { name?: string; enabled?: boolean; config?: string } = {}
  if (patch.name !== undefined) {
    values.name = patch.name
  }
  if (patch.enabled !== undefined) {
    values.enabled = patch.enabled
  }
  if (patch.config !== undefined) {
    values.config = JSON.stringify(
      parseChannelConfig(existing.type as ChannelType, patch.config),
    )
  }

  if (Object.keys(values).length === 0) {
    return existing
  }

  const rows = await db
    .update(channel)
    .set(values)
    .where(and(eq(channel.id, id), eq(channel.userId, userId)))
    .returning()

  return rows[0] ?? null
}

export async function deleteChannel(
  db: Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(channel)
    .where(and(eq(channel.id, id), eq(channel.userId, userId)))
    .returning({ id: channel.id })

  return rows.length > 0
}
