import type { HTMLAttributes } from 'react'

type Variant = 'accent' | 'neutral' | 'outline'

type TagProps = HTMLAttributes<HTMLSpanElement> & { variant?: Variant }

const VARIANT_CLASS: Record<Variant, string> = {
  accent: 'tag-accent',
  neutral: 'tag-neutral',
  outline: 'tag-outline',
}

export function Tag({ variant = 'neutral', className = '', ...props }: TagProps) {
  return <span className={['tag', VARIANT_CLASS[variant], className].filter(Boolean).join(' ')} {...props} />
}
