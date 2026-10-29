/**
 * @fileOverview The plumbing between the client and Lean: the Monaco editor, the language
 * client and the RPC session, and the raw proof state that Lean sends back.
 *
 * Nothing in here knows about the game (hints, the typewriter, completing a level...): that is
 * in `proof-atoms.ts`. The effects that keep these atoms up to date live in
 * `components/level/useLeanConnection.ts`.
 */
import { editor } from 'monaco-editor'
import { atom } from "jotai";
import { atomWithQuery } from 'jotai-tanstack-query';
import { LeanMonaco, LeanMonacoOptions, RpcSessionAtPos, LeanClient } from 'lean4monaco'
import { gameIdAtom, levelIdAtom, worldIdAtom } from "./location-atoms";
import { ProofState } from '../api/rpc_api';

/** The unique leanMonaco instance for the entire application */
export const leanMonacoAtom = atom<LeanMonaco | null>(null)

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
  }
})

/** The active client. lean4game only uses one client simultaneously */
export const clientAtom = atom<LeanClient>()

/** The current (multiline) editor */
export const editorAtom = atom<editor.IStandaloneCodeEditor | null>(null)

/** The model of the current editor */
export const modelAtom = atom(get => get(editorAtom)?.getModel() ?? undefined)

/** The URI of the currently opened file */
export const uriAtom = atom(get => get(modelAtom)?.uri)

/** The currently used RPC session */
export const rpcSessionAtom = atom<RpcSessionAtPos>()

/** The URI of the current level's document (each level has its own, see `useLeanConnection`).
 * All of them are in one folder: the editor starts a language client (a connection, with its
 * own Lean server) per folder, and we want one for the whole game. */
export const levelUriAtom = atom(get => `file:///levels/${get(worldIdAtom)}.${get(levelIdAtom)}.lean`)

/** The version of the current level's text in the editor. */
export const modelVersionAtom = atom<number | undefined>(undefined)

/** The latest version of the current level's text that has been sent to Lean. The proof state
 * is only requested once this equals `modelVersionAtom`: Lean answers a request with the latest
 * version it has, so a request sent before the new text would be answered for the old one. */
export const syncedVersionAtom = atom<number | undefined>(undefined)

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
