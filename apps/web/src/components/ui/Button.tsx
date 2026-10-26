import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'icon'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  block?: boolean
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  icon: 'btn-icon btn-secondary',
}

export function Button({ variant = 'secondary', block = false, className = '', type = 'button', ...props }: ButtonProps) {
  const classes = ['btn', VARIANT_CLASS[variant], block && 'btn-block', className].filter(Boolean).join(' ')
  return <button type={type} className={classes} {...props} />
}
