import { editor } from 'monaco-editor'
import { atom } from "jotai";
import { atomEffect } from 'jotai-effect';
import { LeanMonaco, LeanMonacoOptions, RpcSessionAtPos, LeanClient} from 'lean4monaco'
import { gameIdAtom, levelIdAtom, worldIdAtom } from "./location-atoms";
import { levelProgressAtom, progressAtom } from "./progress-atoms";
import { Selection } from "./progress-types";
import { levelInfoAtom } from "./query-atoms";
import { Diagnostic, DiagnosticSeverity, DocumentUri } from 'vscode-languageserver-types'
import { preferencesAtom } from './preferences-atoms';
import { ProofState } from '../api/rpc_api';

import { defaultInfoviewConfig, InfoviewConfig, LeanFileProgressProcessingInfo } from '@leanprover/infoview-api';
import { atomWithQuery } from 'jotai-tanstack-query';
import { oneLineEditorAtom } from '../components/editor/typewriter/typewriter-atoms';
import { deletedChatAtom, helpAtom, selectedStepAtom } from './chat-atoms';
import { filterHints } from '../components/hints';

/** The unique leanMonaco instance for the entire application */
export const leanMonacoAtom = atom<LeanMonaco | null>(null)

/** The active client. lean4game only uses one client simultaneously */
export const clientAtom = atom<LeanClient>()
//   get => {
//   const clients = get(leanMonacoAtom)?.clientProvider?.getClients() ?? []
//   return clients?.[0]
// })

/** The current (multiline) editor */
export const editorAtom = atom<editor.IStandaloneCodeEditor | null>(null)

/** The model of the current editor */
export const modelAtom = atom(get => get(editorAtom)?.getModel() ?? undefined)

/** The URI of the currently opened file */
export const uriAtom = atom(get => get(modelAtom)?.uri)

/** The currently used RPC session */
export const rpcSessionAtom = atom<RpcSessionAtPos>()

/** The URI of the current level's document (each level has its own, see `PlayableLevel`). */
export const levelUriAtom = atom(get => `file:///${get(worldIdAtom)}/${get(levelIdAtom)}.lean`)

/** The version of the current level's text in the editor. */
export const modelVersionAtom = atom<number | undefined>(undefined)

/** The latest version of the current level's text that has been sent to Lean. The proof state
 * is only requested once this equals `modelVersionAtom`: Lean answers a request with the latest
 * version it has, so a request sent before the new text would be answered for the old one. */
export const syncedVersionAtom = atom<number | undefined>(undefined)

/** The code of the current level as stored in local storage.
 *
 * The setter must not be used directly, expect inside the
 * listener which listens to changes of the editor's content.
 * This is because the editor won't update leading to inconsistent state.
 *
 * Instead, use `codeAtom` to set the editor's content and the code
 * in storage.
*/
export const codeStorageAtom = atom(
  get => {
    const levelProgress = get(levelProgressAtom)
    return levelProgress?.code
  },
  (get, set, val: string) => {
    const levelProgress = get(levelProgressAtom)
    if (levelProgress == null) return
    set(levelProgressAtom, { ...levelProgress, code: val })
  }
)

/**
 * The code of the current level as stored in local storage.
 *
 * Can be used to manually update the editor's content which
 * in turn keeps the code in local storage up to date.
*/
export const codeAtom = atom(
  get => get(codeStorageAtom),
  (get, set, val: string) => {
    const model = get(modelAtom)
    model?.setValue(val)
  }
)

/** Appends a new line of code at the end of the current code.
 *
 * If the last command failed, it is replaced instead: otherwise Lean's error recovery
 * counts the failed command as having closed the goal, and the new command would then
 * fail with "no goals".
*/
export const appendCodeLineAtom = atom(null, (get, set, line: string) => {
  const code = get(codeAtom)

  let lines = (code?.trimEnd() ?? '').split('\n')
  const failedCommand = get(lastProofStepErrorCommandAtom)
  if (failedCommand != null && lines[lines.length - 1].trim() == failedCommand.trim()) {
    lines.pop()
  }
  const oldCode = lines.join('\n').trimEnd()
  const newCode = oldCode.length > 0 ? `${oldCode}\n${line}\n` : `${line}\n`
  set(codeAtom, newCode)
})

/** Delete the proof from step `step` on. Step 0 is the start of the proof (before any
 * command), and step `i` is the result of the code's line `i - 1`. */
export const deleteProofFromStepAtom = atom(null, (get, set, step: number) => {
  const code = get(codeAtom)
  if (code == undefined) return

  set(selectedStepAtom, undefined)
  get(oneLineEditorAtom)?.setValue('')
  set(typewriterContentAtom, "")

  // Show the hints of the deleted steps as deleted hints.
  const help = get(helpAtom)
  const proof = get(proofAtom)
  if (proof) {
    const newDeletedChat = proof.steps.slice(step).flatMap((s, j) => {
      const filteredHints = filterHints(s.goals[0]?.hints, proof.steps[step + j - 1]?.goals[0]?.hints)
      return filteredHints.filter(hint => (!hint.hidden || help.has(step + j)))
    })
    set(deletedChatAtom, newDeletedChat)
  }

  // Forget which hidden hints were shown for the deleted steps.
  set(helpAtom, new Set(Array.from(help).filter(i => i < step)))

  set(codeAtom, code.split("\n").slice(0, Math.max(0, step - 1)).join("\n"))
})

