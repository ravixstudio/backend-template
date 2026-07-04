/**
 * Dodo payments SDK environment modes
 *  * @see https://docs.dodopayments.com/developer-resources/integration-guide
 */
export type DodoPaymentsEnvironment = 'test_mode' | 'live_mode';

export interface PaymentsConfig {
	apiKey: string;
	webhookSecret: string;
	environment: DodoPaymentsEnvironment;
}