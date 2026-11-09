import { providerFailureCategory } from '../provider/provider-error'

/** Only allowlisted transport metadata may cross the provider boundary into diagnostics. */
export interface FailureDiagnostic {
  category:
    | 'authentication'
    | 'rate-limit'
    | 'http'
    | 'connection'
    | 'provider'
    | 'timeout'
    | 'malformed'
    | 'cancelled'
  httpStatus?: number
  requestId?: string
  /** Error class name only (e.g. TokenBudgetError) — never a message. */
  errorName?: string
  model: string
  elapsedMs: number
}
export function failureDiagnostic(
  reason: 'provider' | 'timeout' | 'malformed' | 'cancelled',
  model: string,
  elapsedMs: number,
  error?: unknown,
): FailureDiagnostic {
  const value = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const status =
    typeof value.status === 'number' &&
    Number.isInteger(value.status) &&
    value.status >= 100 &&
    value.status <= 599
      ? value.status
      : undefined
  const requestId =
    typeof value.request_id === 'string' && /^req_[a-zA-Z0-9]{1,80}$/.test(value.request_id)
      ? value.request_id
      : undefined
  const errorName =
    typeof value.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(value.name)
      ? value.name
      : undefined
  // the provider classifies its own transport errors (provider-error.ts); this only sanitizes
  const tagged = providerFailureCategory(error)
  const timeout = tagged === 'timeout' || value.name === 'TimeoutError' // TimeoutError: AbortSignal.timeout
  return {
    category:
      reason !== 'provider'
        ? reason
        : timeout
          ? 'timeout'
          : tagged === 'connection'
            ? 'connection'
            : status === 401 || status === 403
              ? 'authentication'
              : status === 429
                ? 'rate-limit'
                : status
                  ? 'http'
                  : 'provider',
    ...(status ? { httpStatus: status } : {}),
    ...(requestId ? { requestId } : {}),
    ...(errorName ? { errorName } : {}),
    model:
      /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(model) && !model.startsWith('sk-')
        ? model
        : 'custom',
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  }
}
