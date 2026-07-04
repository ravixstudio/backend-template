import {DodoPaymentsClient} from "./dodo/dodo-payments.client";
import {PaymentsConfig} from "./config";

let instance: DodoPaymentsClient | null = null;

/**
 * Initialize the dodo payments client once at app startup.
 * @param config
 */
export function initializePayments(config: PaymentsConfig): void {
	instance = new DodoPaymentsClient(config);
}

/**
 * Returns the singleton-wrapped dodo client.
 * @throws error if initializePayments has not been called
 */
export function getDodoClient(): DodoPaymentsClient {
	if (!instance) {
		throw new Error("DodoPaymentsClient has not been initialized");
	}

	return instance;
}
