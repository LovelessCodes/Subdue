import { cn } from 'cn'
import { Landmark } from 'lucide-react'
import { logoUrl } from '@/lib/logo-source'

/** Our own assets are root-relative; anything else is external or an upload. */
function isOwnAsset(icon: string): boolean {
  return icon.startsWith('/')
}

/**
 * A payment method's mark. Our own SVGs are drawn in `currentColor`, but that
 * resolves inside the image's own document when the file is loaded through an
 * <img> — black, whatever the page theme — so they are painted as masks and
 * take the colour of the text around them instead.
 */
export function PaymentMethodIcon({
  icon,
  className,
}: {
  icon: string | null
  className?: string
}) {
  if (!icon) {
    return (
      <Landmark
        aria-hidden="true"
        className={cn('size-3.5 shrink-0', className)}
      />
    )
  }

  if (isOwnAsset(icon)) {
    return (
      <span
        aria-hidden="true"
        className={cn('inline-block size-3.5 shrink-0 bg-current', className)}
        style={{
          maskImage: `url("${icon}")`,
          maskPosition: 'center',
          maskRepeat: 'no-repeat',
          maskSize: 'contain',
          WebkitMaskImage: `url("${icon}")`,
          WebkitMaskPosition: 'center',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskSize: 'contain',
        }}
      />
    )
  }

  return (
    <img
      src={logoUrl(icon)}
      alt=""
      className={cn('size-3.5 shrink-0', className)}
    />
  )
}
