import type {DodoPayments} from 'dodopayments';

// Checkout
export type CheckoutSessionCreateParams = DodoPayments.CheckoutSessions.CheckoutSessionCreateParams;
export type CheckoutSessionResponse = DodoPayments.CheckoutSessions.CheckoutSessionResponse;
export type CheckoutSessionStatus = DodoPayments.CheckoutSessions.CheckoutSessionStatus;

// Subscriptions
export type Subscription = DodoPayments.Subscription;
export type SubscriptionUpdateParams = DodoPayments.SubscriptionUpdateParams;
export type SubscriptionChangePlanParams = DodoPayments.SubscriptionChangePlanParams;
export type SubscriptionListParams = DodoPayments.SubscriptionListParams;

// Customers / portal
export type CustomerPortalSession = DodoPayments.CustomerPortalSession;
export type CreateCustomerParams = DodoPayments.CustomerCreateParams;

// Webhooks
export type UnwarpWebhookEvent = DodoPayments.UnwrapWebhookEvent;

// standard webhooks headers required by dodo
export type DodoWebhookHeaders =  {
	"webhook-id": string;
	"webhook-signature": string;
	"webhook-timestamp": string;
} & Record<string, string>;