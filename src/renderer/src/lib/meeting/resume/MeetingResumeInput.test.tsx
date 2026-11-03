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
  expect(onChange).toHaveBeenLastCalledWith({ name: 'Pasted text', text: 'Pasted Camunda facts' })
  all.find((n) => n.type === 'button')!.props.onClick!()
  expect(onChange).toHaveBeenLastCalledWith(null)
})
it('shows invalid pasted-text errors instead of silently truncating a resume', () => {
  const markup = renderToStaticMarkup(
    <MeetingResumeInput
      value={{ name: 'Paste', text: 'x'.repeat(40001) }}
      onChange={() => {}}
      disabled={false}
    />,
  )
  expect(markup).toContain('Shorten or remove it before Start')
})
