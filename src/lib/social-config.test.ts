import { describe, expect, it } from 'vitest'
import {
  envConfiguredProviderIds,
  loadSocialProvidersFromEnv,
  parseSocialFieldValue,
} from '@/lib/social-config'

describe('social providers from environment', () => {
  it('requires both a client id and a secret', () => {
    const configured = loadSocialProvidersFromEnv({
      GITHUB_CLIENT_ID: 'id-only',
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      TWITCH_CLIENT_ID: ' ',
      TWITCH_CLIENT_SECRET: 'secret',
    })

    expect(Object.keys(configured)).toEqual(['google'])
    expect(configured.google).toEqual({
      clientId: 'id',
      clientSecret: 'secret',
    })
  })

  it('reads per-provider extras with the catalog env keys', () => {
    const configureds = loadSocialProvidersFromEnv({
      MICROSOFT_CLIENT_ID: 'id',
      MICROSOFT_CLIENT_SECRET: 'secret',
      MICROSOFT_TENANT_ID: 'contoso',
      COGNITO_CLIENT_ID: 'id',
      COGNITO_CLIENT_SECRET: 'secret',
      COGNITO_REGION: 'eu-west-1',
      COGNITO_USERPOOL_ID: 'eu-west-1_abc',
      APPLE_CLIENT_ID: 'id',
      APPLE_CLIENT_SECRET: 'secret',
      APPLE_APP_BUNDLE_IDENTIFIER: 'com.example.app',
    })

    expect(configureds.microsoft).toMatchObject({ tenantId: 'contoso' })
    expect(configureds.cognito).toMatchObject({
      region: 'eu-west-1',
      userPoolId: 'eu-west-1_abc',
    })
    expect(configureds.apple).toMatchObject({
      appBundleIdentifier: 'com.example.app',
    })
  })

  it('parses lists, booleans and permission bits', () => {
    expect(
      parseSocialFieldValue(
        { key: 'scope', envKey: 'SCOPE', label: 'Scopes', kind: 'text-list' },
        'read, write ,',
      ),
    ).toEqual(['read', 'write'])

    expect(
      parseSocialFieldValue(
        { key: 'x', envKey: 'X', label: 'x', kind: 'boolean' },
        'true',
      ),
    ).toBe(true)

    expect(
      parseSocialFieldValue(
        {
          key: 'permissions',
          envKey: 'PERMISSIONS',
          label: 'Permissions',
          kind: 'number-list',
        },
        '8,2048',
      ),
    ).toBe(2056)
  })

  it('lists env-configured provider ids for the admin badges', () => {
    expect(
      envConfiguredProviderIds({
        DISCORD_CLIENT_ID: 'id',
        DISCORD_CLIENT_SECRET: 'secret',
        DISCORD_PERMISSIONS: '8',
      }),
    ).toEqual(['discord'])
  })

  it('covers twitter and vk from the catalog', () => {
    const configured = loadSocialProvidersFromEnv({
      TWITTER_CLIENT_ID: 'id',
      TWITTER_CLIENT_SECRET: 'secret',
      VK_CLIENT_ID: 'id',
      VK_CLIENT_SECRET: 'secret',
      VK_SCHEME: 'dark',
    })

    expect(Object.keys(configured).sort()).toEqual(['twitter', 'vk'])
    // VK's `scheme` is declared in better-auth's types but never read by its
    // implementation, so the catalog (and therefore the env loader) drops it.
    expect(configured.vk).toEqual({ clientId: 'id', clientSecret: 'secret' })
  })
})
