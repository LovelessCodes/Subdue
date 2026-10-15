import { Link, createFileRoute } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CircleAlert, Fingerprint, LoaderCircle } from 'lucide-react'
import { cn } from 'cn'
import { Kbd } from '@/components/kbd'
import { PasswordInput } from '@/components/password-input'
import { ProviderMark } from '@/components/provider-mark'
import { SubdueMark } from '@/components/subdue-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { getAuthProviders } from '@/lib/app.functions'
import { authClient } from '@/lib/auth-client'
import { socialProviderLabel } from '@/lib/social-providers'

export const Route = createFileRoute('/sign-in')({
  loader: async () => ({ providers: await getAuthProviders() }),
  component: SignIn,
})

type MethodRow = {
  id: string
  label: string
  kind: 'social' | 'passkey'
}

const EASE_OUT = 'ease-[cubic-bezier(0.23,1,0.32,1)]'
const rise = `animate-in fill-mode-both fade-in-0 slide-in-from-bottom-2 duration-300 ${EASE_OUT} motion-reduce:animate-none`
const fade =
  'animate-in fill-mode-both fade-in-0 duration-200 ease-out motion-reduce:animate-none'
const pop = `animate-in fill-mode-both fade-in-0 zoom-in-95 duration-200 ${EASE_OUT} motion-reduce:animate-none`

