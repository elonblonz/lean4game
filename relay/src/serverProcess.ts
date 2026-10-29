import * as cp from 'child_process';
import { ChildProcess } from 'child_process';
import { IncomingMessage } from 'http';
import * as jsonrpcserver from 'vscode-ws-jsonrpc/server';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { applyContentChanges } from './textChanges.js';

type Tag = { owner: string; repo: string; };
export type GameSession = {
  process: ChildProcess,
  game: string,
  gameDir: string,
  usesCustomLeanServer: boolean,
  /** When the Lean server was started, and whether it was a spare from the pool. */
  startedAt: number,
  fromPool: boolean
}
const environment = process.env.NODE_ENV;
const isDevelopment = environment === 'development';
const noBwrap = process.env.NO_BWRAP == "true"

/**
 * Spare Lean servers to keep ready per game (`LEAN_POOL_SIZE`, `0` disables the pool).
 * A spare has started `lake serve` but not opened a level yet, so this saves the start of the
 * server, not the import of the game. Default: 1 in development, 0 in production.
 */
const poolSizeSetting = parseInt(process.env.LEAN_POOL_SIZE ?? '')
const POOL_SIZE = Number.isNaN(poolSizeSetting) ? (isDevelopment ? 1 : 0) : Math.max(0, poolSizeSetting)
/**
 * The games to keep spares for (`LEAN_POOL_GAMES`, comma separated `owner/repo`).
 * Default: in development the local games, in production a few popular games.
 */
const POOL_GAMES = (process.env.LEAN_POOL_GAMES ?? '').split(',').map(s => s.trim()).filter(s => s)
const DEFAULT_PRODUCTION_POOL_GAMES = [
  "hhu-adam/robo",
  "leanprover-community/nng4",
  "djvelleman/stg4",
  "trequetrum/lean4game-logic",
]

/**
 * The games whose levels are opened by editing the text after the header instead of reopening
 * the document (`LEAN4GAME_STABLE_HEADER`: `true` for all games, or a comma separated list of
 * `owner/repo`; default: none). The header imports the whole game, so Lean keeps the imported
 * environment when the player switches levels; but levels then also see what later levels of
 * the game define, which makes some levels trivial in some games (see `doc/server.md`).
 */
const STABLE_HEADER_SETTING = (process.env.LEAN4GAME_STABLE_HEADER ?? '').trim().toLowerCase()
const STABLE_HEADER_GAMES = STABLE_HEADER_SETTING.split(',').map(s => s.trim()).filter(s => s)
const usesStableHeader = (game: string) =>
  STABLE_HEADER_SETTING === 'true' || STABLE_HEADER_GAMES.includes(game.toLowerCase())

export class GameManager {
  /** Spare Lean server processes per game (by tag), ready for the next player. */
  queue: { [tag: string]: ChildProcess[] }
  /** Every Lean server process we started that is still running (spares and sessions). */
  processes: Set<ChildProcess>
  /** When each of these processes was started. */
  startTimes: WeakMap<ChildProcess, number>
  urlRegEx: RegExp
  dir: string

  constructor(directory: string) {
    this.queue = {};
    this.processes = new Set();
    this.startTimes = new WeakMap();
    this.urlRegEx = /^\/websocket\/g\/([\w.-]+)\/([\w.-]+)$/;
    this.dir = directory
  }

  startGame(req: IncomingMessage, ip: string): GameSession{
    let ps: ChildProcess
    const reRes = this.urlRegEx.exec(req.url);

    if (!reRes) { console.error(`Connection refused because of invalid URL: ${req.url}`); return; }
    const reResTag: Tag = { owner: reRes[1], repo: reRes[2] };
    const tag = this.getTagString(reResTag);
    const game = `${reResTag.owner}/${reResTag.repo}`
    const customLeanServer = this.getCustomLeanServer(reResTag.owner, reResTag.repo)

    // TODO (Matvey): extract further information from `req`, for example browser language.
    console.log(`[${new Date()}] Socket opened by ${ip} on ${game}`);
    const spare = this.queue[tag]?.shift()  // the oldest spare is the most likely to be ready
    if (spare) {
      console.info(`[${new Date()}] Using a spare Lean server for ${game}`)
      ps = spare
    } else {
      ps = this.createGameProcess(reResTag.owner, reResTag.repo, customLeanServer);
    }
    // Replace the spare (or one that died) if the game is in the pool.
    if (this.queue[tag]) this.fillQueue(reResTag)

    if (ps == null) {
      console.error(`[${new Date()}]server process is undefined/null`);
      return;
    }

    const gameDir = this.getGameDir(reResTag.owner, reResTag.repo)

    return {process: ps, game: game, gameDir: gameDir, usesCustomLeanServer: customLeanServer !== null,
      startedAt: this.startTimes.get(ps) ?? Date.now(), fromPool: spare !== undefined }
  }

