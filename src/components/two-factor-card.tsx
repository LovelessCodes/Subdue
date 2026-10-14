import { useState } from 'react'
import QRCode from 'react-qr-code'
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

type Step = 'idle' | 'password' | 'verify' | 'codes'

function secretFromTotpUri(totpURI: string): string | null {
  try {
    return new URL(totpURI).searchParams.get('secret')
  } catch {
    return null
  }
}

export function TwoFactorCard() {
  const { data: session, refetch } = authClient.useSession()
  const enabled = session?.user?.twoFactorEnabled ?? false

  const [step, setStep] = useState<Step>('idle')
  const [action, setAction] = useState<'enable' | 'disable' | 'regenerate'>(
    'enable',
  )
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [totpURI, setTotpURI] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function reset() {
    setStep('idle')
    setPassword('')
    setCode('')
    setTotpURI(null)
    setError(null)
    setPending(false)
  }

  async function runPasswordStep() {
    setPending(true)
    setError(null)
    try {
      if (action === 'enable') {
        const result = await authClient.twoFactor.enable({ password })
        if (result.error) {
          setError(result.error.message ?? 'Could not start setup.')
          return
        }
        if (result.data?.method === 'totp') {
          setTotpURI(result.data.totpURI)
          setBackupCodes(result.data.backupCodes)
        }
        setStep('verify')
        return
      }
      if (action === 'disable') {
        const result = await authClient.twoFactor.disable({ password })
        if (result.error) {
          setError(result.error.message ?? 'Could not disable two-factor.')
          return
        }
        await refetch()
        reset()
        return
      }
      const result = await authClient.twoFactor.generateBackupCodes({
        password,
      })
      if (result.error) {
        setError(result.error.message ?? 'Could not regenerate codes.')
        return
      }
      setBackupCodes(result.data?.backupCodes ?? [])
      setStep('codes')
    } finally {
      setPending(false)
    }
  }

  async function verify() {
    setPending(true)
    setError(null)
    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: code.trim(),
      })
      if (result.error) {
        setError(result.error.message ?? 'That code did not work.')
        return
      }
      await refetch()
      setStep('codes')
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
        <CardDescription>
          {enabled
            ? 'Enabled — sign-in asks for a code from your authenticator app.'
            : 'Add a second step to sign-in with an authenticator app.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {step === 'idle' ? (
          <div className="flex flex-wrap gap-2">
            {enabled ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAction('regenerate')
                    setStep('password')
                  }}
                >
                  Regenerate backup codes
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setAction('disable')
                    setStep('password')
                  }}
                >
                  Turn off
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  setAction('enable')
                  setStep('password')
                }}
              >
                Enable two-factor
              </Button>
            )}
          </div>
        ) : null}

        {step === 'password' ? (
          <>
            <Field className="max-w-sm">
              <FieldLabel htmlFor="two-factor-password">
                Confirm your password
              </FieldLabel>
              <Input
                id="two-factor-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
              <FieldDescription>
                {action === 'enable'
                  ? 'Checked before a secret is generated.'
                  : action === 'disable'
                    ? 'Turning two-factor off also forgets trusted devices.'
                    : 'Regenerating invalidates every previous backup code.'}
              </FieldDescription>
            </Field>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={runPasswordStep}
                disabled={pending || password === ''}
              >
                {pending ? 'Working…' : 'Continue'}
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                Cancel
              </Button>
            </div>
          </>
        ) : null}

        {step === 'verify' && totpURI ? (
          <>
            <div className="flex flex-wrap items-start gap-6">
              <div className="rounded-lg bg-white p-3">
                <QRCode value={totpURI} size={160} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  Scan the code with your authenticator app, or type this secret
                  in by hand:
                </p>
                <code className="mt-2 block break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                  {secretFromTotpUri(totpURI) ?? 'see the QR code'}
                </code>
                <p className="mt-3 text-sm font-medium">
                  Save your backup codes now
                </p>
                <p className="text-xs text-muted-foreground">
                  Each works once if you lose the authenticator. They are shown
                  again on the next step and can be regenerated, but never
                  emailed.
                </p>
              </div>
            </div>

            <Field className="max-w-xs">
              <FieldLabel htmlFor="two-factor-verify-code">
                Code from the app
              </FieldLabel>
              <Input
                id="two-factor-verify-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </Field>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={verify}
                disabled={pending || code.trim() === ''}
              >
                {pending ? 'Verifying…' : 'Verify and enable'}
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                Cancel
              </Button>
            </div>
          </>
        ) : null}

        {step === 'codes' ? (
          <>
            <p className="text-sm">
              Keep these somewhere safe — each signs in once if the
              authenticator is unavailable.
            </p>
            <ul className="grid grid-cols-2 gap-1 rounded-lg border p-3 font-mono text-xs sm:grid-cols-2">
              {backupCodes.map((backupCode) => (
                <li key={backupCode}>{backupCode}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(backupCodes.join('\n'))
                }}
              >
                Copy all
              </Button>
              <Button size="sm" onClick={reset}>
                Done
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
