export const socialProviderNames = [
  'google',
  'github',
  'microsoft',
  'discord',
] as const

export type SocialProviderName = (typeof socialProviderNames)[number]

export const socialProviderLabels: Record<SocialProviderName, string> = {
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  discord: 'Discord',
}
