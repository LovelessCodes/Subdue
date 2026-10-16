import { useEffect, useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
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
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/ui/menu'
import { cn } from 'cn'
import {
  createMyApiKey,
  disableIcal,
  enableIcal,
  getIcalStatus,
  listMyApiKeys,
  revokeMyApiKey,
  rotateIcal,
} from '@/lib/app.functions'
import { getSession } from '@/lib/auth.functions'

export const Route = createFileRoute('/_app/integrations')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
    return { user: session.user }
  },
  loader: async () => {
    const [ical, keys] = await Promise.all([getIcalStatus(), listMyApiKeys()])
    return { ical, keys }
  },
  component: Integrations,
})

function maskedPath(path: string) {
  return `${path.slice(0, path.lastIndexOf('/') + 1)}${'•'.repeat(22)}`
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString()
}

/** Copy icon that crossfades into a check while the value is on the clipboard. */
function CopyGlyph({ copied }: { copied: boolean }) {
  return (
    <span className="relative block size-3.5" aria-hidden="true">
      <Copy
        className={cn(
          'absolute inset-0 size-3.5 transition-[opacity,transform] duration-150 ease-out',
          copied ? 'scale-50 opacity-0' : 'scale-100 opacity-100',
        )}
      />
      <Check
        className={cn(
          'absolute inset-0 size-3.5 text-emerald-600 transition-[opacity,transform] duration-150 ease-out dark:text-emerald-400',
          copied ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
        )}
      />
    </span>
  )
}