/** Lean's error code for an RPC session that the server no longer knows (`RpcNeedsReconnect`),
 * e.g. after the server restarted the file worker. The session has to be reconnected. */
export const RPC_NEEDS_RECONNECT = -32900

/** LSP's `ContentModified`: the document isn't (or no longer) the one Lean has open, e.g. a
 * request from before switching levels. Also handled by reconnecting. */
export const CONTENT_MODIFIED = -32801

/** Whether a proof state request failed in a way that a new RPC session fixes. */
export const needsReconnect = (error: any) =>
  error?.code === RPC_NEEDS_RECONNECT || error?.code === CONTENT_MODIFIED

/** How long to wait for the proof state before reporting that the Lean server didn't respond. */
const PROOF_STATE_TIMEOUT_MS = 90_000

/** The analysed proof, received over RPC  */
export const proofQueryAtom = atomWithQuery<ProofState | null>((get) => {
  const worldId = get(worldIdAtom)
  const levelId = get(levelIdAtom)
  const rpcSess = get(rpcSessionAtom)
  const levelUri = get(levelUriAtom)
  const version = get(modelVersionAtom)
  const synced = get(syncedVersionAtom)
  // Only ask once Lean has the current text, and only with this level's session.
  const ready = rpcSess?.sessionId != undefined && rpcSess.uri == levelUri &&
    version != undefined && synced === version && worldId != undefined && levelId != undefined
  return {
    queryKey: ['proof', worldId, levelId, rpcSess?.sessionId, version],
    // While the next version is checked, keep showing this level's last proof state rather
    // than a spinner (`isPlaceholderData` tells them apart).
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === worldId && prevQuery?.queryKey[2] === levelId &&
      prevQuery?.queryKey[3] === rpcSess?.sessionId ? prev : undefined,
    // Errors are thrown rather than swallowed, so that the level can reconnect an outdated
    // session or tell the player, instead of showing a loading spinner forever.
    retry: (failureCount, error: any) => !needsReconnect(error) && failureCount < 2,
    queryFn: async () => {
      // `refetch` runs even when the query isn't enabled.
      if (!ready) return null
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timed out waiting for the Lean server')),
          PROOF_STATE_TIMEOUT_MS)
      })
      const request = rpcSess.client.sendRequest(
        '$/lean/rpc/call',
        {
          method: "Game.getProofState",
          params: {
            textDocument: {uri: rpcSess.uri},
            position: {line: 0, character: 0},
            worldId,
            levelId,
          },
          textDocument: {uri: rpcSess.uri},
          position: {line: 0, character: 0},
          sessionId: rpcSess.sessionId
        }
      )
      try {
        return await Promise.race([request, timeout])
      } catch (err) {
        console.warn(err)
        throw err
      } finally {
        clearTimeout(timer)
      }
    },
    enabled: ready
  }
})

/**
 * The proof consists of multiple steps that are processed one after the other.
 * In particular multi-line terms like `match`-statements will not be supported.
 *
 * Note that the first step will always have "" as command
 */
export const proofAtom = atom(get => get(proofQueryAtom).data ?? undefined)

/** The proof state for the current text, or `undefined` while that is still being checked
 * (when `proofAtom` may still show the previous version's). */
export const currentProofAtom = atom(get => {
  const query = get(proofQueryAtom)
  return query.isPlaceholderData ? undefined : query.data ?? undefined
})

/** Whether the current text has not been checked yet. */
export const proofPendingAtom = atom(get => get(currentProofAtom) === undefined)






/*
 * FIXME: everything below here is not curated yet!
 */






/*
I went up the dependency graph starting from the former
info.tsx  -> infos.ts -> main.tsx -> level.tsx -> index.tsx and extracted
contexts by their respective atoms. Some of the atoms do not belong here
and have been put here temporarly during my refactoring attempts.
*/

export const leanFileProgressAtom = atom<Map<string, LeanFileProgressProcessingInfo[]>>(new Map())

export const lspDiagnosticsAtom = atom<Map<DocumentUri, Diagnostic[]>>(new Map());

// export const serverVersionAtom = atom<ServerVersion>(new ServerVersion(''))

export const infoviewConfigAtom = atom<InfoviewConfig>(defaultInfoviewConfig)

// export const editorConnectionAtom = atom<EditorConnection | null>(null)



// export const rpcSessionsAtom = atom<RpcSessions | null>(null)

// export const rpcSessionAtPosAtom = atom<RpcSessionAtPos | null>(null)

export const isProcessingAtom = atom<Boolean>(false)

export const typewriterContentAtom = atom<string>("")