  /** Start the spare Lean servers of the games in the pool (see `POOL_SIZE`). */
  startPool() {
    if (POOL_SIZE == 0) return
    let games = POOL_GAMES
    if (games.length == 0) {
      games = isDevelopment ? this.getLocalGames().map(repo => `local/${repo}`) : DEFAULT_PRODUCTION_POOL_GAMES
    }
    for (const game of games) {
      const [owner, repo] = game.split('/', 2)
      if (!owner || !repo || !this.getGameDir(owner, repo)) {
        console.warn(`[${new Date()}] Not keeping spare Lean servers for unknown game ${game}`)
        continue
      }
      console.info(`[${new Date()}] Keeping ${POOL_SIZE} spare Lean server(s) for ${game}`)
      this.fillQueue({ owner, repo })
    }
  }

  /** The games next to the `lean4game` folder, played as `g/local/<folder>` in development. */
  getLocalGames(): string[] {
    const baseDir = path.join(this.dir, '..', '..', '..', '..')
    try {
      return fs.readdirSync(baseDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && /^[A-Za-z0-9_.-]+$/.test(e.name) &&
          fs.existsSync(path.join(baseDir, e.name, '.lake', 'gamedata', 'game.json')))
        .map(e => e.name)
    } catch (e) {
      console.error(`[${new Date()}] Could not look for local games in ${baseDir}: ${e}`)
      return []
    }
  }

  /** Stop all Lean servers we started (spares and sessions), e.g. when the relay shuts down. */
  shutdown() {
    this.queue = {}
    for (const ps of this.processes) {
      try { ps.kill() } catch (e) { /* already gone */ }
    }
  }

  getCustomLeanServer(owner, repo) : string | null {
    let gameDir = this.getGameDir(owner, repo);
    let binary = path.join(gameDir, ".lake", "packages", "GameServer", "server", ".lake", "build", "bin", "gameserver");
    if (fs.existsSync(binary)) {
      return binary
    } else {
      return null
    }
  }

