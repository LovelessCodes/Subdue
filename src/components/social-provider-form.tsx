import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { removeSocialProvider, saveSocialProvider } from '@/lib/app.functions'
import type { SocialProviderDefinition } from '@/lib/social-providers'
import type { SocialProviderView } from '@/server/services/social-auth'

function extraToString(value: unknown): string {
  if (value === undefined || value === null) {
    return ''
  }
  if (Array.isArray(value)) {
    return value.join(', ')
  }
  return String(value)
}

export function SocialProviderForm({
  open,
  onOpenChange,
  provider,
  item,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: SocialProviderDefinition | null
  item: SocialProviderView | undefined
}) {
  const router = useRouter()
  const [origin, setOrigin] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [extra, setExtra] = useState<Record<string, string | boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    if (!open || !provider) {
      return
    }
    setClientId(item?.clientId ?? '')
    setClientSecret('')
    setError(null)
    setConfirmRemove(false)
    const values: Record<string, string | boolean> = {}
    for (const field of provider.fields) {
      const current = item?.extra?.[field.key]
      values[field.key] =
        field.kind === 'boolean'
          ? current === true || current === 'true'
          : extraToString(current)
    }
    setExtra(values)
  }, [open, provider, item])

  if (!provider) {
    return null
  }

  async function save() {
    setError(null)
    if (!clientId.trim()) {
      setError('A client ID is required.')
      return
    }
    setPending(true)
    try {
      await saveSocialProvider({
        data: {
          provider: provider!.id,
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim() ? clientSecret.trim() : undefined,
          enabled: true,
          extra,
        },
      })
      await router.invalidate()
      onOpenChange(false)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Save failed.'
      setError(
        message.includes('SOCIAL_SECRET_REQUIRED')
          ? 'A client ID and secret are both needed before a provider can be enabled.'
          : message,
      )
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    setPending(true)
    try {
      await removeSocialProvider({ data: { provider: provider!.id } })
      await router.invalidate()
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Remove failed.')
    } finally {
      setPending(false)
    }
  }

  const callbackUrl = `${origin}/api/auth/callback/${provider.id}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{provider.label}</DialogTitle>
          <DialogDescription>
            Paste the credentials from the provider's developer console.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="social-client-id">Client ID</FieldLabel>
            <Input
              id="social-client-id"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="social-client-secret">
              Client secret
            </FieldLabel>
            <Input
              id="social-client-secret"
              type="password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              placeholder={
                item?.clientSecretSet
                  ? 'Set — type to replace'
                  : 'Paste the secret'
              }
            />
          </Field>

          {provider.fields.map((field) => (
            <Field key={field.key}>
              {field.kind === 'boolean' ? (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={extra[field.key] === true}
                    onCheckedChange={(checked) =>
                      setExtra((current) => ({
                        ...current,
                        [field.key]: checked,
                      }))
                    }
                  />
                  <FieldLabel>{field.label}</FieldLabel>
                </div>
              ) : (
                <>
                  <FieldLabel htmlFor={`social-${field.key}`}>
                    {field.label}
                  </FieldLabel>
                  <Input
                    id={`social-${field.key}`}
                    value={String(extra[field.key] ?? '')}
                    onChange={(event) =>
                      setExtra((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    placeholder={
                      field.placeholder ??
                      (field.kind === 'text-list' ||
                      field.kind === 'number-list'
                        ? 'Comma-separated'
                        : undefined)
                    }
                  />
                </>
              )}
              {field.description ? (
                <FieldDescription>{field.description}</FieldDescription>
              ) : null}
            </Field>
          ))}

          <FieldDescription>
            Register this callback URL at the provider:{' '}
            <code>{callbackUrl}</code>
          </FieldDescription>
        </FieldGroup>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <div>
            {item ? (
              confirmRemove ? (
                <Button
                  variant="destructive"
                  onClick={remove}
                  disabled={pending}
                >
                  Confirm remove
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => setConfirmRemove(true)}
                  disabled={pending}
                >
                  Remove
                </Button>
              )
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
