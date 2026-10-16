import { useState } from 'react'
import QRCode from 'react-qr-code'
import { useTranslations } from 'use-intl'
import { PasswordInput } from '@/components/password-input'
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
  const t = useTranslations('twoFactor')
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
          setError(result.error.message ?? t('errStart'))
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
          setError(result.error.message ?? t('errDisable'))
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
        setError(result.error.message ?? t('errRegenerate'))
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
        setError(result.error.message ?? t('errCode'))
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
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>
          {enabled ? t('enabled') : t('disabled')}
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
                  {t('regenerate')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setAction('disable')
                    setStep('password')
                  }}
                >
                  {t('turnOff')}
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
                {t('enable')}
              </Button>
            )}
          </div>
        ) : null}

        {step === 'password' ? (
          <>
            <Field className="max-w-sm">
              <FieldLabel htmlFor="two-factor-password">
                {t('confirmPassword')}
              </FieldLabel>
              <PasswordInput
                id="two-factor-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
              <FieldDescription>
                {action === 'enable'
                  ? t('helpEnable')
                  : action === 'disable'
                    ? t('helpDisable')
                    : t('helpRegenerate')}
              </FieldDescription>
            </Field>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={runPasswordStep}
                disabled={pending || password === ''}
              >
                {pending ? t('working') : t('continue')}
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                {t('cancel')}
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
                <p className="text-sm">{t('scan')}</p>
                <code className="mt-2 block break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                  {secretFromTotpUri(totpURI) ?? t('seeQr')}
                </code>
                <p className="mt-3 text-sm font-medium">{t('saveNow')}</p>
                <p className="text-xs text-muted-foreground">{t('saveHelp')}</p>
              </div>
            </div>

            <Field className="max-w-xs">
              <FieldLabel htmlFor="two-factor-verify-code">
                {t('codeLabel')}
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
                {pending ? t('verifying') : t('verify')}
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                {t('cancel')}
              </Button>
            </div>
          </>
        ) : null}

        {step === 'codes' ? (
          <>
            <p className="text-sm">{t('keepSafe')}</p>
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
                {t('copyAll')}
              </Button>
              <Button size="sm" onClick={reset}>
                {t('done')}
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