  /**
   * The directory of the game's copy of the `GameServer` lake package.
   *
   * Usually this is a git dependency in `.lake/packages/`, but when developing the game engine
   * (`lake update -R -Klean4game.local`) it is a local path dependency, which lake records in
   * the game's manifest.
   */
  getGameServerDir(gameDir: string) : string | null {
    const manifestPath = path.join(gameDir, 'lake-manifest.json')
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        const pkg = (manifest.packages ?? []).find((p: any) => p.name === 'GameServer')
        if (pkg) {
          const packagesDir = manifest.packagesDir ?? path.join('.lake', 'packages')
          const dir = pkg.type === 'path'
            ? path.resolve(gameDir, pkg.dir)
            : path.join(gameDir, packagesDir, pkg.name, pkg.subDir ?? '')
          if (fs.existsSync(dir)) return dir
        }
      } catch (e) {
        console.error(`[${new Date()}] Could not read ${manifestPath}: ${e}`)
      }
    }
    // Fallback for the usual layout in case the manifest is missing or unreadable
    const dir = path.join(gameDir, '.lake', 'packages', 'GameServer', 'server')
    return fs.existsSync(dir) ? dir : null
  }

  /**
   * The game's root module (e.g. `Game`, which imports all the levels), given one level's
   * module. Falls back to the level's module if there is no such file.
   */
  getRootModule(gameDir: string, levelModule: string) : string {
    const root = levelModule.split('.')[0]
    return fs.existsSync(path.join(gameDir, `${root}.lean`)) ? root : levelModule
  }

  /** Whether the game's `GameServer` provides the `LevelScope` command (v4.31.0 and later). */
  gameServerHasLevelScope(gameDir: string) : boolean {
    const gameServerDir = this.getGameServerDir(gameDir)
    if (!gameServerDir) return false
    const runnerPath = path.join(gameServerDir, 'GameServer', 'Runner.lean')
    return fs.existsSync(runnerPath) &&
      fs.readFileSync(runnerPath, 'utf8').includes('elab "LevelScope"')
  }

  createGameProcess(owner: string, repo: string, customLeanServer: string | null) {
    let game_dir = this.getGameDir(owner, repo);
    if (!game_dir) return;

    let serverProcess: cp.ChildProcessWithoutNullStreams;
    if (noBwrap || isDevelopment) {
      if (customLeanServer) {
        // If the game still uses a custom Lean server, use it.
        // Note: `cwd` is important to be the `bin` directory as `Watchdog` calls `./gameserver` again
        serverProcess = cp.spawn(
          "./" + path.basename(customLeanServer),
          ["--server", game_dir],
          { cwd: path.dirname(customLeanServer) }
        );
      } else {
        serverProcess = cp.spawn("lake", ["serve", "--"], { cwd: game_dir });
      }
    } else {
      let cmd = "../../scripts/bubblewrap.sh"
      let options = [game_dir, customLeanServer ? "true" : "false"]
      if (owner == "test") {
        // TestGame doesn't have its own copy of the server and needs lean4game as a local dependency
        const lean4GameFolder = path.join(this.dir, '..', '..', '..', 'server')
        options.push(`--bind ${lean4GameFolder} /server`)
      }

      serverProcess = cp.spawn(cmd, options,
        { cwd: this.dir });
    }

    this.startTimes.set(serverProcess, Date.now())
    this.processes.add(serverProcess)
    serverProcess.on('exit', () => {
      this.processes.delete(serverProcess)
      // A spare that died (e.g. killed from outside) must not be handed to a player.
      for (const tag in this.queue) {
        this.queue[tag] = this.queue[tag].filter(ps => ps !== serverProcess)
      }
    })
    serverProcess.on('error', error => console.error(`[${new Date()}] Launching Lean Server failed: ${error}`));
    if (serverProcess.stderr !== null) {
      serverProcess.stderr.on('data', data => console.error(`[${new Date()}] Lean Server: ${data}`)
      );
    }
    return serverProcess;
  }

  /**
   * start Lean Server processes to refill the queue
   */
  fillQueue(tag: { owner: string; repo: string; }) {
    const tagString = this.getTagString(tag);
    this.queue[tagString] ??= []
    while (this.queue[tagString].length < POOL_SIZE) {
      let serverProcess: cp.ChildProcessWithoutNullStreams;
      serverProcess = this.createGameProcess(
        tag.owner, tag.repo,
        this.getCustomLeanServer(tag.owner, tag.repo)
      );
      if (serverProcess == null) {
        console.error(`[${new Date()}] serverProcess was undefined/null`);
        return;
      }
      this.queue[tagString].push(serverProcess);
    }
  }

  messageTranslation(
    socketConnection: jsonrpcserver.IConnection,
    serverConnection: jsonrpcserver.IConnection,
    gameDir: string,
    usesCustomLeanServer: boolean,
    onLevelOpened?: () => void,
    session?: { game: string, startedAt: number, fromPool: boolean }
  ) {

    let shift = (line: number, offset: number) => Math.max(0, line + offset)

    let shiftLines = (p : any, offset : number) => {
      if (p.hasOwnProperty("line")) {
        p.line = shift(p.line, offset)
      }
      if (p.hasOwnProperty("lineRange")) {
        p.lineRange.start = shift(p.lineRange.start, offset)
        p.lineRange.end = shift(p.lineRange.end, offset)
      }
      for (let key in p) {
        if (typeof p[key] === 'object' && p[key] !== null) {
          p[key] = shiftLines(p[key], offset);
        }
      }
      return p;
    }

    function replaceUri(obj: object, val: string) {
      for (const key in obj) {
        if (key === 'uri') {
          obj[key] = val;
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          replaceUri(obj[key], val);
        }
      }
      return obj
    }


    // These values will be set by the initialize message
    // The player's rules setting and unlocked items, sent by the client (`$/lean4game/options`).
    // Until then: the client's default (regular rules), nothing unlocked.
    let difficulty: number = 2
    let inventory: string[] = []
    let optionsReceived = false

    /** Accept only what can safely go into the Lean header: rules 0-2, and names that are
     * plain Lean string literals (no quotes, backslashes or control characters). */
    const validDifficulty = (d: any) => Number.isInteger(d) && d >= 0 && d <= 2
    const validInventory = (inv: any) => Array.isArray(inv) && inv.length <= 10000 &&
      inv.every(s => typeof s === 'string' && /^[^\u0000-\u001f\u007f"\\]{1,200}$/.test(s))
    let worldId: string
    let levelId: string

    let semanticTokenRequestIds = new Set<number>()

    const PROOF_START_LINE = 2

    const gameDataPath = path.join(gameDir, '.lake', 'gamedata', `game.json`)
    const gameData = JSON.parse(fs.readFileSync(gameDataPath, 'utf8'))

    // `LevelScope` is a command that applies the level's `open`s/`set_option`s before the
    // `Runner` command is *parsed*, which is what makes scoped notation available to the
    // player. Games pinned to an older `GameServer` do not know that command, so we only
    // emit it if their copy of the library provides it.
    const usesLevelScope = this.gameServerHasLevelScope(gameDir)
    if (!usesLevelScope) {
      console.warn(`[${new Date()}] Game uses a 'GameServer' without the 'LevelScope' command; ` +
        `scoped notation will not be available in the editor: ${gameDir}`)
    }

    const metadataUri = pathToFileURL(path.join(gameDir, 'Game', 'Metadata.lean')).href
    const stableHeader = session !== undefined && usesStableHeader(session.game) && usesLevelScope

    /** The world and level of a client document: `file:///levels/<world>.<level>.lean`, or
     * `file:///<world>/<level>.lean` as clients before 2026-10 named them. */
    const parseLevelUri = (uri: string): { worldId: string, levelId: string } | undefined => {
      const { dir, name } = path.posix.parse(new URL(uri).pathname)
      const m = name.match(/^(.+)\.(\d+)$/)
      if (dir === '/levels' && m) return { worldId: m[1], levelId: m[2] }
      if (/^\d+$/.test(name)) return { worldId: path.posix.basename(dir), levelId: name }
      return undefined
    }

    /* The client has one document per level (`file:///levels/<world>.<level>.lean`, see
       `levelUriAtom`),
       and keeps the ones it has visited open. Lean gets a single document, `Metadata.lean`
       with the level's header in front of the proof, so only one level is open in Lean at a
       time. We keep the text of every level the client has open; when the client works on
       another level, we close the current one in Lean and open the other one in full.
       With `stableHeader`, the header is the same for every level and we replace the text
       of Lean's document instead, so that Lean keeps the imports. */
    const clientDocs = new Map<string, { text: string, version: number }>()
    /** The client URI of the level that is open in Lean. */
    let activeUri: string | undefined
    /** The client URI that messages from Lean are about (the last level opened in Lean). */
    let serverDocUri: string | undefined
    /** Whether Lean has the document open (with `stableHeader` it stays open between levels). */
    let leanDocOpen = false
    /** The version of Lean's document. We number them ourselves: each of the client's levels has
     * its own versions, while Lean's document has to count up across levels. */
    let leanVersion = 0
    /** The client's version of the level for each of Lean's versions since it was opened. */
    const clientVersions = new Map<number, number>()
    /** The version the current level was opened in Lean with. Diagnostics and progress for
     * older versions are from the previous level, still on their way. */
    let openedVersion = 0
    /** For the timing log: when the current level was sent to Lean, until Lean is done with it. */
    let levelTiming: { uri: string, start: number, how: string } | undefined
    let initializeId: number | string | undefined

    /** The message that opens the client's level `uri` in Lean, or `undefined` if the level doesn't exist. */
    const openInServer = (uri: string): object | undefined => {
      const doc = clientDocs.get(uri)!
      const level = parseLevelUri(uri)
      if (!level) {
        console.error(`[${new Date()}] Not a level: ${uri}`)
        return undefined
      }
      worldId = level.worldId
      levelId = level.levelId
      const levelDataPath = path.join(gameDir, '.lake', 'gamedata', `level__${worldId}__${levelId}.json`)
      if (!fs.existsSync(levelDataPath)) {
        console.error(`[${new Date()}] Missing level data: ${levelDataPath}`)
        return undefined
      }
      const levelData = JSON.parse(fs.readFileSync(levelDataPath, 'utf8'))
      onLevelOpened?.()
      // Note: `LevelScope` and `Runner` have to stay on the same line as each other so that
      // the proof still starts on line `PROOF_START_LINE`.
      const levelIdArgs =
        `${JSON.stringify(gameData.name)} ${JSON.stringify(worldId)} ${levelId} `
      // With `stableHeader` we import the whole game (its root module, e.g. `Game`) rather
      // than the level's module, so the header is the same for every level.
      const imported = stableHeader ? this.getRootModule(gameDir, levelData.module) : levelData.module
      const text =
        `import ${imported} import GameServer.Runner \n` +
        (usesLevelScope ? `LevelScope ${levelIdArgs}` : ``) +
        `Runner ` + levelIdArgs +
        `(difficulty := ${difficulty}) ` +
        `(inventory := [${inventory.map(s => JSON.stringify(s)).join(',')}]) ` +
        `:= by\n${doc.text}\n`
      serverDocUri = uri
      openedVersion = ++leanVersion
      clientVersions.clear()
      clientVersions.set(leanVersion, doc.version)
      const reuse = stableHeader && leanDocOpen
      levelTiming = { uri, start: Date.now(), how: reuse ? 'header kept' : 'opened' }
      leanDocOpen = true
      if (reuse) {
        return { jsonrpc: "2.0", method: "textDocument/didChange",
          params: { textDocument: { uri: metadataUri, version: leanVersion }, contentChanges: [{ text }] } }
      }
      return { jsonrpc: "2.0", method: "textDocument/didOpen",
        params: { textDocument: { uri: metadataUri, languageId: "lean4", version: leanVersion, text } } }
    }

    /** Make `uri` the level that is open in Lean; returns the messages Lean needs for that. */
    const activate = (uri: string): object[] => {
      const out: object[] = []
      if (leanDocOpen && !stableHeader) {
        out.push({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: metadataUri } } })
        leanDocOpen = false
      }
      activeUri = undefined
      const open = openInServer(uri)
      if (open) {
        out.push(open)
        activeUri = uri
        console.info(`[${new Date()}] opened level in Lean: ${uri}`)
      }
      return out
    }

    /** Answer a request from the client ourselves instead of forwarding it. */
    const replyError = (message: any, code: number, text: string) => {
      if (message.id === undefined) return  // a notification: just drop it
      socketConnection.writer.write({ jsonrpc: "2.0", id: message.id, error: { code, message: text } } as any)
    }

    /** Translate one message from the client into the messages to send to Lean. */
    const fromClient = (message: any): object[] => {
      if (message.method === "initialize") {
        initializeId = message.id
        const options = message.params?.initializationOptions ?? {}
        if (validDifficulty(options.difficulty)) difficulty = options.difficulty
        if (validInventory(options.inventory)) inventory = options.inventory
        // We abuse the rootUri field to pass the game name to the server
        message.params.rootUri = gameData.name
        return [message]
      }

      if (message.method === "$/lean4game/options") {
        // The player's rules and inventory, which go into the level's header. The client can
        // only send them once its connection is running, i.e. after it opened the first level:
        // then open that level again if it was opened with different values. Later, a change of
        // the rules reopens the level, while a new inventory (after completing a level) applies
        // from the next level on.
        const options = message.params ?? {}
        const newDifficulty = validDifficulty(options.difficulty) ? options.difficulty : difficulty
        const newInventory = validInventory(options.inventory) ? options.inventory : inventory
        const first = !optionsReceived
        optionsReceived = true
        const changed = newDifficulty !== difficulty ||
          (first && JSON.stringify(newInventory) !== JSON.stringify(inventory))
        difficulty = newDifficulty
        inventory = newInventory
        return changed && activeUri !== undefined ? activate(activeUri) : []
      }

      const params = message.params ?? {}
      const uri: string | undefined = params.textDocument?.uri ?? params.uri

      if (message.method === "textDocument/didOpen") {
        console.info(`[${new Date()}] didOpen: ${uri}`)
        clientDocs.set(uri!, { text: params.textDocument.text, version: params.textDocument.version })
        return activate(uri!)
      }
      if (message.method === "textDocument/didChange") {
        const doc = clientDocs.get(uri!)
        if (!doc) return []
        doc.text = applyContentChanges(doc.text, params.contentChanges)
        doc.version = params.textDocument.version
        if (uri !== activeUri) return activate(uri!)  // sends the whole new text
        params.textDocument.version = ++leanVersion
        clientVersions.set(leanVersion, doc.version)
      } else if (message.method === "textDocument/didClose") {
        clientDocs.delete(uri!)
        if (uri !== activeUri) return []
        activeUri = undefined
        // With `stableHeader`, Lean keeps the document (and its imports) for the next level.
        if (stableHeader) return []
        leanDocOpen = false
      } else if (message.method === "$/lean/rpc/connect" && uri !== undefined && uri !== activeUri) {
        // The client starts working on a level it opened before, without changing it.
        if (!clientDocs.has(uri)) { replyError(message, -32801, `Unknown document ${uri}`); return [] }
        const out = activate(uri)
        if (uri !== activeUri) {
          replyError(message, -32801, `Cannot open level ${uri}`)
          return out  // still close the previous level
        }
        return [...out, message]
      } else if (uri !== undefined && uri !== activeUri) {
        // A message about a level that isn't open in Lean, e.g. from before switching levels.
        // RPC calls fail so that the client reconnects; editor features (highlighting etc.)
        // just get an empty answer.
        if (message.id === undefined) return []
        if (message.method?.startsWith("$/lean/rpc/")) {
          replyError(message, -32900, `Level ${uri} is not open`)
        } else {
          socketConnection.writer.write({ jsonrpc: "2.0", id: message.id, result: null } as any)
        }
        return []
      }
      return [message]
    }

    /** Sending messages from the client to the server */
    socketConnection.reader.listen((message: any) => {
      if (message?.error) {
        console.error(`[${new Date()}] CLIENT->SERVER error payload: ${JSON.stringify(message.error)}`)
      }

      // backwards compatibility for versions ≤ v4.7.0
      if (usesCustomLeanServer) {
        if (isDevelopment) { console.log(`CLIENT: ${JSON.stringify(message)}`); }
        if (message.method === "textDocument/didOpen") onLevelOpened?.()
        serverConnection.writer.write(message)
        return
      }

      let outs: object[]
      try {
        outs = fromClient(message)
      } catch (error) {
        // Don't lose the message silently (exceptions here are swallowed by the reader).
        console.error(`[${new Date()}] Failed to translate a message from the client:`, error, JSON.stringify(message).slice(0, 500))
        if (message?.id !== undefined && message?.method) replyError(message, -32603, 'The game server could not handle this request')
        return
      }
      for (const out of outs) {
        replaceUri(out, metadataUri)
        if ((out as any).method === "textDocument/semanticTokens/full") {
          semanticTokenRequestIds.add((out as any).id)
        }
        shiftLines(out, +PROOF_START_LINE)
        // Print the message as the server will receive it
        if (isDevelopment) { console.log(`CLIENT: ${JSON.stringify(out)}`); }
        serverConnection.writer.write(out as any)
      }
    });


    /** Translate one message from Lean for the client, or `undefined` to drop it. */
    const fromServer = (message: any): object | undefined => {
      if ((message as any)?.error) {
        console.error(`[${new Date()}] SERVER->CLIENT error payload: ${JSON.stringify((message as any).error)}`)
      }

      // Print the message as the server sends it
      if (isDevelopment) { console.log(`SERVER: ${JSON.stringify(message)}`); }

      // backwards compatibility for versions ≤ v4.7.0
      if (usesCustomLeanServer) return message

      if (initializeId !== undefined && message.id === initializeId && message.method === undefined) {
        initializeId = undefined
        if (session) {
          console.info(`[${new Date()}] [timing] Lean server initialized ${Date.now() - session.startedAt} ms ` +
            `after it was started (${session.fromPool ? 'spare' : 'new'})`)
        }
      }

      // Late diagnostics and progress of the previous level (see `openedVersion`), and
      // otherwise the client's version of the level instead of ours (see `leanVersion`).
      const versioned = message.method === "textDocument/publishDiagnostics" ? message.params
        : message.method === "$/lean/fileProgress" ? message.params?.textDocument : undefined
      const version = versioned?.version
      if (typeof version === 'number') {
        if (version < openedVersion) return undefined
        if (levelTiming && message.method === "$/lean/fileProgress" &&
            Array.isArray(message.params.processing) && message.params.processing.length == 0) {
          console.info(`[${new Date()}] [timing] ${levelTiming.uri}: Lean done ` +
            `${Date.now() - levelTiming.start} ms after the level was sent (${levelTiming.how})`)
          levelTiming = undefined
        }
        if (clientVersions.has(version)) versioned.version = clientVersions.get(version)
      }

      shiftLines(message, -PROOF_START_LINE);
      if (serverDocUri !== undefined) replaceUri(message, serverDocUri)

      // Disable range semantic tokens because they are difficult to shift
      if ((message as any)?.result?.capabilities?.semanticTokensProvider?.range) {
        (message as any).result.capabilities.semanticTokensProvider.range = false
      }

      // Shift semantic tokens (https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_semanticTokens)
      if (semanticTokenRequestIds.delete((message as any)?.id) && Array.isArray((message as any).result?.data)) {
        const data : number[] = (message as any).result.data
        let i = 0
        let newData = []
        let line = 0
        // Search for semantic tokens at or after PROOF_START_LINE
        while (i < data.length) {
          line += data[i] // line info is a delta
          if (line >= PROOF_START_LINE) {
            // Relevant tokens start here. Copy them.
            newData = data.slice(i);
            // Adjust the first line number to be relative to the proof
            newData[0] = line - PROOF_START_LINE;
            break;
          }
          i += 5 // Line info is on every fifth entry
        }
        (message as any).result.data = newData
      }

      return message
    }

    /** Sending messages from the server to the client */
    serverConnection.reader.listen((message: any) => {
      let out: object | undefined
      try {
        out = fromServer(message)
      } catch (error) {
        console.error(`[${new Date()}] Failed to translate a message from Lean:`, error, JSON.stringify(message).slice(0, 500))
        out = message
      }
      if (out !== undefined) socketConnection.writer.write(out as any)
    });
  }

  getGameDir(owner: string, repo: string) {
    // Plain names only: they become paths.
    const validName = (name: string) => /^[A-Za-z0-9_.-]+$/.test(name) && name !== '.' && name !== '..'
    if (!validName(owner) || !validName(repo)) {
      console.error(`[${new Date()}] Invalid game name: ${owner}/${repo}`);
      return "";
    }
    owner = owner.toLowerCase();
    if (owner == 'local' && !isDevelopment) {
      console.error(`[${new Date()}] No local games in production mode.`);
      return "";
    }

    let game_dir: string
    if(owner == 'local') {
      game_dir = path.join(this.dir, '..', '..', '..', '..', repo)
    } else if (owner == 'test') {
      game_dir = path.join(this.dir, '..', '..', '..', 'cypress', repo)
      console.debug(game_dir)
    } else {
      const gamesPath = path.join(this.dir, '..', '..', '..', 'games');
      if (!fs.existsSync(gamesPath)) {
        console.error(`[${new Date()}] Did not find the following folder: ${gamesPath}`);
        console.error(`[${new Date()}] Did you already import any games?`);
        return "";
      }
      game_dir = path.join(gamesPath, `${owner}`, `${repo.toLowerCase()}`);
    }

    if (!fs.existsSync(game_dir)) {
      console.error(`[${new Date()}] Game '${game_dir}' does not exist!`);
      return "";
    }

    let game_json: string = path.join(game_dir, ".lake", "gamedata", "game.json")

    if (!fs.existsSync(game_json)) {
      console.error(`[${new Date()}] game.json file does not exist for ${owner}/${repo}!`);
      return "";
    }

    return game_dir;
  }

  getTagString(tag: Tag) {
    return `g/${tag.owner.toLowerCase()}/${tag.repo.toLowerCase()}`;
  }
}
