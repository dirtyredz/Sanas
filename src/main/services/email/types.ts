// The outbound-mail seam. Summary emails go through this interface so the
// transport (SMTP today) can be swapped without touching meeting code.

export interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
}

export interface OutgoingEmail {
  to: string
  subject: string
  text: string
  html?: string
}

export interface EmailProvider {
  /** Sends one message; rejects with a human-readable Error on failure. */
  send(config: SmtpConfig, mail: OutgoingEmail): Promise<void>
}
