import {dodoApiCallsCounter, dodoApiDuratoin, dodoApiErrorsCounter} from "./dodo.metrics";
import {logger} from "@repo/shared";

/**
 * Wraps a Dodo API call with duration + success/error metrics and structured logging
 */
export async function withDodoMetrics<T>(operation: string, fn: () => Promise<T>): Promise<T> {
	const timer = dodoApiDuratoin.startTimer({operation})

	try {
		const result = await fn();
		timer();
		dodoApiCallsCounter.inc({operation, status: "success"});
		return result;
	} catch (err) {
		timer();
		dodoApiCallsCounter.inc({operation, status: "error"});
		dodoApiErrorsCounter.inc({operation, error_type: err instanceof Error ? err.name : "Unknown"});

		logger.error("Dodo API call failed", {
			module: "system",
			action: `payments:dodo:api:${operation}`,
			error: err as Error
		})

		throw err;
	}
}