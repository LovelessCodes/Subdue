import { describe, expect, it } from 'vitest'
import { createSenders, type SenderDeps } from '@/server/senders'

type Call = { url: string; init: RequestInit }

function recordingFetch(calls: Call[], status = 200): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return new Response('', { status })
  }) as typeof fetch
}

function headerOf(call: Call, name: string): string | undefined {
  return (call.init.headers as Record<string, string> | undefined)?.[name]
}

describe('senders', () => {
  it('publishes to ntfy as JSON with optional auth', async () => {
    const calls: Call[] = []
    const senders = createSenders({ fetchFn: recordingFetch(calls) })

    await senders.ntfy(
      { title: 'T', body: 'B' },
      { server: 'https://ntfy.example/', topic: 'subs', token: 'tk' },
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://ntfy.example')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      topic: 'subs',
      title: 'T',
      message: 'B',
    })
    expect(headerOf(calls[0] as Call, 'authorization')).toBe('Bearer tk')
  })

  it('posts discord content and telegram messages', async () => {
    const calls: Call[] = []
    const senders = createSenders({ fetchFn: recordingFetch(calls) })

    await senders.discord(
      { title: 'T', body: 'B' },
      { webhookUrl: 'https://discord.example/wh' },
    )
    await senders.telegram(
      { title: 'T', body: 'B' },
      { botToken: 'tok', chatId: '42' },
    )

    expect(calls[0]?.url).toBe('https://discord.example/wh')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      content: '**T**\nB',
    })
    expect(calls[1]?.url).toBe('https://api.telegram.org/bottok/sendMessage')
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      chat_id: '42',
      text: 'T\nB',
    })
  })

  it('signs webhooks and surfaces non-2xx responses', async () => {
    const calls: Call[] = []
    const senders = createSenders({ fetchFn: recordingFetch(calls) })

    await senders.webhook(
      { title: 'T', body: 'B' },
      { url: 'https://hook.example/x', secret: 's3' },
    )
    expect(headerOf(calls[0] as Call, 'authorization')).toBe('Bearer s3')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      title: 'T',
      body: 'B',
      source: 'subdue',
    })

    const failing = createSenders({ fetchFn: recordingFetch([], 500) })
    await expect(
      failing.webhook(
        { title: 'T', body: 'B' },
        { url: 'https://hook.example/x' },
      ),
    ).rejects.toThrow('500')
  })

  it('maps email config onto a transport', async () => {
    const sent: {
      options: Record<string, unknown>
      mail: Record<string, unknown>
    }[] = []
    const fakeTransport = ((options: Record<string, unknown>) => ({
      sendMail: async (mail: Record<string, unknown>) => {
        sent.push({ options, mail })
      },
    })) as unknown as SenderDeps['createTransport']

    const senders = createSenders({ createTransport: fakeTransport })
    await senders.email(
      { title: 'Subject', body: 'Body' },
      {
        host: 'smtp.example',
        port: 465,
        secure: true,
        username: 'u',
        password: 'p',
        from: 'a@b.c',
        to: 'd@e.f',
      },
    )

    expect(sent[0]?.options).toMatchObject({
      host: 'smtp.example',
      port: 465,
      secure: true,
      auth: { user: 'u', pass: 'p' },
    })
    expect(sent[0]?.mail).toMatchObject({
      from: 'a@b.c',
      to: 'd@e.f',
      subject: 'Subject',
    })
  })
})
