import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuthStore } from '../../../lib/authStore'
import { cancelSubscription, changePlan, checkout, getSubscription, listPayments, listPlans, resumeSubscription } from '../api'

export function usePlans() {
  return useQuery({ queryKey: ['billing', 'plans'], queryFn: () => listPlans().then((r) => r.items) })
}

export function useSubscription() {
  const isSignedIn = useAuthStore((s) => s.accessToken !== null)
  return useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: getSubscription,
    enabled: isSignedIn,
  })
}

export function usePayments() {
  const isSignedIn = useAuthStore((s) => s.accessToken !== null)
  return useQuery({
    queryKey: ['billing', 'payments'],
    queryFn: () => listPayments().then((r) => r.items),
    enabled: isSignedIn,
  })
}

export function useCheckout() {
  return useMutation({ mutationFn: (planCode: string) => checkout(planCode) })
}

export function useBillingActions() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] })
  return {
    cancel: useMutation({ mutationFn: cancelSubscription, onSuccess: invalidate }),
    resume: useMutation({ mutationFn: resumeSubscription, onSuccess: invalidate }),
    changePlan: useMutation({ mutationFn: (planCode: string) => changePlan(planCode), onSuccess: invalidate }),
  }
}
