import {Counter, Histogram} from "prom-client";
import {metricsRegistry} from '@repo/shared';

/**
 * Infrastructure metrics for outbound dodo payments API calls.
 * Business events (subscription activated, etc.) belong  in apps/api payments.metrics.ts
 */

export const dodoApiDuratoin = new Histogram({
	name: "dodo_api_duration_seconds",
	help: "Duration of dodo api calls in seconds",
	labelNames: ['operation'],
	buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
	registers: [metricsRegistry]
})

export const dodoApiCallsCounter = new Counter({
	name: "dodo_api_calls_total",
	help: "Total number of dodo api calls",
	labelNames: ["operation", "status"],
	registers: [metricsRegistry]
})

export const dodoApiErrorsCounter = new Counter({
	name: "dodo_api_errors_total",
	 help: "Total number of dodo api errors",
	 labelNames: ["operation", "error_type"],
	 registers: [metricsRegistry]
})