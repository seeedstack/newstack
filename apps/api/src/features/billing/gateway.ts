// PaymentGateway adapter (PAYPAL_SPEC.md §5): the gateway is swappable behind this interface.
// PayPal is the only implementation (./paypal.ts) — the spec's reference gateway was
// Razorpay-style, adapted here per explicit instruction to use PayPal instead.

export type NormalizedEventType =
  | "subscription.activated"
  | "subscription.charged"
  | "subscription.halted"
  | "subscription.cancelled"
  | "payment.failed"
  | "refund.processed";

export interface NormalizedEvent {
  type: NormalizedEventType;
  gatewayEventId: string;
  gatewaySubId: string | null;
  gatewayPaymentId: string | null;
  amountPaise: number | null;
  occurredAt: Date;
  raw: unknown;
}

export interface NormalizedPayment {
  gatewayPaymentId: string;
  status: "succeeded" | "failed" | "refunded" | "partially_refunded" | "pending";
  amountPaise: number;
}

export interface CreateSubscriptionResult {
  gatewaySubscriptionId: string;
  checkoutParams: Record<string, unknown>;
}

export interface CreateOneTimeOrderResult {
  gatewayOrderId: string;
  checkoutParams: Record<string, unknown>;
}

export interface PaymentGateway {
  createSubscription(input: { userId: string; planCode: string; gatewayPlanId: string }): Promise<CreateSubscriptionResult>;
  createOneTimeOrder(input: { userId: string; planCode: string; amountPaise: number }): Promise<CreateOneTimeOrderResult>;
  cancelSubscription(gatewaySubId: string, atCycleEnd: boolean): Promise<void>;
  refundPayment(gatewayPaymentId: string, amountPaise: number): Promise<{ refundId: string }>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<boolean>;
  parseWebhook(rawBody: Buffer): NormalizedEvent;
  fetchPayment(gatewayPaymentId: string): Promise<NormalizedPayment>;
}
