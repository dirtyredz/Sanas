import { smtpProvider } from './smtp'
import type { EmailProvider } from './types'

// Swap point: exactly one transport today (see STRUCTURE.md on deliberate non-DI).
export const emailProvider: EmailProvider = smtpProvider
export type { EmailProvider, OutgoingEmail, SmtpConfig } from './types'
