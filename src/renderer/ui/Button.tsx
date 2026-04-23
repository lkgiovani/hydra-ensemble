import * as React from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
  loading?: boolean
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-accent-500 text-white hover:bg-accent-600',
  secondary: 'border border-border-mid bg-bg-2 text-text-1 hover:bg-bg-3',
  ghost: 'text-text-2 hover:bg-bg-3 hover:text-text-1',
  danger: 'border border-red-500/50 text-red-400 hover:bg-red-500/10',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-2 py-1 text-[11px]',
  md: 'px-3 py-1.5 text-xs',
  lg: 'px-5 py-2 text-sm font-medium',
}

const ICON_SIZE: Record<Size, number> = {
  sm: 12,
  md: 14,
  lg: 16,
}

function cx(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(' ')
}

export default function Button(props: ButtonProps) {
  const {
    variant = 'secondary',
    size = 'md',
    iconLeft,
    iconRight,
    loading = false,
    disabled,
    className,
    children,
    type,
    ...rest
  } = props

  const isDisabled = disabled || loading
  const leftNode = loading ? (
    <Loader2 size={ICON_SIZE[size]} className="animate-spin" />
  ) : (
    iconLeft
  )

  return (
    <button
      type={type ?? 'button'}
      disabled={isDisabled}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-500',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        isDisabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      {...rest}
    >
      {leftNode ? <span className="inline-flex shrink-0 items-center">{leftNode}</span> : null}
      {children != null ? <span className="inline-flex items-center">{children}</span> : null}
      {iconRight ? <span className="inline-flex shrink-0 items-center">{iconRight}</span> : null}
    </button>
  )
}
