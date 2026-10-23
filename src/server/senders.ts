import nodemailer from 'nodemailer'
import type { ChannelType } from './services/channels'
import { channelConfigSchemas } from './services/channels'

export type ChannelMessage = { title: string; body: string }

export type Sender = (message: ChannelMessage, config: unknown) => Promise<void>

export type SenderDeps = {
  fetchFn?: typeof fetch
  createTransport?: typeof nodemailer.createTransport
}

export function createSenders(
  deps: SenderDeps = {},
): Record<ChannelType, Sender> {
  const fetchFn = deps.fetchFn ?? fetch
  const createTransport = deps.createTransport ?? nodemailer.createTransport

  async function post(
    url: string,
    payload: unknown,
    headers: Record<string, string> = {},
  ): Promise<void> {
    const response = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw new Error(`delivery endpoint responded ${response.status}`)
    }
  }

  return {
    email: async (message, config) => {
      const parsed = channelConfigSchemas.email.parse(config)
      const transport = createTransport({
        host: parsed.host,
        port: parsed.port,
        secure: parsed.secure,
        ...(parsed.username
          ? { auth: { user: parsed.username, pass: parsed.password ?? '' } }
          : {}),
      })
      await transport.sendMail({
        from: parsed.from,
        to: parsed.to,
        subject: message.title,
        text: `${message.title}\n\n${message.body}`,
      })
    },
    ntfy: async (message, config) => {
      const parsed = channelConfigSchemas.ntfy.parse(config)
      const server = parsed.server.replace(/\/+$/, '')
      await post(
        server,
        { topic: parsed.topic, title: message.title, message: message.body },
        parsed.token ? { authorization: `Bearer ${parsed.token}` } : {},
      )
    },
    telegram: async (message, config) => {
      const parsed = channelConfigSchemas.telegram.parse(config)
      await post(`https://api.telegram.org/bot${parsed.botToken}/sendMessage`, {
        chat_id: parsed.chatId,
        text: `${message.title}\n${message.body}`,
      })
    },
    discord: async (message, config) => {
      const parsed = channelConfigSchemas.discord.parse(config)
      await post(parsed.webhookUrl, {
        content: `**${message.title}**\n${message.body}`,
      })
    },
    webhook: async (message, config) => {
      const parsed = channelConfigSchemas.webhook.parse(config)
      await post(
        parsed.url,
        { title: message.title, body: message.body, source: 'frist' },
        parsed.secret ? { authorization: `Bearer ${parsed.secret}` } : {},
      )
    },
  }
}

export const senders = createSenders()
