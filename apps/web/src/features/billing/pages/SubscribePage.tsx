import { useState } from 'react'

import { Button } from '../../../components/ui/Button'
import { ErrorState, LoadingState } from '../../../components/QueryStates'
import { useAuthStore } from '../../../lib/authStore'
import { useCheckout, usePlans } from '../hooks/useBilling'

// PAYPAL_SPEC §8: two cards, annual highlighted as best value, auto-renewal and cancellation
// disclosed near the pay button.
export function SubscribePage() {
  const { data: plans, isLoading, error } = usePlans()
  const isSignedIn = useAuthStore((s) => s.accessToken !== null)
  const checkoutMutation = useCheckout()
  const [startingCode, setStartingCode] = useState<string | null>(null)

  if (isLoading) return <LoadingState />
  if (error || plans === undefined) return <ErrorState message="Couldn't load plans." />

  const handleSubscribe = (planCode: string) => {
    setStartingCode(planCode)
    checkoutMutation.mutate(planCode, {
      onSuccess: ({ checkoutParams }) => {
        if (checkoutParams.approveUrl) window.location.href = checkoutParams.approveUrl
      },
      onSettled: () => setStartingCode(null),
    })
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="text-2xl font-bold">Subscribe to Newstack</h1>
      <p className="text-muted mb-6 text-sm">Cancel anytime. Prices include tax.</p>
      {!isSignedIn && <p className="text-muted mb-4 text-sm">Log in first to subscribe.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => {
          const isAnnual = plan.interval === 'year'
          const amount = (plan.amount_paise / 100).toFixed(0)
          return (
            <div
              key={plan.code}
              className="flex flex-col gap-3 border-2 p-4"
              style={{ borderColor: isAnnual ? 'var(--color-accent)' : 'var(--color-divider)' }}
            >
              {isAnnual && <p className="text-xs font-semibold uppercase" style={{ color: 'var(--color-accent)' }}>Best value · about ₹1/day</p>}
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <p className="text-2xl font-bold">₹{amount}<span className="text-muted text-sm">/{plan.interval}</span></p>
              <Button
                variant={isAnnual ? 'primary' : 'secondary'}
                disabled={!isSignedIn || checkoutMutation.isPending}
                onClick={() => handleSubscribe(plan.code)}
              >
                {startingCode === plan.code && checkoutMutation.isPending ? 'Starting checkout…' : 'Subscribe'}
              </Button>
              <p className="text-muted text-xs">Auto-renews via PayPal until canceled. Cancel anytime from your account.</p>
            </div>
          )
        })}
      </div>
      {checkoutMutation.isError && <ErrorState message="Couldn't start checkout. Try again." />}
    </div>
  )
}
