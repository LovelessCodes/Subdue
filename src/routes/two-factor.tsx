import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/two-factor')({
  component: TwoFactorPage,
})

function TwoFactorPage() {
  const [code, setCode] = useState('')
  const [backupMode, setBackupMode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
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
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Two-factor verification</CardTitle>
          <CardDescription>
            {backupMode
              ? 'Enter one of the backup codes you saved when enabling two-factor.'
              : 'Enter the code from your authenticator app.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="two-factor-code">
                {backupMode ? 'Backup code' : 'Authenticator code'}
              </FieldLabel>
              <Input
                id="two-factor-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode={backupMode ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                autoFocus
                required
              />
              {backupMode ? (
                <FieldDescription>
                  Each backup code works once.
                </FieldDescription>
              ) : null}
            </Field>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={pending || code.trim() === ''}>
              {pending ? 'Verifying…' : 'Verify'}
            </Button>

            <button
              type="button"
              className="text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              onClick={() => {
                setBackupMode((current) => !current)
                setCode('')
                setError(null)
              }}
            >
              {backupMode
                ? 'Use an authenticator code instead'
                : 'Use a backup code instead'}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              Lost access?{' '}
              <Link
                to="/sign-in"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Start over
              </Link>{' '}
              and use a backup code from another device.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
