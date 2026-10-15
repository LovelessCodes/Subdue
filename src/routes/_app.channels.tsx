import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Pencil } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
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
    return { channels, deliveries }
  },
  component: Channels,
})

type TestResult = { ok: boolean; error: string | null }

function Channels() {
  const { channels, deliveries } = Route.useLoaderData()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ChannelView | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, TestResult>>({})
  const [error, setError] = useState<string | null>(null)

  async function run(id: string, action: () => Promise<unknown>) {
    setPendingId(id)
    setError(null)
    try {
      await action()
      await router.invalidate()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Something went wrong.',
      )
    } finally {
      setPendingId(null)
    }
  }

  async function test(channel: ChannelView) {
    setPendingId(channel.id)
    try {
      const result = await testMyChannel({ data: { id: channel.id } })
      setResults((current) => ({ ...current, [channel.id]: result }))
    } catch (caught) {
      setResults((current) => ({
        ...current,
        [channel.id]: {
          ok: false,
          error: caught instanceof Error ? caught.message : 'Test failed.',
        },
      }))
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="min-h-full">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Delivery channels</CardTitle>
                <CardDescription>
                  Every reminder fans out to each enabled channel.
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null)
                  setOpen(true)
                }}
              >
                Add channel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No channels yet — add one and Subdue will start reaching you
                outside the inbox.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {channels.map((channel) => (
                  <li key={channel.id} className="flex flex-col gap-2 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">
                            {channel.name}
                          </p>
                          <Badge variant="outline">{channel.type}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {channel.enabled ? 'enabled' : 'disabled'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={channel.enabled}
                          disabled={pendingId === channel.id}
                          onCheckedChange={(checked) =>
                            run(channel.id, () =>
                              updateMyChannel({
                                data: { id: channel.id, enabled: checked },
                              }),
                            )
                          }
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pendingId === channel.id}
                          onClick={() => test(channel)}
                        >
                          Test
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${channel.name}`}
                          onClick={() => {
                            setEditing(channel)
                            setOpen(true)
                          }}
                        >
                          <Pencil />
                        </Button>
                        {confirmDelete === channel.id ? (
                          <>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={pendingId === channel.id}
                              onClick={() =>
                                run(channel.id, async () => {
                                  await deleteMyChannel({
                                    data: { id: channel.id },
                                  })
                                  setConfirmDelete(null)
                                })
                              }
                            >
                              Confirm delete
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDelete(null)}
                            >
                              Keep
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDelete(channel.id)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                    {results[channel.id] ? (
                      <p
                        className={`text-xs ${results[channel.id]?.ok ? 'text-muted-foreground' : 'text-destructive'}`}
                      >
                        {results[channel.id]?.ok
                          ? 'Test delivered — go check it arrived.'
                          : `Test failed: ${results[channel.id]?.error}`}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent deliveries</CardTitle>
            <CardDescription>
              The last 20 sends, with retries and their last error.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing sent yet — deliveries appear here once a reminder fires.
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
                        {delivery.attempts}{' '}
                        {delivery.attempts === 1 ? 'attempt' : 'attempts'}
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
                      {delivery.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>

      <ChannelForm open={open} onOpenChange={setOpen} channel={editing} />
    </div>
  )
}
