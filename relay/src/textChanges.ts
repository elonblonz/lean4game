/** A change of a document's text, as in LSP's `textDocument/didChange`. */
export interface ContentChange {
  range?: { start: { line: number, character: number }, end: { line: number, character: number } }
  text: string
}

/**
 * Apply LSP content changes to `text`, in order. Positions are in UTF-16 code units, like
 * JS strings; line breaks are `\n`, `\r\n` or `\r`. A change without a range replaces the
 * whole text.
 */
export function applyContentChanges(text: string, changes: ContentChange[]): string {
  for (const change of changes) {
    if (!change.range) { text = change.text; continue }
    const offset = (pos: { line: number, character: number }) => {
      const lineBreak = /\r\n|\r|\n/g
      let i = 0
      for (let l = 0; l < pos.line; l++) {
        lineBreak.lastIndex = i
        const m = lineBreak.exec(text)
        if (!m) return text.length
        i = m.index + m[0].length
      }
      lineBreak.lastIndex = i
      const end = lineBreak.exec(text)?.index ?? text.length
      return Math.min(i + pos.character, end)
    }
    text = text.slice(0, offset(change.range.start)) + change.text + text.slice(offset(change.range.end))
  }
  return text
}
