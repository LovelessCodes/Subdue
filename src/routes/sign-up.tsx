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
import { CircleAlert, LoaderCircle } from 'lucide-react'
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

export const Route = createFileRoute('/sign-up')({
  loader: async () => ({ providers: await getAuthProviders() }),
  component: SignUp,
})

type Method = {
  id: string
  label: string
}

const EASE_OUT = 'ease-[cubic-bezier(0.23,1,0.32,1)]'
const rise = `animate-in fill-mode-both fade-in-0 slide-in-from-bottom-2 duration-300 ${EASE_OUT} motion-reduce:animate-none`
const fade =
  'animate-in fill-mode-both fade-in-0 duration-200 ease-out motion-reduce:animate-none'
const pop = `animate-in fill-mode-both fade-in-0 zoom-in-95 duration-200 ${EASE_OUT} motion-reduce:animate-none`

function SignUp() {
  const { providers } = Route.useLoaderData()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [pickedIndex, setPickedIndex] = useState<number | null>(null)

  const rowRefs = useRef<Array<HTMLButtonElement | null>>([])
  const indicatorRef = useRef<HTMLSpanElement | null>(null)

  const methods = useMemo<Method[]>(
    () =>
      providers.map((provider) => ({
        id: provider,
        label: `Continue with ${socialProviderLabel(provider)}`,
      })),
    [providers],
  )

  const active = pickedIndex ?? 0
  const busy = pending !== null

  const signInWith = useCallback(async (provider: string) => {
    setPending(provider)
    setError(null)
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: '/setup',
      } as Parameters<typeof authClient.signIn.social>[0])
    } catch {
      setError('Social sign-in failed to start.')
    } finally {
      setPending(null)
    }
  }, [])

  const runMethod = useCallback(
    (method: Method | undefined) => {
      if (!method || busy) return
      void signInWith(method.id)
    },
    [busy, signInWith],
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
      const result = await authClient.signUp.email({ name, email, password })

      if (result.error) {
        setError(result.error.message ?? 'Could not create the account.')
        return
      }
      window.location.assign('/setup')
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
            <span className="text-xs text-muted-foreground">
              Create account
            </span>
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
                    <ProviderMark id={method.id} className="size-4 shrink-0" />
                    <span className="flex-1 truncate font-medium">
                      {method.label}
                    </span>
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
              <Separator className="flex-1" />
            </div>
          ) : null}

          <form
            onSubmit={onSubmit}
            aria-label="Create an account"
            className="px-3 pb-3"
          >
            <div className="flex flex-col gap-2">
              <Input
                type="text"
                placeholder="Your name"
                aria-label="Name"
                autoComplete="name"
                required
                className="h-9"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  if (error) setError(null)
                }}
              />
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
                autoComplete="new-password"
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
                    Creating account…
                  </>
                ) : (
                  'Create account'
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
              Already have an account?{' '}
              <Link
                to="/sign-in"
                className="text-foreground underline underline-offset-4 hover:text-foreground/80"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <p
          className={cn('mt-5 text-center text-xs text-muted-foreground', rise)}
          style={{ animationDelay: '280ms' }}
        >
          The first account can claim the administrator role on the setup page.
        </p>
      </div>
    </div>
  )
}
