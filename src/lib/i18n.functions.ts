import { createServerFn } from '@tanstack/react-start'
import { getCookie, getRequestHeaders } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import {
  LOCALE_COOKIE,
  matchLocale,
  pickFromAcceptLanguage,
  resolveMessageLocale,
} from '@/i18n'
import { auth } from './auth'
import { userSetting } from './auth-schema'
import { db } from './db'

/**
 * The message locale for this request: the signed-in user's setting first,
 * then the locale cookie, then Accept-Language. Locales without a catalog
 * fall back to English — number and date formatting keep using the user's
 * own locale setting either way.
 */
export const getMessageLocale = createServerFn({ method: 'GET' }).handler(
  async () => {
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })

    if (session) {
      const [setting] = await db
        .select({ locale: userSetting.locale })
        .from(userSetting)
        .where(eq(userSetting.userId, session.user.id))
        .limit(1)
      if (setting?.locale) return resolveMessageLocale(setting.locale)
    }

    return (
      matchLocale(getCookie(LOCALE_COOKIE)) ??
      pickFromAcceptLanguage(headers.get('accept-language'))
    )
  },
)
