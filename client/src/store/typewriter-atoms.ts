/**
 * @fileOverview The typewriter's command line: the single-line editor and its content.
 */
import { atom } from "jotai";
import { editor } from 'monaco-editor'
import { preferencesAtom } from './preferences-atoms';

/** The editor powering the typewriter (single line) input */
export const oneLineEditorAtom = atom<editor.IStandaloneCodeEditor | null>(null)

/** The text in the typewriter's command line. Kept up to date by the command line's editor
 * (see `TypewriterCommandLine`); to change the text, set `typewriterAtom`. */
export const typewriterContentAtom = atom<string>("")

/** The text in the typewriter's command line. Setting it writes the text into the command
 * line's editor (which in turn updates `typewriterContentAtom`) and moves the cursor to the end.
 * Does nothing if there is no command line, i.e. in editor mode. */
export const typewriterAtom = atom(
  (get) => get(typewriterContentAtom),
  (get, set, val: string) => {
    const oneLineEditor = get(oneLineEditorAtom)
    const { isSuggestionsMobileMode } = get(preferencesAtom)

    if (!oneLineEditor) {
      console.debug("[TypewriterAtom] oneLineEditor is False")
      return
    }

    console.debug(`[TypewriterAtom] Set value in oneLineEditor to ${val}`)
    oneLineEditor.setValue(val)
    oneLineEditor.setPosition({
      column: val.length + 1,
      lineNumber: 1
    })

    if (!isSuggestionsMobileMode) {
      oneLineEditor.focus()
    }
  }
)

/** Clear the command line. */
export const clearTypewriterAtom = atom(null, (get, set) => {
  get(oneLineEditorAtom)?.setValue('')
  set(typewriterContentAtom, "")
})
