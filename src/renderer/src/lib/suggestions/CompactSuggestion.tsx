import { useState, type ReactNode } from 'react'

export interface CompactSuggestionParts {
  headline: string
  code?: string
  language?: string
  followUps: string[]
}

function cleanHeadline(line: string): string {
  const trimmed = line.trim().replace(/^#{1,6}\s+/, '')
  const match = trimmed.match(/^\*\*(.*)\*\*$/)
  return (match?.[1] ?? trimmed.replace(/^\*\*/, '').replace(/\*\*$/, '')).trim()
}

/** Parses only Sanas's compact contract; it never interprets HTML or general Markdown. */
export function parseCompactSuggestion(text: string): CompactSuggestionParts {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const headlineIndex = lines.findIndex((line) => line.trim().length > 0)
  if (headlineIndex < 0) return { headline: '', followUps: [] }

  const headline = cleanHeadline(lines[headlineIndex])
  const followUps: string[] = []
  const codeLines: string[] = []
  let language: string | undefined
  let inCode = false
  let hasCode = false

  for (const raw of lines.slice(headlineIndex + 1)) {
    const line = raw.trimEnd()
    if (!inCode && line.trimStart().startsWith('```')) {
      inCode = true
      hasCode = true
      language = line.trim().slice(3).trim() || undefined
      continue
    }
    if (inCode && line.trim() === '```') {
      inCode = false
      continue
    }
    if (inCode) codeLines.push(line)
    else if (line.trim() && followUps.length < 2) followUps.push(line.trim())
  }

  return {
    headline,
    ...(hasCode ? { code: codeLines.join('\n').replace(/\n+$/, ''), language } : {}),
    followUps,
  }
}

function InlineCode({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(/(`[^`\n]+`)/g)
  return (
    <>
      {parts.map((part, index): ReactNode =>
        part.startsWith('`') && part.endsWith('`') ? (
          <code key={index}>{part.slice(1, -1)}</code>
        ) : (
          part
        ),
      )}
    </>
  )
}

export function CompactSuggestion({ text }: { text: string }): React.JSX.Element {
  const parsed = parseCompactSuggestion(text)
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    if (parsed.code === undefined) return
    try {
      await navigator.clipboard.writeText(parsed.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be denied by the OS; leave the button available to retry.
    }
  }

  return (
    <div className="compact-suggestion">
      {parsed.headline && (
        <strong className="compact-headline">
          <InlineCode text={parsed.headline} />
        </strong>
      )}
      {parsed.code !== undefined && (
        <div className="compact-code">
          <div className="compact-code-bar">
            <span>{parsed.language ?? 'code'}</span>
            <button type="button" aria-live="polite" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre>
            <code>{parsed.code}</code>
          </pre>
        </div>
      )}
      {parsed.followUps.map((line, index) => (
        <p key={index} className="compact-follow-up">
          <InlineCode text={line} />
        </p>
      ))}
    </div>
  )
}
