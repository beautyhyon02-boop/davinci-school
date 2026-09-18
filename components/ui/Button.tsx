import Link from 'next/link'
import type { ComponentProps } from 'react'

type Variant = 'primary' | 'accent' | 'ghost'
const styles: Record<Variant, string> = {
  primary: 'bg-mint-500 text-white hover:bg-mint-600',
  accent: 'bg-lemon-300 text-ink-900 hover:bg-lemon-400',
  ghost: 'bg-transparent text-ink-700 hover:bg-ink-100',
}
const base = 'inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50'

type Props = { variant?: Variant; href?: string } & Omit<ComponentProps<'button'>, 'ref'>

export function Button({ variant = 'primary', href, className = '', children, ...rest }: Props) {
  const cls = `${base} ${styles[variant]} ${className}`
  if (href) return <Link href={href} className={cls}>{children}</Link>
  return <button className={cls} {...rest}>{children}</button>
}