function SignIn() {
  const { providers } = Route.useLoaderData()
  const [lastMethod, setLastMethod] = useState<string | null>(null)
  const [passkeyReady, setPasskeyReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [pickedIndex, setPickedIndex] = useState<number | null>(null)

  const rowRefs = useRef<Array<HTMLButtonElement | null>>([])
  const indicatorRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    setLastMethod(authClient.getLastUsedLoginMethod())
    setPasskeyReady(
      typeof window !== 'undefined' &&
        window.isSecureContext &&
        Boolean(window.PublicKeyCredential),
    )
  }, [])

  const methods = useMemo<MethodRow[]>(() => {
    const rows: MethodRow[] = providers.map((provider) => ({
      id: provider,
      label: `Continue with ${socialProviderLabel(provider)}`,
      kind: 'social',
    }))
    if (passkeyReady) {
      rows.push({
        id: 'passkey',
        label: 'Sign in with a passkey',
        kind: 'passkey',
      })
    }
    return rows
  }, [providers, passkeyReady])

  const lastUsedIndex = methods.findIndex((method) => method.id === lastMethod)
  const active = pickedIndex ?? (lastUsedIndex >= 0 ? lastUsedIndex : 0)
  const busy = pending !== null

  const signInWithPasskey = useCallback(async () => {
    setPending('passkey')
    setError(null)
    try {
      const result = await authClient.signIn.passkey()
      if (result?.error) {
        setError(
          /cancel|NotAllowedError|abort/i.test(result.error.message ?? '')
            ? 'The passkey prompt was cancelled.'
            : (result.error.message ?? 'No passkey worked for this site.'),
        )
        return
      }
      window.location.assign('/')
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Passkey sign-in failed.',
      )
    } finally {
      setPending(null)
    }
  }, [])

  const signInWith = useCallback(async (provider: string) => {
    setPending(provider)
    setError(null)
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: '/',
      } as Parameters<typeof authClient.signIn.social>[0])
    } catch {
      setError('Social sign-in failed to start.')
    } finally {
      setPending(null)
    }
  }, [])

  const runMethod = useCallback(
    (method: MethodRow | undefined) => {
      if (!method || busy) return
      if (method.kind === 'passkey') void signInWithPasskey()
      else void signInWith(method.id)
    },
    [busy, signInWith, signInWithPasskey],
  )

  useLayoutEffect(() => {
    const row = rowRefs.current[active]
    const indicator = indicatorRef.current
    if (!row || !indicator) return
    indicator.style.height = `${row.offsetHeight}px`
    indicator.style.transform = `translateY(${row.offsetTop}px)`
  }, [active, methods.length])

  useEffect(() => {
    function move(next: number) {
      if (methods.length === 0) return
      const index = Math.max(0, Math.min(methods.length - 1, next))
      setPickedIndex(index)
      rowRefs.current[index]?.focus()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
          target.isContentEditable)
      ) {
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        move(active + 1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        move(active - 1)
      } else if (event.key === 'Enter' && target?.tagName !== 'BUTTON') {
        event.preventDefault()
        runMethod(methods[active])
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, methods, runMethod])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending('email')
    setError(null)

    try {
      const search = window.location.search.slice(1)
      const oauthQuery = search.includes('sig=') ? search : undefined

      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
        }),
      })

      const data = (await response.json()) as {
        url?: string
        message?: string
        twoFactorRedirect?: boolean
      }

      if (!response.ok) {
        setError(data.message ?? 'Sign-in failed')
        return
      }

      if (data.twoFactorRedirect) {
        window.location.assign('/two-factor')
        return
      }

      window.location.assign(data.url ?? '/')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 50% at 50% 15%, color-mix(in oklch, var(--foreground) 7%, transparent), transparent 72%)',
        }}
      />

      <div className="relative w-full max-w-[400px]">
        <div
          className={cn(
            'overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-xl shadow-black/5 ring-1 ring-foreground/10 dark:shadow-black/40',
            pop,
          )}
        >
          <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
            <span className={cn('flex items-center gap-2', fade)}>
              <SubdueMark className="size-5" />
              <span className="text-sm font-semibold tracking-tight">
                Subdue
              </span>
            </span>
            <span className="text-xs text-muted-foreground">Sign in</span>
          </div>

          {methods.length > 0 ? (
            <div className="relative max-h-80 overflow-y-auto px-1.5 pt-2 pb-1">
              <span
                ref={indicatorRef}
                aria-hidden="true"
                className={cn(
                  'absolute inset-x-1.5 top-0 rounded-lg bg-accent transition-transform duration-200 motion-reduce:transition-none',
                  EASE_OUT,
                )}
              />

              {methods.map((method, index) => {
                const isActive = index === active
                const isPending = pending === method.id

                return (
                  <button
                    key={method.id}
                    type="button"
                    ref={(element) => {
                      rowRefs.current[index] = element
                    }}
                    disabled={busy}
                    onMouseEnter={() => setPickedIndex(index)}
                    onFocus={() => setPickedIndex(index)}
                    onClick={() => runMethod(method)}
                    className={cn(
                      'relative flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm transition-colors duration-150 ease-out disabled:opacity-50',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
                      rise,
                    )}
                    style={{ animationDelay: `${60 + index * 35}ms` }}
                  >
                    {method.kind === 'passkey' ? (
                      <Fingerprint className="size-4 shrink-0" />
                    ) : (
                      <ProviderMark
                        id={method.id}
                        className="size-4 shrink-0"
                      />
                    )}
                    <span className="flex-1 truncate font-medium">
                      {method.label}
                    </span>
                    {method.id === lastMethod ? (
                      <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] tracking-wide text-muted-foreground uppercase ring-1 ring-border">
                        last used
                      </span>
                    ) : null}
                    {isPending ? (
                      <LoaderCircle className="size-4 shrink-0 animate-spin" />
                    ) : (
                      <Kbd
                        className={cn(
                          'transition-opacity duration-150 ease-out',
                          isActive ? 'opacity-100' : 'opacity-0',
                        )}
                      >
                        ⏎
                      </Kbd>
                    )}
                  </button>
                )
              })}
            </div>
          ) : null}

          {methods.length > 0 ? (
            <div
              className={cn(
                'mx-1.5 mt-3 mb-2.5 flex items-center gap-3 px-1 text-[10px] tracking-[0.08em] text-muted-foreground uppercase',
                rise,
              )}
            >
              <Separator className="flex-1" />
              <span className="whitespace-nowrap">email &amp; password</span>
              {lastMethod === 'email' ? (
                <span className="rounded-full bg-background/80 px-1.5 py-0.5 tracking-wide ring-1 ring-border">
                  last used
                </span>
              ) : null}
              <Separator className="flex-1" />
            </div>
          ) : null}

          <form
            onSubmit={onSubmit}
            aria-label="Sign in with email and password"
            className="px-3 pb-3"
          >
            <div className="flex flex-col gap-2">
              <Input
                type="email"
                placeholder="you@example.com"
                aria-label="Email"
                autoComplete="email"
                required
                className="h-9"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  if (error) setError(null)
                }}
              />
              <PasswordInput
                enterHint
                placeholder="Password"
                aria-label="Password"
                autoComplete="current-password"
                required
                size="lg"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (error) setError(null)
                }}
              />
              <Button type="submit" className="h-9 w-full" disabled={busy}>
                {pending === 'email' ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </div>
          </form>

          {error ? (
            <p
              role="alert"
              className={cn(
                'flex items-center gap-2 border-t px-4 py-2.5 text-xs text-destructive',
                rise,
              )}
            >
              <CircleAlert className="size-3.5 shrink-0" />
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-t bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground sm:justify-between">
            <p className="hidden items-center gap-1.5 sm:flex">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span>navigate</span>
              <Kbd>⏎</Kbd>
              <span>select</span>
            </p>
            <p>
              New here?{' '}
              <Link
                to="/sign-up"
                className="text-foreground underline underline-offset-4 hover:text-foreground/80"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>

        <p
          className={cn('mt-5 text-center text-xs text-muted-foreground', rise)}
          style={{ animationDelay: '280ms' }}
        >
          Self-hosted · your data never leaves your server
        </p>
      </div>
    </div>
  )
}
