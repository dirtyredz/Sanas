import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { ResumeDraftEditor } from './ResumeDraftEditor'
import { resumeDraftProblem, sameResume, withText } from './resume-draft'

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
it('shows the name, count, escaped preview and supports replacing, renaming and removing', () => {
  const onChange = vi.fn()
  const props = {
    value: { name: 'Synthetic.docx', text: '<script>Camunda</script>' },
    onChange,
    onImport: vi.fn(),
    disabled: false,
  }
  const markup = renderToStaticMarkup(<ResumeDraftEditor {...props} />)
  expect(markup).toContain('Synthetic.docx')
  expect(markup).toContain('24 / 40,000 characters')
  expect(markup).not.toContain('<script>')
  const all = nodes(ResumeDraftEditor(props))
  all.find((n) => n.type === 'textarea')!.props.onChange!({
    target: { value: 'Pasted Camunda facts' },
  })
  expect(onChange).toHaveBeenLastCalledWith({
    name: 'Synthetic.docx',
    text: 'Pasted Camunda facts',
  })
  all.find((n) => n.type === 'input')!.props.onChange!({ target: { value: 'Platform CV' } })
  expect(onChange).toHaveBeenLastCalledWith({
    name: 'Platform CV',
    text: '<script>Camunda</script>',
  })
  all.filter((n) => n.type === 'button').at(-1)!.props.onClick!()
  expect(onChange).toHaveBeenLastCalledWith(null)
})
it('shows invalid pasted-text errors instead of silently truncating a resume', () => {
  const markup = renderToStaticMarkup(
    <ResumeDraftEditor
      value={{ name: 'Paste', text: 'x'.repeat(40001) }}
      onChange={() => {}}
      onImport={() => {}}
      disabled={false}
    />,
  )
  expect(markup).toContain('Shorten or remove it before saving')
})

it('invokes import and shows busy and error feedback with edits disabled during import', () => {
  const onImport = vi.fn()
  const props = { value: null, onChange: vi.fn(), disabled: false, onImport }
  nodes(ResumeDraftEditor(props)).find((n) => n.type === 'button')!.props.onClick!()
  expect(onImport).toHaveBeenCalledOnce()
  const markup = renderToStaticMarkup(
    <ResumeDraftEditor
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

it('validates drafts, compares saved state and treats cleared text as removal', () => {
  expect(resumeDraftProblem(null)).toBe('')
  expect(resumeDraftProblem({ name: 'R', text: 'Java' })).toBe('')
  expect(resumeDraftProblem({ name: ' ', text: 'Java' })).toContain('name')
  expect(resumeDraftProblem({ name: 'R', text: '  ' })).toContain('40,000')
  expect(resumeDraftProblem({ name: 'R', text: 'x'.repeat(40_001) })).toContain('40,000')
  expect(resumeDraftProblem({ name: 'R', text: 'x'.repeat(40_000) })).toBe('')
  expect(sameResume(null, null)).toBe(true)
  expect(sameResume({ name: 'R', text: 'a' }, { name: 'R', text: 'a' })).toBe(true)
  expect(sameResume({ name: 'R', text: 'a' }, null)).toBe(false)
  expect(withText(null, 'Java')).toEqual({ name: 'Pasted text', text: 'Java' })
  expect(withText({ name: 'CV', text: 'Java' }, '')).toBeNull()
})
