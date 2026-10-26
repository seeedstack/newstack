import { apiFetch } from '../../lib/apiClient'
import { useAuthStore } from '../../lib/authStore'
import type { Payment, Plan, SubscriptionView } from './types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export function listPlans(): Promise<{ items: Plan[] }> {
  return apiFetch<{ items: Plan[] }>('/api/public/plans')
}

export function checkout(planCode: string): Promise<{ checkoutParams: { approveUrl: string | null } }> {
  return apiFetch('/api/billing/checkout', { method: 'POST', body: { planCode } })
}

export function getSubscription(): Promise<SubscriptionView> {
  return apiFetch<SubscriptionView>('/api/billing/subscription')
}

export function cancelSubscription(): Promise<void> {
  return apiFetch('/api/billing/cancel', { method: 'POST' })
}

export function resumeSubscription(): Promise<void> {
  return apiFetch('/api/billing/resume', { method: 'POST' })
}

export function changePlan(planCode: string): Promise<void> {
  return apiFetch('/api/billing/change-plan', { method: 'POST', body: { planCode } })
}

export function listPayments(): Promise<{ items: Payment[] }> {
  return apiFetch<{ items: Payment[] }>('/api/billing/payments')
}

// A plain <a href> can't carry the Authorization header this authenticated endpoint needs
// (apiFetch's bearer token, same as every other /api/* call) — fetch it and open a blob
// URL instead.
export async function openInvoice(paymentId: string): Promise<void> {
  const token = useAuthStore.getState().accessToken
  const res = await fetch(`${BASE_URL}/api/billing/invoices/${paymentId}`, {
    headers: token !== null ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  })
  if (!res.ok) throw new Error('invoice_fetch_failed')
  const blob = await res.blob()
  window.open(URL.createObjectURL(blob), '_blank')
}
