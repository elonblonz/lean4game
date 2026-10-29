import { useEffect, useRef } from "react"
import { useAtom } from "jotai"
import { LeanClient, LeanMonacoEditor, RpcSessionAtPos } from "lean4monaco"
import { RpcConnectParams } from "@leanprover/infoview-api"
import { clientAtom, editorAtom, leanMonacoAtom, levelUriAtom, modelVersionAtom, needsReconnect,
  proofQueryAtom, rpcSessionAtom, syncedVersionAtom, uriAtom } from "../../store/lean-atoms"
import { codeStorageAtom } from "../../store/proof-atoms"
import { clearTypewriterAtom } from "../../store/typewriter-atoms"
import { deletedChatAtom, selectedStepAtom } from "../../store/chat-atoms"
import { inventoryAtom, selectedDocTileAtom } from "../../store/inventory-atoms"
import { difficultyAtom } from "../../store/progress-atoms"
import { levelIdAtom, worldIdAtom } from "../../store/location-atoms"

/**
 * Connect the current level to Lean: start the level's editor in `codeviewRef`, keep the saved
 * code and the editor in sync, and keep an RPC session to Lean for `proofQueryAtom`.
 *
 * This is only the plumbing (see `store/lean-atoms.ts`); what the game does with the proof is
 * in `useLevelGameLogic`.
 */
