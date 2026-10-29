import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Read when the module is loaded.
process.env.LEAN4GAME_STABLE_HEADER = 'local/Other, local/TestGame'
const { GameManager } = await import('../dist/src/serverProcess.js')

/** A game directory with two levels and a `GameServer` that has `LevelScope`. */
function makeGame() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lean4game-test-'))
  const data = path.join(dir, '.lake', 'gamedata')
  fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(path.join(data, 'game.json'), JSON.stringify({ name: 'TestGame' }))
  for (const level of [1, 2]) {
    fs.writeFileSync(path.join(data, `level__W__${level}.json`), JSON.stringify({ module: `Game.Levels.W.L0${level}` }))
  }
  fs.writeFileSync(path.join(dir, 'Game.lean'), '')
  const runner = path.join(dir, '.lake', 'packages', 'GameServer', 'server', 'GameServer')
  fs.mkdirSync(runner, { recursive: true })
  fs.writeFileSync(path.join(runner, 'Runner.lean'), 'elab "LevelScope" gameId:str : command => pure ()')
  return dir
}

/** Fake connections: `toServer`/`toClient` collect what the relay sends. */
function connect(dir, game = 'local/testgame') {
  const toServer = [], toClient = []
  let fromClient, fromServer
  const socket = { reader: { listen: cb => { fromClient = cb } }, writer: { write: m => toClient.push(m) } }
  const server = { reader: { listen: cb => { fromServer = cb } }, writer: { write: m => toServer.push(m) } }
  new GameManager(dir).messageTranslation(socket, server, dir, false, undefined, { game, startedAt: 0, fromPool: false })
  return { toServer, toClient, client: m => fromClient(m), server: m => fromServer(m) }
}

const open = (level, version, text = '') => ({ jsonrpc: '2.0', method: 'textDocument/didOpen',
  params: { textDocument: { uri: `file:///W/${level}.lean`, languageId: 'lean4', version, text } } })

test('switching levels keeps the header and only replaces the text after it', () => {
  const c = connect(makeGame())
  c.client(open(1, 1, 'exact h'))
  c.client(open(2, 1))
  assert.equal(c.toServer.length, 2)
  const [first, second] = c.toServer
  assert.equal(first.method, 'textDocument/didOpen')
  assert.match(first.params.textDocument.text, /^import Game import GameServer.Runner \nLevelScope "TestGame" "W" 1 Runner/)
  assert.equal(second.method, 'textDocument/didChange')
  const text = second.params.contentChanges[0].text
  assert.equal(text.split('\n')[0], first.params.textDocument.text.split('\n')[0])
  assert.match(text, /Runner "TestGame" "W" 2 /)
  assert.ok(second.params.textDocument.version > first.params.textDocument.version)
})

test("Lean's versions count up across levels and are reported as the client's", () => {
  const c = connect(makeGame())
  c.client(open(1, 5))
  c.client(open(2, 1))
  c.client({ jsonrpc: '2.0', method: 'textDocument/didChange',
    params: { textDocument: { uri: 'file:///W/2.lean', version: 2 },
      contentChanges: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, text: 'intro x\n' }] } })
  const versions = c.toServer.map(m => m.params.textDocument.version)
  assert.deepEqual(versions, [1, 2, 3])
  assert.equal(c.toServer[2].params.contentChanges[0].range.start.line, 2)  // shifted past the header

  const diagnostics = version => ({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics',
    params: { uri: 'file:///whatever', version, diagnostics: [] } })
  c.server(diagnostics(1))  // late, from level 1
  c.server(diagnostics(3))
  assert.equal(c.toClient.length, 1)
  assert.equal(c.toClient[0].params.uri, 'file:///W/2.lean')
  assert.equal(c.toClient[0].params.version, 2)
})

test('closing the level does not close the document in Lean', () => {
  const c = connect(makeGame())
  c.client(open(1, 1))
  c.client({ jsonrpc: '2.0', method: 'textDocument/didClose', params: { textDocument: { uri: 'file:///W/1.lean' } } })
  c.client(open(2, 1))
  assert.deepEqual(c.toServer.map(m => m.method), ['textDocument/didOpen', 'textDocument/didChange'])
})

test('games that are not listed reopen the document for each level', () => {
  const c = connect(makeGame(), 'local/unlisted')
  c.client(open(1, 1))
  c.client(open(2, 1))
  assert.deepEqual(c.toServer.map(m => m.method),
    ['textDocument/didOpen', 'textDocument/didClose', 'textDocument/didOpen'])
  assert.match(c.toServer[0].params.textDocument.text, /^import Game.Levels.W.L01 import GameServer.Runner/)
  assert.match(c.toServer[2].params.textDocument.text, /^import Game.Levels.W.L02 import GameServer.Runner/)
})
