import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { IntlProvider } from 'use-intl'

import { loadMessages } from '@/i18n'
import { getMessageLocale } from '@/lib/i18n.functions'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  loader: async () => {
    const locale = await getMessageLocale()
    return { locale, messages: await loadMessages(locale) }
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Subdue',
      },
      {
        name: 'theme-color',
        content: '#18181b',
      },
      {
        name: 'apple-mobile-web-app-title',
        content: 'Subdue',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'manifest',
        href: '/manifest.webmanifest',
      },
      {
        rel: 'icon',
        href: '/icons/icon-32.png',
        type: 'image/png',
      },
      {
        rel: 'apple-touch-icon',
        href: '/icons/icon-180.png',
      },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
})

/** Every route renders inside the message provider. */
function RootComponent() {
  const { locale, messages } = Route.useLoaderData()
  return (
    <IntlProvider locale={locale} messages={messages}>
      <Outlet />
    </IntlProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { locale } = Route.useLoaderData()
  return (
    <html lang={locale}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('subdue-theme')||'system';if(t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}",
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}) }) }",
          }}
        />
        <Scripts />
      </body>
    </html>
  )
}
