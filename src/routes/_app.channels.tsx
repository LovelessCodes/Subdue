import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useLocale, useTranslations } from 'use-intl'
import {
  BellRing,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Mail,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Trash,
  Webhook,
} from 'lucide-react'
import { ChannelForm } from '@/components/channel-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/ui/menu'
import { Switch } from '@/components/ui/switch'
import { cn } from 'cn'
import {
  deleteMyChannel,
  listMyChannels,
  listMyDeliveries,
  testMyChannel,
  updateMyChannel,
} from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'
import type { ChannelView } from '@/server/services/channels'

export const Route = createFileRoute('/_app/channels')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    return { user: session.user }
  },
  loader: async () => {
    const [channels, deliveries] = await Promise.all([
      listMyChannels(),
      listMyDeliveries(),
    ])
    return { channels, deliveries, now: Date.now() }
  },
  component: Channels,
})

/** Mirrors MAX_DELIVERY_ATTEMPTS in server/services/deliveries.ts. */
const RETRY_LIMIT = 3

type TestResult = { ok: boolean; error: string | null }

function Channels() {
  const { channels, deliveries, now } = Route.useLoaderData()
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('channels')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ChannelView | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ChannelView | null>(null)
  const [results, setResults] = useState<Record<string, TestResult>>({})
  const [error, setError] = useState<string | null>(null)

  // Newest first, so the first row seen per channel is its latest send.
  const lastByChannel = new Map<string, (typeof deliveries)[number]>()
  for (const delivery of deliveries) {
    if (!lastByChannel.has(delivery.channelId)) {
      lastByChannel.set(delivery.channelId, delivery)
    }
  }

  async function run(id: string, action: () => Promise<unknown>) {
    setPendingId(id)
    setError(null)
    try {
      await action()
      await router.invalidate()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('errGeneric'))
    } finally {
      setPendingId(null)
    }
  }

  async function test(channel: ChannelView) {
    setTestingId(channel.id)
    setError(null)
    try {
      const result = await testMyChannel({ data: { id: channel.id } })
      setResults((current) => ({ ...current, [channel.id]: result }))
    } catch (caught) {
      setResults((current) => ({
        ...current,
        [channel.id]: {
          ok: false,
          error: caught instanceof Error ? caught.message : t('errGeneric'),
        },
      }))
    } finally {
      setTestingId(null)
    }
  }

  return (
    <div className="min-h-full">
      <main className="flex w-full flex-col gap-6 px-6 py-8">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-medium">{t('title')}</h2>
              <p className="text-xs text-muted-foreground">
                {t('description')}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              <Plus className="size-3.5" />
              {t('addChannel')}
            </Button>
          </header>

          {channels.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {t('empty')}
            </p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t('colChannel')}</th>
                  <th className="px-4 py-2 font-medium">{t('colLastSend')}</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell">
                    {t('colEnabled')}
                  </th>
                  <th className="w-12 px-2 py-2">
                    <span className="sr-only">{t('colActions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {channels.map((channel, index) => {
                  const result = results[channel.id]
                  const testing = testingId === channel.id
                  const busy = testing || pendingId === channel.id
                  const last = lastByChannel.get(channel.id)
                  const endpoint = channelEndpoint(channel)

                  return (
                    <tr
                      key={channel.id}
                      className="animate-in fade-in-0 fill-mode-both duration-200 hover:bg-muted/30 motion-reduce:animate-none"
                      style={{ animationDelay: `${Math.min(index, 6) * 20}ms` }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground',
                              !channel.enabled && 'opacity-50',
                            )}
                          >
                            <ChannelGlyph
                              type={channel.type}
                              className="size-4"
                            />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {channel.name}
                              {channel.enabled ? null : (
                                <Badge variant="outline" className="ml-2">
                                  {t('disabledBadge')}
                                </Badge>
                              )}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[typeLabel(channel.type, t), endpoint]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[19rem]">
                          {testing ? (
                            <span className="flex animate-in items-center gap-1.5 text-xs text-muted-foreground fade-in-0 duration-150 motion-reduce:animate-none">
                              <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                              {t('testing')}
                            </span>
                          ) : result ? (
                            <span
                              className={cn(
                                'flex animate-in items-center gap-1.5 text-xs fade-in-0 slide-in-from-top-1 duration-150 motion-reduce:animate-none',
                                result.ok
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-destructive',
                              )}
                            >
                              {result.ok ? (
                                <CircleCheck className="size-3.5 shrink-0" />
                              ) : (
                                <CircleAlert className="size-3.5 shrink-0" />
                              )}
                              <span className="truncate">
                                {result.ok
                                  ? t('testDelivered')
                                  : t('testFailed', {
                                      error: result.error ?? '',
                                    })}
                              </span>
                            </span>
                          ) : last ? (
                            <span
                              className={cn(
                                'flex items-center gap-1.5 text-xs',
                                last.status === 'failed'
                                  ? 'text-destructive'
                                  : 'text-muted-foreground',
                              )}
                            >
                              <StatusDot status={last.status} />
                              <span className="truncate">
                                {last.status === 'failed'
                                  ? last.lastError
                                    ? t('lastFailed', {
                                        when: relativeTime(
                                          last.sentAt ?? last.createdAt,
                                          now,
                                          locale,
                                        ),
                                        error: last.lastError,
                                      })
                                    : t('lastFailedNoError', {
                                        when: relativeTime(
                                          last.sentAt ?? last.createdAt,
                                          now,
                                          locale,
                                        ),
                                      })
                                  : last.status === 'pending'
                                    ? last.attempts > 0
                                      ? t('retrying', {
                                          attempt: last.attempts,
                                          maxAttempts: RETRY_LIMIT,
                                        })
                                      : t('queued')
                                    : t('lastSent', {
                                        when: relativeTime(
                                          last.sentAt ?? last.createdAt,
                                          now,
                                          locale,
                                        ),
                                      })}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {t('neverSent')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <Switch
                          checked={channel.enabled}
                          disabled={busy}
                          onCheckedChange={(checked) =>
                            run(channel.id, () =>
                              updateMyChannel({
                                data: { id: channel.id, enabled: checked },
                              }),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-3 text-right">
                        <Menu>
                          <MenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t('actionsFor', {
                                  name: channel.name,
                                })}
                              />
                            }
                          >
                            <MoreHorizontal className="size-4" />
                          </MenuTrigger>
                          <MenuPopup align="end" className="w-44">
                            <MenuItem
                              closeOnClick
                              disabled={busy}
                              onClick={() => test(channel)}
                            >
                              {t('sendTest')}
                            </MenuItem>
                            <MenuItem
                              closeOnClick
                              onClick={() => {
                                setEditing(channel)
                                setOpen(true)
                              }}
                            >
                              <Pencil />
                              {t('edit')}
                            </MenuItem>
                            <MenuItem
                              variant="destructive"
                              closeOnClick
                              onClick={() => setConfirmDelete(channel)}
                            >
                              <Trash />
                              {t('deleteDots')}
                            </MenuItem>
                          </MenuPopup>
                        </Menu>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{t('deliveriesTitle')}</CardTitle>
            <CardDescription>{t('deliveriesDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {deliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('deliveriesEmpty')}
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {deliveries.map((delivery) => (
                  <li
                    key={delivery.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        {delivery.notificationTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {delivery.channelName} ({delivery.channelType}) ·{' '}
                        {t('attemptCount', { count: delivery.attempts })}
                        {delivery.lastError
                          ? ` · ${delivery.lastError.slice(0, 80)}`
                          : ''}
                      </p>
                    </div>
                    <Badge
                      variant={
                        delivery.status === 'failed'
                          ? 'destructive'
                          : delivery.status === 'sent'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {statusLabel(delivery.status, t)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>

      <ChannelForm open={open} onOpenChange={setOpen} channel={editing} />

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('deleteDescription', { name: confirmDelete?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {t('keep')}
            </DialogClose>
            <Button
              variant="destructive"
              disabled={
                confirmDelete !== null && pendingId === confirmDelete.id
              }
              onClick={() => {
                if (!confirmDelete) return
                run(confirmDelete.id, async () => {
                  try {
                    await deleteMyChannel({ data: { id: confirmDelete.id } })
                  } finally {
                    setConfirmDelete(null)
                  }
                })
              }}
            >
              {t('deleteChannel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type TypeLabelKey =
  | 'typeEmail'
  | 'typeNtfy'
  | 'typeTelegram'
  | 'typeDiscord'
  | 'typeWebhook'

const TYPE_LABELS: Record<string, TypeLabelKey | undefined> = {
  email: 'typeEmail',
  ntfy: 'typeNtfy',
  telegram: 'typeTelegram',
  discord: 'typeDiscord',
  webhook: 'typeWebhook',
}

function typeLabel(type: string, t: (key: TypeLabelKey) => string): string {
  const key = TYPE_LABELS[type]
  return key ? t(key) : type
}

type StatusLabelKey = 'statusSent' | 'statusFailed' | 'statusPending'

function statusLabel(
  status: string,
  t: (key: StatusLabelKey) => string,
): string {
  if (status === 'sent') return t('statusSent')
  if (status === 'failed') return t('statusFailed')
  if (status === 'pending') return t('statusPending')
  return status
}

function ChannelGlyph({
  type,
  className,
}: {
  type: string
  className?: string
}) {
  const Icon =
    type === 'email'
      ? Mail
      : type === 'ntfy'
        ? BellRing
        : type === 'telegram'
          ? Send
          : type === 'discord'
            ? MessagesSquare
            : Webhook
  return <Icon aria-hidden="true" className={className} />
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-1.5 shrink-0 rounded-full',
        status === 'sent'
          ? 'bg-emerald-500'
          : status === 'failed'
            ? 'bg-destructive'
            : 'bg-amber-500',
      )}
    />
  )
}

function configValue(config: ChannelView['config'], key: string): string {
  if (typeof config !== 'object' || config === null) {
    return ''
  }
  const value = (config as Record<string, unknown>)[key]
  return value === undefined || value === null ? '' : String(value)
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const first = parsed.pathname.split('/').filter(Boolean)[0]
    return first ? `${parsed.host}/${first}/…` : parsed.host
  } catch {
    return url
  }
}

/** One-line, secret-safe summary of where the channel delivers. */
function channelEndpoint(channel: ChannelView): string {
  const config = channel.config
  switch (channel.type) {
    case 'email':
      return configValue(config, 'to')
    case 'ntfy': {
      const server = hostOf(configValue(config, 'server'))
      const topic = configValue(config, 'topic')
      return server && topic ? `${server}/${topic}` : server || topic
    }
    case 'telegram':
      return configValue(config, 'chatId')
    case 'discord':
      return maskUrl(configValue(config, 'webhookUrl'))
    case 'webhook':
      return maskUrl(configValue(config, 'url'))
    default:
      return ''
  }
}

/** Relative label via the active locale, stable across SSR and hydration. */
function relativeTime(
  value: Date | string,
  now: number,
  locale: string,
): string {
  const time =
    value instanceof Date ? value.getTime() : new Date(value).getTime()
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const seconds = Math.round((now - time) / 1000)
  if (seconds < 60) return format.format(0, 'second')
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return format.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return format.format(-hours, 'hour')
  return format.format(-Math.round(hours / 24), 'day')
}
