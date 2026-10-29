import { useEffect } from "react"
import { useAtom } from "jotai"
import { editorAtom, levelUriAtom } from "../../store/lean-atoms"
import { currentProofAtom, typewriterModeAtom } from "../../store/proof-atoms"
import { inventoryAtom } from "../../store/inventory-atoms"
import { completedAtom } from "../../store/progress-atoms"
import { levelInfoAtom } from "../../store/query-atoms"

/**
 * What the game does with the level's editor and proof: complete the level and unlock its items
 * once the proof is done, fill in the level's template, and keep the code in the shape the
 * input mode needs.
 *
 * The connection to Lean itself is `useLeanConnection`.
 */
export function useLevelGameLogic() {
  const [{ data: levelInfo }] = useAtom(levelInfoAtom)
  const [editor] = useAtom(editorAtom)
  const [levelUri] = useAtom(levelUriAtom)
  const [typewriterMode] = useAtom(typewriterModeAtom)

  // When the proof is complete, mark the level as completed and add its new items (and the
  // theorem just proved) to the inventory. Only for a proof state of the current text.
  const [currentProof] = useAtom(currentProofAtom)
  const [, setCompleted] = useAtom(completedAtom)
  const [, addToInventory] = useAtom(inventoryAtom)
  useEffect(() => {
    if (!currentProof?.completed || !levelInfo) return
    setCompleted(true)
    const newTiles = [
      ...levelInfo.tactics ?? [],
      ...levelInfo.lemmas ?? [],
      ...levelInfo.definitions ?? []
    ].filter(tile => tile.new).map(tile => tile.name)
    // Levels whose statement has no name report it as "[anonymous]".
    if (levelInfo.statementName != null && levelInfo.statementName !== "[anonymous]") {
      newTiles.push(levelInfo.statementName)
    }
    addToInventory(newTiles)
  }, [currentProof, levelInfo])

  // A level with a template (these are always played in the editor, see `lockEditorModeAtom`)
  // starts with the template's text: insert it when this level's editor opens empty (the editor
  // opens with the saved code, so that is the first visit, or after the progress was erased).
  // Not on later changes, so that deleting everything doesn't bring the template back.
  useEffect(() => {
    const template = levelInfo?.template
    const model = editor?.getModel()
    if (!template || !editor || !model || model.uri.toString() !== levelUri) return
    if (model.getValue().trim()) return
    console.debug(`inserting template:\n${template}`)
    editor.executeEdits("template-writer", [{
      range: model.getFullModelRange(),
      text: template + `\n`,
      forceMoveMarkers: true
    }])
  }, [levelInfo?.template, editor, levelUri])

  // Focus the editor when switching to editor mode.
  useEffect(() => {
    if (!typewriterMode) editor?.focus()
  }, [typewriterMode])

  // In typewriter mode, the typewriter shows one command per line: drop empty lines. Only edit
  // if that changes something (an edit is a new version, which Lean then has to check again).
  useEffect(() => {
    const model = editor?.getModel()
    if (!editor || !model || !typewriterMode) return
    let lines = model.getLinesContent().filter(line => line.trim())
    const text = lines.length ? lines.join('\n') + '\n' : ''
    if (model.getValue() !== text) {
      editor.executeEdits("typewriter", [{
        range: model.getFullModelRange(),
        text,
        forceMoveMarkers: true
      }])
    }
  }, [editor, typewriterMode])
}
