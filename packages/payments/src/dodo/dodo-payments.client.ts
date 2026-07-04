import {DodoPayments} from "dodopayments";
import {PaymentsConfig} from "../config";
import {CheckoutSessionCreateParams, CheckoutSessionResponse, CheckoutSessionStatus,
	CreateCustomerParams, DodoWebhookHeaders, Subscription,
	SubscriptionChangePlanParams, SubscriptionListParams, UnwarpWebhookEvent
} from "./dodo.types";
import {withDodoMetrics} from "./with-dodo-metrics";

export class DodoPaymentsClient {
	private readonly sdk: DodoPayments;
	private readonly webhookSecret: string;

	constructor(private config: PaymentsConfig)	{
		this.webhookSecret = config.webhookSecret;

		this.sdk = new DodoPayments({
			bearerToken: config.apiKey,
			environment: config.environment,
			webhookKey: config.webhookSecret,
		})
	}

	/**
	 * Creates a Dodo checkout session
	 * @param body checkout session body
	 */
	async createCheckoutSession(body: CheckoutSessionCreateParams): Promise<CheckoutSessionResponse> {
		return withDodoMetrics("create_checkout_session", () => this.sdk.checkoutSessions.create(body))
	}

	/**
	 * Retrives a Dodo checkout session
	 * @param sessionId id os the checkout session
	 */
	async retriveCheckoutSession(sessionId: string): Promise<CheckoutSessionStatus> {
		return withDodoMetrics("retrive_checkout_session", () => this.sdk.checkoutSessions.retrieve(sessionId))
	}

	/**
	 * Get a Dodo subscription
	 * @param subscriptionId id of the subscription
	 */
	async getSubscription(subscriptionId: string): Promise<Subscription> {
		return withDodoMetrics("get_subscription", () => this.sdk.subscriptions.retrieve(subscriptionId))
	}

	/**
	 * Change a Dodo subscription plan
	 * @param subscriptionId id of the subscription
	 * @param body subscription change plan body
	 */
	async changeSubscriptionPlan(subscriptionId: string, body: SubscriptionChangePlanParams): Promise<void> {
		return withDodoMetrics("change_subscription_plan", () => this.sdk.subscriptions.changePlan(subscriptionId, body))
	}

	/**
	 * List Dodo subscriptions
	 * @param params subscription list params
	 */
	async listSubscriptions(params?: SubscriptionListParams) {
		return withDodoMetrics("list_subscriptions", () => this.sdk.subscriptions.list(params))
	}

	/**
	 * Create a Dodo customer
	 * @param body customer body
	 */
	async createCustomer(body: CreateCustomerParams) {
		return withDodoMetrics("create_customer", () => this.sdk.customers.create(body))
	}

	/**
	 * Create a customer portal session
	 * @param customerId id of the customer
	 */
	async createCustomerPortalSession(customerId: string) {
		return withDodoMetrics("create_customer_portal_session", () => this.sdk.customers.customerPortal.create(customerId))
	}

	/**
	 * Verify a Dodo webhook
	 * @param rawBody raw webhook body
	 * @param headers webhook headers
	 */
	verifyWebhook(rawBody: string, headers: DodoWebhookHeaders): UnwarpWebhookEvent {
		return this.sdk.webhooks.unwrap(rawBody, {
			headers,
			key: this.webhookSecret
		})
	}
}