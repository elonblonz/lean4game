import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Read when the module is loaded.
process.env.LEAN4GAME_STABLE_HEADER = 'local/testgame'
const { GameManager } = await import('../dist/src/serverProcess.js')

/** A game directory with two levels and a `GameServer` that has `LevelScope`. */
function makeGame({ rootModule = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lean4game-test-'))
  const data = path.join(dir, '.lake', 'gamedata')
  fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(path.join(data, 'game.json'), JSON.stringify({ name: 'TestGame' }))
  for (const level of [1, 2]) {
    fs.writeFileSync(path.join(data, `level__W__${level}.json`), JSON.stringify({ module: `Game.Levels.W.L0${level}` }))
  }
  if (rootModule) fs.writeFileSync(path.join(dir, 'Game.lean'), '')
  const runner = path.join(dir, '.lake', 'packages', 'GameServer', 'server', 'GameServer')
  fs.mkdirSync(runner, { recursive: true })
  fs.writeFileSync(path.join(runner, 'Runner.lean'), 'elab "LevelScope" gameId:str : command => pure ()')
  return dir
}

/** A fake connection to a Lean server: `sent` collects what the relay sends, `lean` replies. */
function fakeLean() {
  const sent = []
  let listener
  const noEvent = () => ({ dispose: () => {} })
  const connection = {
    reader: { listen: cb => { listener = cb; return { dispose: () => {} } },
      onError: noEvent, onClose: noEvent, onPartialMessage: noEvent, dispose: () => {} },
    writer: { write: m => sent.push(m) },
    onClose: noEvent,
    dispose: () => {},
  }
  return { connection, sent, lean: m => listener(m) }
}

/** A spare warmed up for `game`, and a session that takes it. */
function warmSession(game = 'local/testgame', dir = makeGame()) {
  const manager = new GameManager(dir)
  const { connection, sent, lean } = fakeLean()
  const warmUp = manager.warmUp(connection, dir, game)
  const toClient = []
  let fromClient
  const socket = { reader: { listen: cb => { fromClient = cb } }, writer: { write: m => toClient.push(m) } }
  const start = () => manager.messageTranslation(socket, warmUp.connection, dir, false, undefined,
    { game, startedAt: 0, fromPool: true, warmUp })
  return { manager, warmUp, sent, lean, toClient, start, client: m => fromClient(m) }
}

const initialize = { jsonrpc: '2.0', id: 0, method: 'initialize',
  params: { processId: null, initializationOptions: { hasWidgets: true },
    capabilities: { textDocument: { completion: { completionItem: { insertReplaceSupport: true } } } } } }
const open = (level, version, text = '') => ({ jsonrpc: '2.0', method: 'textDocument/didOpen',
  params: { textDocument: { uri: `file:///levels/W.${level}.lean`, languageId: 'lean4', version, text } } })
const diagnostics = version => ({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics',
  params: { uri: 'file:///whatever', version, diagnostics: [{ message: 'from the warm-up' }] } })
const tick = () => new Promise(resolve => setImmediate(resolve))

test('a spare of a game with a stable header initializes Lean and opens the header', () => {
  const s = warmSession()
  assert.deepEqual(s.sent.map(m => m.method), ['initialize', 'initialized', 'textDocument/didOpen'])
  assert.equal(s.sent[0].params.rootUri, 'TestGame')
  assert.equal(s.sent[2].params.textDocument.text, 'import Game import GameServer.Runner \n')
  assert.equal(s.sent[2].params.textDocument.version, s.warmUp.version)
})

test('games without a stable header, or whose levels import different modules, are not warmed up', () => {
  const manager = new GameManager(makeGame())
  assert.equal(manager.warmUp(fakeLean().connection, makeGame(), 'local/unlisted'), undefined)
  const { connection, sent } = fakeLean()
  assert.equal(manager.warmUp(connection, makeGame({ rootModule: false }), 'local/testgame'), undefined)
  assert.equal(sent.length, 0)
})

test('before a session takes the spare, Lean gets answers and nothing reaches a client', () => {
  const s = warmSession()
  s.lean({ jsonrpc: '2.0', id: 'register_lean_watcher', method: 'client/registerCapability', params: {} })
  s.lean(diagnostics(1))
  assert.deepEqual(s.sent.at(-1), { jsonrpc: '2.0', id: 'register_lean_watcher', result: null })
  s.start()
  assert.equal(s.toClient.length, 0)
})

test("the client's initialize is answered with the spare's, and its first level replaces the text", async () => {
  const s = warmSession()
  s.lean({ jsonrpc: '2.0', id: 'lean4game-warm-up',
    result: { capabilities: { hoverProvider: true, semanticTokensProvider: { full: true, range: true } } } })
  s.start()
  s.client(initialize)
  s.client({ jsonrpc: '2.0', method: 'initialized', params: {} })
  await tick()
  // Adjusted like any answer from Lean (range semantic tokens are not supported).
  assert.deepEqual(s.toClient, [{ jsonrpc: '2.0', id: 0,
    result: { capabilities: { hoverProvider: true, semanticTokensProvider: { full: true, range: false } } } }])

  const before = s.sent.length
  s.client(open(1, 1, 'exact h'))
  const out = s.sent.slice(before)
  assert.deepEqual(out.map(m => m.method), ['textDocument/didChange'])
  assert.equal(out[0].params.textDocument.version, s.warmUp.version + 1)
  const text = out[0].params.contentChanges[0].text
  assert.equal(text.split('\n')[0] + '\n', s.sent[2].params.textDocument.text)
  assert.match(text, /Runner "TestGame" "W" 1 .*:= by\nexact h\n$/)

  // Late diagnostics of the warm-up are dropped, the level's are the client's.
  s.lean(diagnostics(s.warmUp.version))
  s.lean(diagnostics(s.warmUp.version + 1))
  assert.equal(s.toClient.length, 2)
  assert.equal(s.toClient[1].params.uri, 'file:///levels/W.1.lean')
  assert.equal(s.toClient[1].params.version, 1)

  // Switching levels works as before.
  s.client(open(2, 1))
  assert.equal(s.sent.at(-1).method, 'textDocument/didChange')
  assert.equal(s.sent.at(-1).params.textDocument.version, s.warmUp.version + 2)
})

test("Lean's answer to the spare's initialize can arrive after the client's initialize", async () => {
  const s = warmSession()
  s.start()
  s.client(initialize)
  await tick()
  assert.equal(s.toClient.length, 0)
  s.lean({ jsonrpc: '2.0', id: 'lean4game-warm-up', result: { capabilities: {} } })
  await tick()
  assert.deepEqual(s.toClient, [{ jsonrpc: '2.0', id: 0, result: { capabilities: {} } }])
  // Neither initialize nor anything else went to Lean twice.
  assert.equal(s.sent.filter(m => m.method === 'initialize').length, 1)
})

test("later spares are initialized like the last client, without the player's options", () => {
  const s = warmSession()
  s.start()
  s.client({ ...initialize, params: { ...initialize.params,
    capabilities: { lean: { silentDiagnosticSupport: true } },
    initializationOptions: { hasWidgets: true, difficulty: 1, inventory: ['x'] } } })
  const { connection, sent } = fakeLean()
  const dir = makeGame()
  s.manager.warmUp(connection, dir, 'local/testgame')
  assert.deepEqual(sent[0].params.capabilities, { lean: { silentDiagnosticSupport: true } })
  assert.deepEqual(sent[0].params.initializationOptions, { hasWidgets: true })
  assert.equal(sent[0].params.rootUri, 'TestGame')
})