function Integrations() {
  const { ical, keys } = Route.useLoaderData()
  const router = useRouter()
  const [origin, setOrigin] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'feed' | 'key' | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [flash, setFlash] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [revokeId, setRevokeId] = useState<string | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const feedUrl = ical.path ? `${origin}${ical.path}` : null
  const revoking = keys.find((key) => key.id === revokeId) ?? null

  async function run(action: () => Promise<unknown>) {
    setPending(true)
    setError(null)
    try {
      await action()
      await router.invalidate()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Something went wrong.',
      )
    } finally {
      setPending(false)
    }
  }

  async function copy(value: string, flag: 'feed' | 'key') {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(flag)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // clipboard unavailable: the value is visible for manual copying
    }
  }

  function rotate() {
    setRotateOpen(false)
    setRevealed(true)
    setFlash(true)
    window.setTimeout(() => setFlash(false), 1400)
    void run(() => rotateIcal())
  }

  function disableFeed() {
    setDisableOpen(false)
    void run(() => disableIcal())
  }

  function createKey() {
    const name = keyName.trim()
    setCreateOpen(false)
    setKeyName('')
    void run(async () => {
      const created = await createMyApiKey({ data: { name } })
      setCreatedKey(created.key)
    })
  }

  function revokeSelected() {
    const keyId = revokeId
    if (!keyId) return
    setRevokeId(null)
    void run(() => revokeMyApiKey({ data: { keyId } }))
  }

  return (
    <div className="min-h-full">
      <main className="flex w-full flex-col gap-5 px-6 py-8">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-lg font-medium">Integrations</h1>
          <p className="flex max-w-prose items-start gap-2 text-xs text-muted-foreground">
            <ShieldAlert
              className="mt-px size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span>
              The feed URL and every API key are bearer credentials — anyone who
              has one can read everything in your account.
            </span>
          </p>
        </header>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1.5">
              <CardTitle>Calendar feed</CardTitle>
              <CardDescription>
                Subscribe in Google Calendar, Apple Calendar or anything that
                speaks iCal. Twelve months of payments, with alarms from your
                reminder settings.
              </CardDescription>
            </div>
            <CardAction>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    ical.path ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                  )}
                  aria-hidden="true"
                />
                {ical.path ? 'Active' : 'Disabled'}
              </span>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {feedUrl ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Feed URL
                  </p>
                  <div
                    className={cn(
                      'flex items-center gap-1 rounded-lg border border-border bg-muted/30 py-1 pr-1 pl-3 transition-shadow duration-300 ease-out',
                      flash && 'ring-2 ring-primary/40',
                    )}
                  >
                    <code
                      key={revealed ? 'revealed' : 'masked'}
                      className="min-w-0 flex-1 animate-in truncate font-mono text-xs fade-in-0 duration-150"
                    >
                      {revealed
                        ? feedUrl
                        : `${origin}${maskedPath(ical.path ?? '')}`}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={
                        revealed ? 'Hide feed URL' : 'Reveal feed URL'
                      }
                      onClick={() => setRevealed((value) => !value)}
                    >
                      {revealed ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Copy feed URL"
                      onClick={() => copy(feedUrl, 'feed')}
                    >
                      <CopyGlyph copied={copied === 'feed'} />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => setRotateOpen(true)}
                  >
                    <RefreshCw className="size-3.5" />
                    Rotate URL
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() => setDisableOpen(true)}
                  >
                    Disable feed
                  </Button>
                </div>
                <p className="-mt-1 text-xs text-muted-foreground">
                  Rotating invalidates the old URL immediately — every
                  subscribed calendar needs the new one.
                </p>
              </>
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-4">
                <p className="text-sm text-muted-foreground">
                  The feed is off. Enable it to get a URL calendars can
                  subscribe to.
                </p>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => enableIcal())}
                >
                  Enable feed
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1.5">
              <CardTitle>API keys</CardTitle>
              <CardDescription>
                Full access for scripts and dashboards: send{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  x-api-key
                </code>{' '}
                instead of a session cookie. Limited to 600 requests per hour
                per key.
              </CardDescription>
            </div>
            <CardAction>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="size-3.5" />
                Create key
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {createdKey ? (
              <div className="flex animate-in flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 duration-200 fade-in-0 slide-in-from-top-1">
                <p className="text-xs font-medium">
                  This key is shown once — store it somewhere safe.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
                    {createdKey}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copy(createdKey, 'key')}
                  >
                    <CopyGlyph copied={copied === 'key'} />
                    {copied === 'key' ? 'Copied' : 'Copy'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCreatedKey(null)}
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : null}

            {keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No keys yet — create one when a script needs access.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Key</th>
                      <th className="px-3 py-2 font-medium">Created</th>
                      <th className="px-3 py-2 font-medium">Last used</th>
                      <th className="w-10 px-2 py-2">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {keys.map((key) => (
                      <tr
                        key={key.id}
                        className="transition-colors duration-150 ease-out hover:bg-muted/30"
                      >
                        <td className="px-3 py-2.5 text-sm font-medium">
                          {key.name ?? 'Unnamed key'}
                          {key.enabled ? null : (
                            <Badge variant="outline" className="ml-2">
                              disabled
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                          {key.start ? `${key.start}…` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                          {formatDate(key.createdAt)}
                        </td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                          {key.lastRequest
                            ? formatDate(key.lastRequest)
                            : 'never'}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <Menu>
                            <MenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Actions for ${key.name ?? 'unnamed key'}`}
                                />
                              }
                            >
                              <MoreHorizontal className="size-4" />
                            </MenuTrigger>
                            <MenuPopup align="end" className="w-44">
                              <MenuItem
                                variant="destructive"
                                closeOnClick
                                disabled={pending}
                                onClick={() => setRevokeId(key.id)}
                              >
                                Revoke key
                              </MenuItem>
                            </MenuPopup>
                          </Menu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate the feed URL?</DialogTitle>
            <DialogDescription>
              The current URL stops working immediately. Every subscribed
              calendar needs the new one before it syncs again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button size="sm" disabled={pending} onClick={rotate}>
              Rotate URL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable the feed?</DialogTitle>
            <DialogDescription>
              Subscribed calendars stop updating immediately. If you enable it
              again, the URL will be new.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Keep it
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={disableFeed}
            >
              Disable feed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setKeyName('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Name it after where it runs — “Home dashboard”, “n8n”, “Raycast”.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (keyName.trim()) createKey()
            }}
          >
            <Field>
              <FieldLabel htmlFor="key-name">Key name</FieldLabel>
              <Input
                id="key-name"
                autoFocus
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
                placeholder="Home dashboard"
              />
            </Field>
            <DialogFooter>
              <DialogClose
                render={<Button variant="outline" size="sm" type="button" />}
              >
                Cancel
              </DialogClose>
              <Button
                type="submit"
                size="sm"
                disabled={pending || !keyName.trim()}
              >
                Create key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={revokeId !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke this key?</DialogTitle>
            <DialogDescription>
              Requests using “{revoking?.name ?? 'this key'}” start failing
              immediately. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Keep key
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={revokeSelected}
            >
              Revoke key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
