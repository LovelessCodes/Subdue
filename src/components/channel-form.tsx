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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { createMyChannel, updateMyChannel } from '@/lib/app.functions'
import type { ChannelView } from '@/server/services/channels'

const CHANNEL_TYPES = [
  'email',
  'ntfy',
  'telegram',
  'discord',
  'webhook',
] as const

type FieldDef = {
  key: string
  label: string
  placeholder?: string
  secret?: boolean
  description?: string
}

const TYPE_FIELDS: Record<string, FieldDef[]> = {
  email: [
    { key: 'host', label: 'SMTP host', placeholder: 'smtp.example.com' },
    { key: 'port', label: 'Port', placeholder: '587' },
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', secret: true },
    { key: 'from', label: 'From address', placeholder: 'subdue@example.com' },
    { key: 'to', label: 'To address', placeholder: 'you@example.com' },
  ],
  ntfy: [
    { key: 'server', label: 'Server', placeholder: 'https://ntfy.sh' },
    { key: 'topic', label: 'Topic' },
    { key: 'token', label: 'Access token', secret: true },
  ],
  telegram: [
    { key: 'botToken', label: 'Bot token', secret: true },
    { key: 'chatId', label: 'Chat ID' },
  ],
  discord: [{ key: 'webhookUrl', label: 'Webhook URL' }],
  webhook: [
    { key: 'url', label: 'URL', placeholder: 'https://example.com/hook' },
    { key: 'secret', label: 'Signing secret', secret: true },
  ],
}

const REQUIRED_FIELDS: Record<string, string[]> = {
  email: ['host', 'from', 'to'],
  ntfy: ['topic'],
  telegram: ['botToken', 'chatId'],
  discord: ['webhookUrl'],
  webhook: ['url'],
}

const OPTIONAL_FIELDS = ['username', 'password', 'token', 'secret']

function configString(config: ChannelView['config'], key: string): string {
  if (typeof config !== 'object' || config === null) {
    return ''
  }
  const value = (config as Record<string, unknown>)[key]
  return value === undefined || value === null ? '' : String(value)
}

export function ChannelForm({
  open,
  onOpenChange,
  channel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  channel: ChannelView | null
}) {
  const router = useRouter()
  const [type, setType] = useState<string>(CHANNEL_TYPES[0])
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [secure, setSecure] = useState(false)
  const [config, setConfig] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    setError(null)
    if (channel) {
      setType(channel.type)
      setName(channel.name)
      setEnabled(channel.enabled)
      setSecure(
        channel.type === 'email'
          ? configString(channel.config, 'secure') === 'true' ||
              configString(channel.config, 'secure') === '1'
          : false,
      )
      const values: Record<string, string> = {}
      for (const field of TYPE_FIELDS[channel.type] ?? []) {
        values[field.key] = configString(channel.config, field.key)
      }
      if (values.port === '') {
        values.port = '587'
      }
      if (values.server === '') {
        values.server = 'https://ntfy.sh'
      }
      setConfig(values)
    } else {
      setType(CHANNEL_TYPES[0])
      setName('')
      setEnabled(true)
      setSecure(false)
      setConfig({ port: '587', server: 'https://ntfy.sh' })
    }
  }, [open, channel])

  function setValue(key: string, value: string) {
    setConfig((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setError(null)
    if (!name.trim()) {
      setError('Give the channel a name.')
      return
    }
    const missing = (REQUIRED_FIELDS[type] ?? []).filter(
      (key) => !(config[key] ?? '').trim(),
    )
    if (missing.length > 0) {
      setError(`Missing: ${missing.join(', ')}`)
      return
    }

    const payload: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(config)) {
      if (OPTIONAL_FIELDS.includes(key) && !value.trim()) {
        continue
      }
      payload[key] = value.trim()
    }
    if (type === 'email') {
      payload.port = Number(payload.port ?? 587)
      payload.secure = secure
    }

    setPending(true)
    try {
      if (channel) {
        await updateMyChannel({
          data: { id: channel.id, name: name.trim(), config: payload, enabled },
        })
      } else {
        await createMyChannel({
          data: {
            type: type as (typeof CHANNEL_TYPES)[number],
            name: name.trim(),
            config: payload,
            enabled,
          },
        })
      }
      await router.invalidate()
      onOpenChange(false)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Save failed.'
      setError(
        message.includes('CHANNEL_CONFIG_INVALID')
          ? 'Some of those settings did not validate — check the host, port and addresses.'
          : message,
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {channel ? `Edit ${channel.name}` : 'Add channel'}
          </DialogTitle>
          <DialogDescription>
            Where Subdue delivers reminders.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="channel-name">Name</FieldLabel>
              <Input
                id="channel-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Phone, Email, …"
              />
            </Field>
            <Field>
              <FieldLabel>Type</FieldLabel>
              {channel ? (
                <Input readOnly value={type} />
              ) : (
                <Select
                  value={type}
                  onValueChange={(value) => setType(String(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNEL_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>

          {(TYPE_FIELDS[type] ?? []).map((field) => (
            <Field key={field.key}>
              <FieldLabel htmlFor={`channel-${field.key}`}>
                {field.label}
              </FieldLabel>
              <Input
                id={`channel-${field.key}`}
                type={field.secret ? 'password' : 'text'}
                value={config[field.key] ?? ''}
                onChange={(event) => setValue(field.key, event.target.value)}
                placeholder={field.placeholder}
              />
              {field.description ? (
                <FieldDescription>{field.description}</FieldDescription>
              ) : null}
            </Field>
          ))}

          {type === 'email' ? (
            <Field orientation="horizontal">
              <Switch checked={secure} onCheckedChange={setSecure} />
              <FieldLabel>Implicit TLS (usually port 465)</FieldLabel>
            </Field>
          ) : null}

          <Field orientation="horizontal">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <FieldLabel>Enabled</FieldLabel>
          </Field>
        </FieldGroup>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
