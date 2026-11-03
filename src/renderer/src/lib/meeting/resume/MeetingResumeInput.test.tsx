import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { MeetingResumeInput } from './MeetingResumeInput'

type Props = {
  children?: ReactNode
  onClick?: () => void
  onChange?: (e: { target: { value: string } }) => void
}
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!isValidElement<Props>(node)) return []
  return [node, ...nodes(node.props.children)]
}
it('shows the name, count, escaped preview and supports replacing and removing a draft', () => {
  const onChange = vi.fn()
  const props = {
    value: { name: 'Synthetic.docx', text: '<script>Camunda</script>' },
    onChange,
    onImport: vi.fn(),
    disabled: false,
  }
  const markup = renderToStaticMarkup(<MeetingResumeInput {...props} />)
  expect(markup).toContain('Synthetic.docx')
  expect(markup).toContain('24 / 40,000 characters')
  expect(markup).not.toContain('<script>')
  const all = nodes(MeetingResumeInput(props))
  all.find((n) => n.type === 'textarea')!.props.onChange!({
    target: { value: 'Pasted Camunda facts' },
  })
  expect(onChange).toHaveBeenLastCalledWith({
    name: 'Synthetic.docx',
    text: 'Pasted Camunda facts',
  })
  all.filter((n) => n.type === 'button').at(-1)!.props.onClick!()
  expect(onChange).toHaveBeenLastCalledWith(null)
})
it('shows invalid pasted-text errors instead of silently truncating a resume', () => {
  const markup = renderToStaticMarkup(
    <MeetingResumeInput
      value={{ name: 'Paste', text: 'x'.repeat(40001) }}
      onChange={() => {}}
      onImport={() => {}}
      disabled={false}
    />,
  )
  expect(markup).toContain('Shorten or remove it before Start')
})

it('invokes import and shows busy and error feedback with edits disabled during import', () => {
  const onImport = vi.fn()
  const props = { value: null, onChange: vi.fn(), disabled: false, onImport }
  nodes(MeetingResumeInput(props)).find((n) => n.type === 'button')!.props.onClick!()
  expect(onImport).toHaveBeenCalledOnce()
  const markup = renderToStaticMarkup(
    <MeetingResumeInput
      {...props}
      importing
      importError="No text found — paste the text instead."
    />,
  )
  expect(markup).toContain('Importing resume')
  expect(markup).toContain('No text found')
  expect(markup).toMatch(/<button[^>]*disabled/)
  expect(markup).toMatch(/<textarea[^>]*disabled/)
})
