const generic = new Set(
  'what when where who why how can could would should do does did is are was were have has had i you we they it this that these those the a an and or of to for in on with about please tell me us more know think thanks thank yes no okay ok hello hi doing going today help explain describe give something anything question say again'.split(
    ' ',
  ),
)
export function liveQuery(
  text: string,
  automatic: boolean,
  glossary: readonly string[] = [],
): string {
  const tokens = [
    ...new Set(
      (text.slice(-2000).match(/[\p{L}\p{N}_][\p{L}\p{N}_.-]*/gu) ?? []).filter(
        (t) => t.length > 1 && !generic.has(t.toLowerCase()),
      ),
    ),
  ].slice(0, 8)
  const specific =
    glossary.some((t) => t.length > 1 && text.toLowerCase().includes(t.toLowerCase())) ||
    tokens.some((t) => /\d|[_ .-]|^[A-Z]{2,}$/.test(t))
  return automatic && !specific && tokens.length < 2 ? '' : tokens.join(' ')
}