export function useLeanConnection(codeviewRef: React.RefObject<HTMLDivElement>) {
  const [leanMonaco] = useAtom(leanMonacoAtom)
  const [worldId] = useAtom(worldIdAtom)
  const [levelId] = useAtom(levelIdAtom)
  const [code, setCode] = useAtom(codeStorageAtom)
  const [editor, setEditor] = useAtom(editorAtom)
  const [client, setClient] = useAtom(clientAtom)
  const [uri] = useAtom(uriAtom)
  const [rpcSess, setRpcSess] = useAtom(rpcSessionAtom)
  const [levelUri] = useAtom(levelUriAtom)
  const [modelVersion, setModelVersion] = useAtom(modelVersionAtom)
  const [syncedVersion, setSyncedVersion] = useAtom(syncedVersionAtom)
  const [, clearTypewriter] = useAtom(clearTypewriterAtom)
  const [, setDeletedChat] = useAtom(deletedChatAtom)
  const [, setSelectedStep] = useAtom(selectedStepAtom)
  const [, setSelectedDocTile] = useAtom(selectedDocTileAtom)

  // Start the editor, following lean4monaco demo. Each level has its own document,
  // `file:///<world>/<level>.lean` (the relay gives Lean one level at a time).
  useEffect(() => {
    if (leanMonaco) {
      const leanMonacoEditor = new LeanMonacoEditor()
      let disposed = false

      ;(async () => {
        await leanMonaco!.whenReady
        console.debug('[lean4game]: starting editor')
        await leanMonacoEditor.start(codeviewRef.current!, levelUri, code ?? "")
        console.debug('[lean4game]: editor started')
        if (disposed) return
        // The document was opened with this version; changes from now on are reported by
        // the client's `didChange` (see below).
        const version = leanMonacoEditor.editor?.getModel()?.getVersionId()
        setModelVersion(version)
        setSyncedVersion(version)
        setEditor(leanMonacoEditor.editor)
      })()

      return () => {
        disposed = true
        leanMonacoEditor.dispose()
        // Forget everything that belongs to this level, so the next one doesn't use it
        // (all of these are global atoms).
        setEditor(null)
        setRpcSess(sess => { sess?.dispose(); return undefined })
        setModelVersion(undefined)
        setSyncedVersion(undefined)
        clearTypewriter()
        setDeletedChat([])
        setSelectedStep(undefined)
        setSelectedDocTile(null)
      }
    }
  }, [leanMonaco, worldId, levelId])

  // Persist editor text into progress whenever the model changes. Only for this level's
  // editor: right after switching levels, `editor` can still be the previous level's.
  useEffect(() => {
    const model = editor?.getModel()
    if (!editor || !model || model.uri.toString() !== levelUri) return

    setCode(editor.getValue())
    const disposable = editor.onDidChangeModelContent(() => {
      setCode(editor.getValue())
      setModelVersion(model.getVersionId())
    })

    return () => {
      disposable.dispose()
    }
  }, [editor, setCode, levelUri])

  // The saved code is the truth: if it changes from outside the editor (progress erased or
  // uploaded), or the editor kept an older text from a previous visit, update the editor.
  useEffect(() => {
    const model = editor?.getModel()
    if (!editor || !model || model.uri.toString() !== levelUri) return
    const saved = code ?? ""
    if (editor.getValue() !== saved) model.setValue(saved)
  }, [editor, code, levelUri])

  // Tell the game server the player's rules setting and unlocked items: Lean uses them to
  // decide which tactics and theorems are allowed.
  // (The client drops notifications until its connection runs, so they are also sent right
  // before connecting the RPC session, below.)
  const [difficulty] = useAtom(difficultyAtom)
  const [inventory] = useAtom(inventoryAtom)
  const optionsRef = useRef({ difficulty, inventory: inventory ?? [] })
  optionsRef.current = { difficulty, inventory: inventory ?? [] }
  useEffect(() => {
    client?.sendNotification('$/lean4game/options', optionsRef.current)
  }, [client, difficulty, JSON.stringify(inventory)])

  // Track which version of the text Lean has: the proof state is only requested for that.
  useEffect(() => {
    if (!client) return
    const disposable = client.didChange((params: { textDocument: { uri: string, version: number } }) => {
      if (decodeURIComponent(params.textDocument.uri) == decodeURIComponent(levelUri)) {
        setSyncedVersion(params.textDocument.version)
      }
    })
    return () => disposable.dispose()
  }, [client, levelUri])

  // In case a change is never reported (it should be), don't wait for it forever.
  useEffect(() => {
    if (modelVersion === undefined || syncedVersion === modelVersion) return
    const timer = setTimeout(() => {
      console.warn(`[lean4game] Lean did not report receiving version ${modelVersion}; asking anyway`)
      setSyncedVersion(modelVersion)
    }, 2000)
    return () => clearTimeout(timer)
  }, [modelVersion, syncedVersion])

  // The language client: the provider's first one, once LeanMonaco is ready, and whichever it
  // adds later (e.g. after a restart).
  useEffect(() => {
    if (!leanMonaco) return
    let disposed = false
    let subscription: { dispose(): void } | undefined
    leanMonaco.whenReady.then(() => {
      const provider = leanMonaco.clientProvider
      if (disposed || !provider) return
      const firstClient = provider.getClients()[0]
      if (firstClient) setClient(firstClient)
      subscription = provider.clientAdded((newClient: LeanClient) => setClient(newClient))
    })
    return () => {
      disposed = true
      subscription?.dispose()
    }
  }, [leanMonaco])

  // Start an RPC session for this level once its editor exists (again if the client changed).
  const connecting = useRef(false)
  useEffect(() => {
    if (rpcSess?.uri === levelUri && rpcSess.client === client) return
    if (!client || uri?.toString() !== levelUri) return
    let cancelled = false
    function connect() {
      if (connecting.current || !client) return
      connecting.current = true
      console.debug('rpc session connecting...')
      client.sendNotification('$/lean4game/options', optionsRef.current)
      client.sendRequest('$/lean/rpc/connect', {uri: levelUri} as RpcConnectParams).then(result => {
        const sessionId = result.sessionId
        console.debug(`rpc session id: ${sessionId}`)
        const _rpcSess = new RpcSessionAtPos(client, sessionId, levelUri)
        if (cancelled) { _rpcSess.dispose(); return }
        setRpcSess(old => { old?.dispose(); return _rpcSess })
      }).catch((err) => {
        console.debug("rpc connect failed: ", err)
      }).finally(() => {
        connecting.current = false
      })
    }
    connect()
    // Retry until it works, e.g. while Lean is still starting.
    const interval = setInterval(connect, 2000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [client, uri, rpcSess, levelUri])

  // If Lean no longer knows our RPC session (e.g. the server restarted the file worker),
  // drop it so that the effect above connects a new one.
  const [{ error: proofError }] = useAtom(proofQueryAtom)
  useEffect(() => {
    if (needsReconnect(proofError)) {
      console.debug('rpc session outdated, reconnecting')
      setRpcSess(sess => { sess?.dispose(); return undefined })
    }
  }, [proofError])
}
