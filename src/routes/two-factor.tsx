import { Fragment, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Link, createFileRoute } from '@tanstack/react-router'
import { CircleAlert } from 'lucide-react'
import { cn } from 'cn'
import { Kbd } from '@/components/kbd'
import { FristMark } from '@/components/frist-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  OTPField,
  OTPFieldInput,
  OTPFieldSeparator,
} from '@/components/ui/otp-field'
import { Separator } from '@/components/ui/separator'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/two-factor')({
  component: TwoFactorPage,
})

const TOTP_PERIOD = 30

const EASE_OUT = 'ease-[cubic-bezier(0.23,1,0.32,1)]'
const rise = `animate-in fill-mode-both fade-in-0 slide-in-from-bottom-2 duration-300 ${EASE_OUT} motion-reduce:animate-none`
const fade =
  'animate-in fill-mode-both fade-in-0 duration-200 ease-out motion-reduce:animate-none'
const pop = `animate-in fill-mode-both fade-in-0 zoom-in-95 duration-200 ${EASE_OUT} motion-reduce:animate-none`

/**
 * The authenticator's code window: a rAF drain (smooth without a React render
 * per frame), the whole-second countdown, and a cycle counter that ticks over
 * when the code rolls.
 */
function useTotpWindow({
  period = TOTP_PERIOD,
  onProgress,
}: {
  period?: number
  onProgress?: (progress: number) => void
} = {}) {
  const [secondsLeft, setSecondsLeft] = useState(period)
  const [cycle, setCycle] = useState(0)
  const progressRef = useRef(onProgress)

  useEffect(() => {
    progressRef.current = onProgress
  })

  useEffect(() => {
    let frame = 0
    let lastSecond = -1

    const tick = () => {
      const now = Date.now() / 1000
      const left = period - (now % period)
      const nextSecond = Math.ceil(left)

      progressRef.current?.(left / period)
      if (nextSecond !== lastSecond) {
        if (lastSecond !== -1 && nextSecond > lastSecond) {
          setCycle((count) => count + 1)
        }
        lastSecond = nextSecond
        setSecondsLeft(nextSecond)
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [period])

  return { secondsLeft, cycle }
}

function TwoFactorPage() {
  const [entry, setEntry] = useState({ code: '', cycle: -1 })
  const [backupMode, setBackupMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const barRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)

  const { secondsLeft, cycle } = useTotpWindow({
    onProgress: (progress) => {
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`
    },
  })

  // Stamp entries with the window they were typed in: a code that predates the
  // rollover cannot verify, so it reads as empty rather than failing later.
  const code = entry.cycle === cycle ? entry.code : ''
  const ready = backupMode ? code.trim() !== '' : code.length === 6

  useEffect(() => {
    fieldRef.current?.querySelector('input')?.focus()
  }, [backupMode])

  function type(next: string) {
    setEntry({ code: next, cycle })
    if (error) setError(null)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setPending(true)
    setError(null)

    try {
      const result = backupMode
        ? await authClient.twoFactor.verifyBackupCode({ code: code.trim() })
        : await authClient.twoFactor.verifyTotp({ code: code.trim() })

      if (result.error) {
        setError(result.error.message ?? 'That code did not work.')
        return
      }
      window.location.assign('/')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden px-6 py-16">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
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
              <FristMark className="size-5" />
              <span className="text-sm font-semibold tracking-tight">
                Frist
              </span>
            </span>
            <span className="text-xs text-muted-foreground">Two-factor</span>
          </div>

          <div
            className={cn(
              'mx-1.5 mt-3 mb-2.5 flex items-center gap-3 px-1 text-[10px] tracking-[0.08em] text-muted-foreground uppercase',
              rise,
            )}
          >
            <Separator className="flex-1" />
            <span className="whitespace-nowrap">
              {backupMode ? 'backup code' : 'authenticator code'}
            </span>
            <Separator className="flex-1" />
          </div>

          <form
            onSubmit={onSubmit}
            aria-label="Two-factor verification"
            className="px-3 pb-3"
          >
            <div
              ref={fieldRef}
              className={backupMode ? undefined : 'mx-auto w-fit'}
            >
              {backupMode ? (
                <Input
                  value={code}
                  onChange={(event) => type(event.target.value)}
                  aria-label="Backup code"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={pending}
                  className="h-9 font-mono"
                />
              ) : (
                <>
                  <OTPField
                    length={6}
                    value={code}
                    onValueChange={type}
                    disabled={pending}
                    aria-label="Authenticator code"
                    aria-describedby="two-factor-window"
                    className="justify-center [&_[data-slot=otp-field-input]]:size-9"
                  >
                    {[0, 1, 2, 3, 4, 5].map((slot) => (
                      <Fragment key={slot}>
                        {slot === 3 ? <OTPFieldSeparator /> : null}
                        <OTPFieldInput />
                      </Fragment>
                    ))}
                  </OTPField>
                  <p id="two-factor-window" className="sr-only">
                    A new code appears every 30 seconds.
                  </p>
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                      <div
                        ref={barRef}
                        className="h-full origin-left bg-primary"
                      />
                    </div>
                    <span
                      className="w-7 text-right text-[11px] tabular-nums text-muted-foreground"
                      aria-hidden="true"
                    >
                      {secondsLeft}s
                    </span>
                  </div>
                </>
              )}
            </div>

            <Button
              type="submit"
              className="mt-3 h-9 w-full"
              disabled={pending || !ready}
            >
              {pending ? 'Verifying…' : 'Verify'}
            </Button>
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
              <Kbd>⏎</Kbd>
              <span>verify</span>
            </p>
            <button
              type="button"
              className="underline underline-offset-4 hover:text-foreground"
              onClick={() => {
                setBackupMode((current) => !current)
                setEntry({ code: '', cycle })
                setError(null)
              }}
            >
              {backupMode
                ? 'Use an authenticator code instead'
                : 'Use a backup code instead'}
            </button>
          </div>
        </div>

        <p
          className={cn('mt-5 text-center text-xs text-muted-foreground', rise)}
          style={{ animationDelay: '280ms' }}
        >
          Lost access?{' '}
          <Link
            to="/sign-in"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Start over
          </Link>{' '}
          and use a saved backup code.
        </p>
      </div>
    </div>
  )
}