export const typewriterAtom = atom(
  (get) => {get(typewriterContentAtom)},
  (get, set, val: string) => {
    const oneLineEditor = get(oneLineEditorAtom)
    const { isSuggestionsMobileMode } = get(preferencesAtom)

    if (!oneLineEditor) {
      console.log("[TypewriterAtom] oneLineEditor is False")
      return
    }

    console.log(`[TypewriterAtom] Set value in oneLineEditor to ${val}`)
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

/** Options for the LeanMonaco instance */
export const leanMonacoOptionsAtom = atom<LeanMonacoOptions>(get => {
  const gameId = get(gameIdAtom)
  return {
  websocket: {
    url: ((window.location.protocol === "https:") ? "wss://" : "ws://") + window.location.host + '/websocket/' + gameId
  },
  htmlElement: undefined, // The wrapper div for monaco
  vscode: {
    // The default options are defined in `LeanMonaco.start` and can be overwritten here.
    // See docstring of `LeanMonacoOptions`!
    // For example:
    "editor.wordWrap": true,
  }
}})

export const leanMonacoEditorModelAtom = atom(
  (get) => {
    const editor = get(editorAtom)
    return editor?.getModel()
  }
)

export const leanMonacoEditorUriAtom = atom(
  (get) => {
    const model = get(leanMonacoEditorModelAtom)
    return model?.uri.toString() ?? ''
  }
)

export const haseditorAtom = atom(
  (get) => {
    const editor = get(editorAtom)
    console.log(`haseditorAtom: editor state is ${editor}`)
    const model = get(leanMonacoEditorModelAtom)
    console.log(`haseditorAtom: model state is ${model}`)
    return Boolean(editor && model)
  })

export const selectionsAtom = atom(
  get => {
    const levelProgress = get(levelProgressAtom)
    return levelProgress?.selections ?? []
  },
  (get, set, val: Selection[]) => {
    const levelProgress = get(levelProgressAtom)
    if (levelProgress == null) return
    set(levelProgressAtom, { ...levelProgress, selections: val })
  }
)

/** If a level has a template, the user is forced to use editor mode */
export const lockEditorModeAtom = atom(get => {
  const { data: levelInfo } = get(levelInfoAtom)
  return levelInfo?.template != null
})

/** Whether the current game is in typewriter mode */
export const typewriterModeAtom = atom(
  get => {
    // force editor mode
    const lockEditorMode = get(lockEditorModeAtom)
    if (lockEditorMode) return false

    // read setting from local storage
    const progress = get(progressAtom)
    return progress?.typewriterMode ?? true
  },
  (get, set, val: boolean | null) => {
    const progress = get(progressAtom)
    if (!progress) return
    const valMod = (val === null) ? undefined : val
    set(progressAtom, { ...progress, typewriterMode: valMod })
  }
)

export const restoreErrorCommandEffect = atomEffect(
  (get, set) => {
    const errorCommand = get(lastProofStepErrorCommandAtom)
    if (errorCommand) {
      set(typewriterContentAtom, errorCommand)
    }
  }
)

export const lastProofStepHasErrorsAtom = atom(
  (get) => {
    const proof = get(proofAtom)
    if (!proof?.steps.length) {
      return false
    }
    let diags = [...proof.steps[proof.steps.length - 1].diags, ...proof.diagnostics]
    return diags.some(
      (d) => (d.severity == DiagnosticSeverity.Error)
    )
  }
)

export const lastProofStepErrorCommandAtom = atom(
  (get) => {
    const proof = get(proofAtom)
    const hasErrors = get(lastProofStepHasErrorsAtom)
    if (!hasErrors || !proof?.steps) {
      return null
    }
    return proof.steps[proof.steps.length - 1].command
  }
)

/** TODO: Workaround to capture a crash of the gameserver. */
export const interimDiagsAtom = atom<Array<Diagnostic>>([])

/** TODO: Workaround to capture a crash of the gameserver. */
export const crashedAtom = atom<boolean>(false)

export const syncTypewriterToEditorEffect = atomEffect(
  (get, set) => {
    const oneLineEditor = get(oneLineEditorAtom)
    const typewriter = get(typewriterContentAtom)
    const { isSuggestionsMobileMode } = get(preferencesAtom)

    if (!oneLineEditor) {
      console.log("oneLineEditor is False")
      return
    }

    if (oneLineEditor.getValue() !== typewriter) {
      console.log(`Set value in oneLineEditor to ${typewriter}`)
      oneLineEditor.setValue(typewriter)
      oneLineEditor.setPosition({
        column: typewriter.length + 1,
        lineNumber: 1
      })
    }

    if (!isSuggestionsMobileMode) {
      oneLineEditor.focus()
    }
  }
)

export const syncEditorPositionEffect = atomEffect(
  (get, set) => {
    const oneLineEditor = get(oneLineEditorAtom)
    const editor = get(editorAtom)
    const hasEditor = get(haseditorAtom)
    const { isSuggestionsMobileMode } = get(preferencesAtom)

    if (!oneLineEditor || !hasEditor || !editor) return

    oneLineEditor.setPosition({
      column: editor.getValue().length + 1,
      lineNumber: 1
    })

    if (!isSuggestionsMobileMode) {
      oneLineEditor.focus()
    }
  }
)
