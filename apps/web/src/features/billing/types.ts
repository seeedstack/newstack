export interface Plan {
  id: string
  code: string
  name: string
  amount_paise: number
  interval: 'month' | 'year'
}

export interface SubscriptionView {
  status: string
  entitled: boolean
  planCode: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export interface Payment {
  id: string
  amount_paise: number
  status: string
  invoice_number: string | null
  paid_at: string | null
  created_at: string
}
