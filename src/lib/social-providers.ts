export type SocialFieldKind = 'text' | 'boolean' | 'text-list' | 'number-list'

export type SocialField = {
  key: string
  envKey: string
  label: string
  kind: SocialFieldKind
  placeholder?: string
  description?: string
}

export type SocialProviderDefinition = {
  id: string
  label: string
  fields: SocialField[]
}

/**
 * Provider catalog for the admin UI and the env loader. Environment variables
 * follow `${PROVIDER}_${KEY}`: GOOGLE_CLIENT_ID, MICROSOFT_TENANT_ID,
 * COGNITO_REGION, DISCORD_PERMISSIONS, FACEBOOK_SCOPES, …
 */
export const socialProviders: SocialProviderDefinition[] = [
  {
    id: 'apple',
    label: 'Apple',
    fields: [
      {
        key: 'appBundleIdentifier',
        envKey: 'APP_BUNDLE_IDENTIFIER',
        label: 'App bundle identifier',
        kind: 'text',
        placeholder: 'com.example.app',
      },
    ],
  },
  { id: 'atlassian', label: 'Atlassian', fields: [] },
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    fields: [
      { key: 'scope', envKey: 'SCOPE', label: 'Scopes', kind: 'text-list' },
    ],
  },
  {
    id: 'cognito',
    label: 'Amazon Cognito',
    fields: [
      {
        key: 'domain',
        envKey: 'DOMAIN',
        label: 'Domain',
        kind: 'text',
        description: 'Required by Cognito.',
      },
      {
        key: 'region',
        envKey: 'REGION',
        label: 'Region',
        kind: 'text',
        placeholder: 'eu-west-1',
      },
      {
        key: 'userPoolId',
        envKey: 'USERPOOL_ID',
        label: 'User pool ID',
        kind: 'text',
      },
    ],
  },
  {
    id: 'discord',
    label: 'Discord',
    fields: [
      {
        key: 'permissions',
        envKey: 'PERMISSIONS',
        label: 'Permissions',
        kind: 'number-list',
        description: 'Comma-separated permission bits, combined with OR.',
      },
    ],
  },
  { id: 'dropbox', label: 'Dropbox', fields: [] },
  {
    id: 'facebook',
    label: 'Facebook',
    fields: [
      { key: 'scopes', envKey: 'SCOPES', label: 'Scopes', kind: 'text-list' },
      {
        key: 'fields',
        envKey: 'FIELDS',
        label: 'Profile fields',
        kind: 'text-list',
      },
    ],
  },
  {
    id: 'figma',
    label: 'Figma',
    fields: [
      {
        key: 'clientKey',
        envKey: 'CLIENT_KEY',
        label: 'Client key',
        kind: 'text',
      },
    ],
  },
  { id: 'github', label: 'GitHub', fields: [] },
  {
    id: 'gitlab',
    label: 'GitLab',
    fields: [
      {
        key: 'issuer',
        envKey: 'ISSUER',
        label: 'Issuer',
        kind: 'text',
        placeholder: 'https://gitlab.com',
      },
    ],
  },
  {
    id: 'google',
    label: 'Google',
    fields: [
      {
        key: 'accessType',
        envKey: 'ACCESS_TYPE',
        label: 'Access type',
        kind: 'text',
        placeholder: 'offline',
      },
      {
        key: 'prompt',
        envKey: 'PROMPT',
        label: 'Prompt',
        kind: 'text',
        placeholder: 'select_account',
      },
    ],
  },
  { id: 'huggingface', label: 'Hugging Face', fields: [] },
  { id: 'kakao', label: 'Kakao', fields: [] },
  { id: 'kick', label: 'Kick', fields: [] },
  {
    id: 'line',
    label: 'LINE',
    fields: [
      {
        key: 'redirectUri',
        envKey: 'REDIRECT_URI',
        label: 'Redirect URI',
        kind: 'text',
      },
      { key: 'scope', envKey: 'SCOPE', label: 'Scopes', kind: 'text-list' },
      {
        key: 'disabledDefaultScope',
        envKey: 'DISABLE_DEFAULT_SCOPE',
        label: 'Disable default scope',
        kind: 'boolean',
      },
    ],
  },
  {
    id: 'linear',
    label: 'Linear',
    fields: [
      { key: 'scope', envKey: 'SCOPE', label: 'Scopes', kind: 'text-list' },
    ],
  },
  { id: 'linkedin', label: 'LinkedIn', fields: [] },
  {
    id: 'microsoft',
    label: 'Microsoft',
    fields: [
      {
        key: 'tenantId',
        envKey: 'TENANT_ID',
        label: 'Tenant ID',
        kind: 'text',
        placeholder: 'common',
      },
      {
        key: 'authority',
        envKey: 'AUTHORITY',
        label: 'Authority',
        kind: 'text',
      },
      { key: 'prompt', envKey: 'PROMPT', label: 'Prompt', kind: 'text' },
    ],
  },
  { id: 'naver', label: 'Naver', fields: [] },
  { id: 'notion', label: 'Notion', fields: [] },
  {
    id: 'paybin',
    label: 'Paybin',
    fields: [
      { key: 'scope', envKey: 'SCOPE', label: 'Scopes', kind: 'text-list' },
    ],
  },
  {
    id: 'paypal',
    label: 'PayPal',
    fields: [
      {
        key: 'environment',
        envKey: 'ENVIRONMENT',
        label: 'Environment',
        kind: 'text',
        placeholder: 'sandbox or live',
      },
      {
        key: 'requestShippingAddress',
        envKey: 'REQUEST_SHIPPING_ADDRESS',
        label: 'Request shipping address',
        kind: 'boolean',
      },
    ],
  },
  { id: 'polar', label: 'Polar', fields: [] },
  {
    id: 'reddit',
    label: 'Reddit',
    fields: [
      { key: 'scope', envKey: 'SCOPE', label: 'Scopes', kind: 'text-list' },
      {
        key: 'duration',
        envKey: 'DURATION',
        label: 'Duration',
        kind: 'text',
        placeholder: 'permanent',
      },
    ],
  },
  { id: 'roblox', label: 'Roblox', fields: [] },
  {
    id: 'salesforce',
    label: 'Salesforce',
    fields: [
      {
        key: 'environment',
        envKey: 'ENVIRONMENT',
        label: 'Environment',
        kind: 'text',
      },
      {
        key: 'loginUrl',
        envKey: 'LOGIN_URL',
        label: 'Login URL',
        kind: 'text',
      },
      {
        key: 'redirectUri',
        envKey: 'REDIRECT_URI',
        label: 'Redirect URI',
        kind: 'text',
      },
    ],
  },
  {
    id: 'slack',
    label: 'Slack',
    fields: [
      { key: 'team', envKey: 'TEAM_ID', label: 'Team ID', kind: 'text' },
    ],
  },
  { id: 'spotify', label: 'Spotify', fields: [] },
  {
    id: 'tiktok',
    label: 'TikTok',
    fields: [
      {
        key: 'clientKey',
        envKey: 'CLIENT_KEY',
        label: 'Client key',
        kind: 'text',
      },
    ],
  },
  { id: 'twitch', label: 'Twitch', fields: [] },
  {
    id: 'vercel',
    label: 'Vercel',
    fields: [
      { key: 'scope', envKey: 'SCOPE', label: 'Scopes', kind: 'text-list' },
    ],
  },
  { id: 'zoom', label: 'Zoom', fields: [] },
]

export const socialProviderIds = socialProviders.map(
  (provider) => provider.id,
) as [string, ...string[]]

export function socialProviderLabel(id: string): string {
  return socialProviders.find((provider) => provider.id === id)?.label ?? id
}
