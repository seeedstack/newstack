import type { ReactNode } from 'react'

type SectionEyebrowProps = {
  children: ReactNode
  dark?: boolean
  spaced?: boolean
}

export function SectionEyebrow({ children, dark = false, spaced = false }: SectionEyebrowProps) {
  const classes = ['eyebrow', dark && 'dark', spaced && 'spaced'].filter(Boolean).join(' ')
  return (
    <div className={classes}>
      <span className="eyebrow-square" aria-hidden />
      <span>{children}</span>
    </div>
  )
}
