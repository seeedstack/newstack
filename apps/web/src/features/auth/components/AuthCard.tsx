import type { ReactNode } from 'react'

import { SectionEyebrow } from '../../../components/ui/SectionEyebrow'

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="mx-auto flex max-w-[400px] flex-col gap-4 p-8"
      style={{ borderTop: '2px solid var(--color-text)', borderInline: '1px solid var(--color-divider)', borderBottom: '1px solid var(--color-divider)' }}
    >
      <SectionEyebrow>Account</SectionEyebrow>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '28px' }}>{title}</h1>
      {children}
    </div>
  )
}
