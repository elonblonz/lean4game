import React, { FormEvent, useEffect, useRef } from "react";
import "../../../css/typewriter.css"
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { useAtom } from "jotai";
import * as monaco from 'monaco-editor'
import { codeAtom, appendCodeLineAtom, lastProofStepErrorCommandAtom, proofAtom, proofPendingAtom } from "../../../store/proof-atoms";
import { twMerge } from "tailwind-merge";
import { deletedChatAtom } from "../../../store/chat-atoms";
import { oneLineEditorAtom, typewriterContentAtom } from "../../../store/typewriter-atoms";
import { darkModeAtom, reducedMotionAtom } from "../../../store/preferences-atoms";

/** The input field */
export function TypewriterCommandLine() {
  let { t } = useTranslation()
  const [oneLineEditor, setOneLineEditor] = useAtom(oneLineEditorAtom)
  const [code] = useAtom(codeAtom)
  const [, appendLine] = useAtom(appendCodeLineAtom)
  const [, setDeletedChatAtom] = useAtom(deletedChatAtom)
  const [, setTypewriter] = useAtom(typewriterContentAtom)
  // While Lean hasn't answered for the current text, a new command waits (it would be
  // appended to a proof whose last command may still turn out to have failed).
  const [pending] = useAtom(proofPendingAtom)
  const [failedCommand] = useAtom(lastProofStepErrorCommandAtom)
  const [proof] = useAtom(proofAtom)
  const [darkMode] = useAtom(darkModeAtom)
  const [reducedMotion] = useAtom(reducedMotionAtom)
  const oneLineEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const inputRef = useRef<HTMLDivElement>(null)

  /** Submit the command line's text. A ref, so that the editor's key binding (created once)
   * always calls the current version. */
  const submitRef = useRef<() => void>(() => {})
  /** A submit while Lean is still checking the previous command; done once it has answered. */
  const queuedRef = useRef(false)
  submitRef.current = () => {
    const editor = oneLineEditorRef.current
    if (!editor) return
    if (pending) { queuedRef.current = true; return }
    queuedRef.current = false
    const content = editor.getValue().trim()
    if (content.length == 0) return
    // Clear the input first, so that a second Enter (or click) right away finds nothing to submit.
    editor.setValue('')
    appendLine(content)
    // TODO: Desired logic is to only reset this after a new *error-free* command has been entered
    setDeletedChatAtom([])
  }

  useEffect(() => {
    if (!pending && queuedRef.current) submitRef.current()
  }, [pending])

  function handleSubmit(ev?: FormEvent<HTMLFormElement>) {
    ev?.preventDefault()
    submitRef.current()
  }

  // start the editor used in the typewriter command line
  useEffect(() => {
    // Guard: only create once
    if (oneLineEditorRef.current) {
      console.debug("Editor already exists, skipping initialization")
      return
    }

    // Guard: wait for DOM element
    if (!inputRef.current) {
      console.debug("inputRef.current is not ready yet")
      return
    }

    const editorConfig: monaco.editor.IStandaloneEditorConstructionOptions = {
      // Each level starts with an empty command line.
      value: "",
      language: "lean4",
      quickSuggestions: false,
      unicodeHighlight: {
        ambiguousCharacters: false,
      },
      automaticLayout: true,
      minimap: {
        enabled: false
      },
      lineNumbers: 'off',
      tabSize: 2,
      wordWrap: 'on',
      glyphMargin: false,
      folding: false,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 0,
      'semanticHighlighting.enabled': true,
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      padding: {
        top: 0,
        bottom: 0,
      },
      scrollbar: {
        verticalScrollbarSize: 3
      },
      scrollBeyondLastLine: false,
      overviewRulerBorder: false,
      theme: darkMode ? 'Visual Studio Dark' : 'Visual Studio Light',
      cursorBlinking: reducedMotion ? 'solid' : 'blink',
      ariaLabel: t("Command"),
      contextmenu: false
    }

    console.debug("Creating Monaco editor instance...")
    const myEditor = monaco.editor.create(inputRef.current, editorConfig)

    const layoutInput = () => {
      const lineHeight = myEditor.getOption(monaco.editor.EditorOption.lineHeight)
      const height = Math.min(myEditor.getContentHeight(), lineHeight + 2, window.innerHeight / 3)
      if (inputRef.current) {
        inputRef.current.style.height = `${height}px`
        myEditor.layout({
          width: inputRef.current.clientWidth,
          height
        })
      }
    }

    myEditor.onDidContentSizeChange(layoutInput)
    layoutInput()

    // Enter submits; only in this editor, and not while a completion list is open.
    myEditor.addCommand(monaco.KeyCode.Enter, () => submitRef.current(), '!suggestWidgetVisible')
    setTypewriter("")

    const changeDisposable = myEditor.getModel()?.onDidChangeContent(() => {
      const value = myEditor.getValue()
      setTypewriter(value)

      // Prevent newlines (single-line behavior)
      const newValue = value.replace(/[\n\r]/g, '')
      if (value !== newValue) {
        myEditor.setValue(newValue)
      }
    })

    oneLineEditorRef.current = myEditor
    setOneLineEditor(myEditor)
    // Ready to type. Not on touch screens: there it would open the on-screen keyboard.
    if (!window.matchMedia('(pointer: coarse)').matches) myEditor.focus()
    console.debug("Editor initialized successfully")

    return () => {
      console.debug("Cleaning up editor...")
      changeDisposable?.dispose()
      myEditor.dispose()
      oneLineEditorRef.current = null
      setOneLineEditor(null)
    }
  }, [setTypewriter, setOneLineEditor])

  // A steady cursor if the player prefers reduced motion.
  useEffect(() => {
    oneLineEditor?.updateOptions({ cursorBlinking: reducedMotion ? 'solid' : 'blink' })
  }, [oneLineEditor, reducedMotion])

  // Put a failed command back into the input so it can be corrected rather than retyped
  // (it is replaced when the next command is submitted). Don't overwrite anything typed since,
  // and ignore a proof state that is still Lean's answer for the previous code.
  useEffect(() => {
    if (!failedCommand || !oneLineEditor || oneLineEditor.getValue().trim()) return
    const lastLine = code?.trimEnd().split('\n').pop()?.trim()
    if (lastLine != failedCommand.trim()) return
    oneLineEditor.setValue(failedCommand)
    oneLineEditor.setPosition({ lineNumber: 1, column: failedCommand.length + 1 })
  }, [proof, failedCommand, oneLineEditor, code])

  // do not display if the proof is completed (with potential warnings still present)
  return <div className={twMerge("typewriter", pending && "pending")}>
        <form onSubmit={handleSubmit}>
          <div className="typewriter-input-wrapper">
            <div ref={inputRef} className="typewriter-input" />
          </div>
          <button type="submit" className="btn btn-inverted">
            <FontAwesomeIcon icon={faWandMagicSparkles} />&nbsp;{t("Execute")}
          </button>
        </form>
      </div>
}
