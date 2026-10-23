import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { Moon, Sun } from 'lucide-react'
import { updateMySettings } from '@/lib/app.functions'

const KEY = 'frist-theme'

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void> }
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function apply(dark: boolean, event: MouseEvent<HTMLButtonElement>) {
  const flip = () => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem(KEY, dark ? 'dark' : 'light')
    } catch {
      // private mode: the theme still applies for this session
    }
  }

  // Keep the stored settings in step so a later visit boots into the same theme.
  void updateMySettings({ data: { theme: dark ? 'dark' : 'light' } }).catch(
    () => {},
  )

  const doc = document as ViewTransitionDocument
  if (!doc.startViewTransition || prefersReducedMotion()) {
    flip()
    return
  }

  const x = event.clientX
  const y = event.clientY
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  )

  const transition = doc.startViewTransition(flip)
  void transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${radius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 420,
        easing: 'ease-out',
        pseudoElement: '::view-transition-new(root)',
      },
    )
  })
}

/** Flips light and dark, wiping the new theme out from the pointer. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  return (
    <button
      type="button"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={(event) => {
        const next = !dark
        setDark(next)
        apply(next, event)
      }}
      className="relative flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Sun
        className={`absolute size-4.5 transition-transform duration-300 ease-out ${
          dark ? '-rotate-90 scale-0' : 'rotate-0 scale-100'
        }`}
      />
      <Moon
        className={`absolute size-4.5 transition-transform duration-300 ease-out ${
          dark ? 'rotate-0 scale-100' : 'rotate-90 scale-0'
        }`}
      />
    </button>
  )
}
