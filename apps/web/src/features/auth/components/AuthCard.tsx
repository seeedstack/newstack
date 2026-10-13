import type { ReactNode } from 'react'

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[360px] flex-col gap-4 p-6" style={{ border: '2px solid var(--color-divider)' }}>
      <h1 style={{ fontSize: '28px' }}>{title}</h1>
      {children}
    </div>
  )
}
