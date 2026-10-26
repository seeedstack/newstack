import { Link } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { ErrorState, LoadingState } from '../../../components/QueryStates'
import { openInvoice } from '../api'
import { useBillingActions, usePayments, useSubscription } from '../hooks/useBilling'

// PAYPAL_SPEC §4.9 account page: plan, status, next renewal, payment history,
// cancel/resume, invoice download.
export function AccountBillingPage() {
  const { data: subscription, isLoading, error } = useSubscription()
  const { data: payments } = usePayments()
  const { cancel, resume } = useBillingActions()

  if (isLoading) return <LoadingState />
  if (error || subscription === undefined) return <ErrorState message="Couldn't load your subscription." />

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="text-2xl font-bold">Billing</h1>

      <section className="my-6 border-2 p-4" style={{ borderColor: 'var(--color-divider)' }}>
        {subscription.status === 'none' ? (
          <>
            <p>You don't have an active subscription.</p>
            <Link to="/subscribe"><Button variant="primary" className="mt-3">Subscribe</Button></Link>
          </>
        ) : (
          <>
            <p className="font-medium">
              Plan: {subscription.planCode} · Status: {subscription.status}
              {subscription.entitled ? '' : ' (no access)'}
            </p>
            {subscription.currentPeriodEnd && (
              <p className="text-muted text-sm">
                {subscription.cancelAtPeriodEnd ? 'Access ends' : 'Renews'} on{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              {subscription.cancelAtPeriodEnd ? (
                <Button onClick={() => resume.mutate()} disabled={resume.isPending}>Resume</Button>
              ) : (
                <Button variant="ghost" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Cancel subscription</Button>
              )}
            </div>
          </>
        )}
      </section>

      <h2 className="mb-2 text-lg font-semibold">Payment history</h2>
      {payments === undefined || payments.length === 0 ? (
        <p className="text-muted text-sm">No payments yet.</p>
      ) : (
        <ul className="flex flex-col" style={{ borderTop: '2px solid var(--color-divider)' }}>
          {payments.map((payment) => (
            <li key={payment.id} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--color-divider)' }}>
              <span>
                ₹{(payment.amount_paise / 100).toFixed(2)} · {payment.status}
                {payment.paid_at && ` · ${new Date(payment.paid_at).toLocaleDateString()}`}
              </span>
              {payment.invoice_number && (
                <button type="button" onClick={() => void openInvoice(payment.id)} className="text-sm hover:underline">
                  Invoice {payment.invoice_number}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
