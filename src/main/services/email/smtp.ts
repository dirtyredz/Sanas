import { createTransport } from 'nodemailer'
import type { EmailProvider, OutgoingEmail, SmtpConfig } from './types'

// SMTP transport via nodemailer. Port 465 = implicit TLS; anything else (587)
// starts plain and upgrades with STARTTLS. Credentials never leave main.

export const smtpProvider: EmailProvider = {
  async send(config: SmtpConfig, mail: OutgoingEmail): Promise<void> {
    if (!config.host || !config.user || !config.pass) {
      throw new Error('SMTP is not configured — set host, user and password in Settings.')
    }
    const transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    })
    try {
      await transport.sendMail({ from: config.user, ...mail })
    } catch (e) {
      throw new Error(`Email failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      transport.close()
    }
  },
}
