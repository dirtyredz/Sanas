/** Only allowlisted transport metadata may cross the provider boundary into diagnostics. */
export interface FailureDiagnostic {
  category:
    'authentication' | 'rate-limit' | 'http' | 'provider' | 'timeout' | 'malformed' | 'cancelled'
  httpStatus?: number
  requestId?: string
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
  const timeout = value.name === 'APIConnectionTimeoutError' || value.name === 'TimeoutError'
  return {
    category:
      reason !== 'provider'
        ? reason
        : timeout
          ? 'timeout'
          : status === 401 || status === 403
            ? 'authentication'
            : status === 429
              ? 'rate-limit'
              : status
                ? 'http'
                : 'provider',
    ...(status ? { httpStatus: status } : {}),
    ...(requestId ? { requestId } : {}),
    model:
      /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(model) && !model.startsWith('sk-')
        ? model
        : 'custom',
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  }
}
