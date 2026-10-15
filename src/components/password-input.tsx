import type { ComponentProps } from 'react'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Kbd } from '@/components/kbd'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'

/**
 * coss sizes its input through the group, and the inner input keeps its own
 * scale, so the field height lives here: `default` matches the app's h-8
 * inputs, `lg` matches the h-9 fields on the sign-in and sign-up panels.
 */
const heights = {
  default: 'h-8 [&_input]:h-7.5 [&_input]:leading-7.5',
  lg: 'h-9 sm:[&_input]:h-8.5 sm:[&_input]:leading-8.5',
}

export function PasswordInput({
  enterHint = false,
  size = 'default',
  ...props
}: Omit<ComponentProps<typeof InputGroupInput>, 'size'> & {
  /** Show the ⏎ badge while the field has focus. */
  enterHint?: boolean
  size?: keyof typeof heights
}) {
  const [visible, setVisible] = useState(false)

  return (
    <InputGroup className={heights[size]}>
      <InputGroupInput type={visible ? 'text' : 'password'} {...props} />
      <InputGroupAddon align="inline-end">
        {enterHint ? (
          <Kbd className="opacity-0 transition-opacity duration-150 ease-out [[data-slot=input-group]:has(input:focus-visible)_&]:opacity-100">
            ⏎
          </Kbd>
        ) : null}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </InputGroupAddon>
    </InputGroup>
  )
}
