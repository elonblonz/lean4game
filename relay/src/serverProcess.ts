import * as cp from 'child_process';
import { ChildProcess } from 'child_process';
import { IncomingMessage } from 'http';
import * as jsonrpcserver from 'vscode-ws-jsonrpc/server';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

type Tag = { owner: string; repo: string; };
export type GameSession = {
  process: ChildProcess,
  game: string,
  gameDir: string,
  usesCustomLeanServer: boolean
}
const environment = process.env.NODE_ENV;
const isDevelopment = environment === 'development';
const noBwrap = process.env.NO_BWRAP == "true"

export class GameManager {
  queueLength: {}
  queue: {}
  urlRegEx: RegExp
  dir: string

  constructor(directory: string) {
    /**
     * Add a game here if the server should keep a queue of pre-loaded games ready at all times.
     *
     * IMPORTANT! Tags here need to be lower case!
    */
    this.queueLength = {
      "g/hhu-adam/robo": 2,
      "g/leanprover-community/nng4": 5,
      "g/djvelleman/stg4": 2,
      "g/trequetrum/lean4game-logic": 2,
    };
    /** We keep queues of started Lean Server processes to be ready when a user arrives */
    this.queue = {};
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

    if (!this.queue[tag] || this.queue[tag].length == 0) {
      ps = this.createGameProcess(reResTag.owner, reResTag.repo, customLeanServer);
      // TODO (Matvey): extract further information from `req`, for example browser language.
      console.log(`[${new Date()}] Socket opened by ${ip} on ${game}`);
    } else {
      console.info('Got process from the queue');
      ps = this.queue[tag].shift(); // Pick the first Lean process; it's likely to be ready immediately
      this.fillQueue(reResTag);
    }

    if (ps == null) {
      console.error(`[${new Date()}]server process is undefined/null`);
      return;
    }

    const gameDir = this.getGameDir(reResTag.owner, reResTag.repo)

    return {process: ps, game: game, gameDir: gameDir, usesCustomLeanServer: customLeanServer !== null }
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
    while (this.queue[tagString].length < this.queueLength[tagString]) {
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
    onLevelOpened?: () => void
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
    let difficulty: number
    let inventory: string[]
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

    /* The client has one document per level (`file:///<world>/<level>.lean`, see `level.tsx`),
       and keeps the ones it has visited open. Lean gets a single document, `Metadata.lean`
       with the level's header in front of the proof, so only one level is open in Lean at a
       time. We keep the text of every level the client has open; when the client works on
       another level, we close the current one in Lean and open the other one in full. */
    const clientDocs = new Map<string, { text: string, version: number }>()
    /** The client URI of the level that is open in Lean. */
    let activeUri: string | undefined
    /** The client URI that messages from Lean are about (the last level opened in Lean). */
    let serverDocUri: string | undefined

    /** Apply LSP content changes (positions in UTF-16 code units, like JS strings) to `text`. */
    const applyChanges = (text: string, changes: any[]) => {
      for (const change of changes) {
        if (!change.range) { text = change.text; continue }
        const offset = (pos: { line: number, character: number }) => {
          let i = 0
          for (let l = 0; l < pos.line; l++) {
            const nl = text.indexOf('\n', i)
            if (nl < 0) return text.length
            i = nl + 1
          }
          return Math.min(i + pos.character, text.length)
        }
        text = text.slice(0, offset(change.range.start)) + change.text + text.slice(offset(change.range.end))
      }
      return text
    }

    /** The `didOpen` that opens the client's level `uri` in Lean, or `undefined` if the level doesn't exist. */
    const openInServer = (uri: string): object | undefined => {
      const doc = clientDocs.get(uri)!
      const pathParts = path.parse(new URL(uri).pathname)
      worldId = path.basename(pathParts.dir)
      levelId = pathParts.name
      const levelDataPath = path.join(gameDir, '.lake', 'gamedata', `level__${worldId}__${levelId}.json`)
      if (!fs.existsSync(levelDataPath)) {
        console.error(`[${new Date()}] Missing level data: ${levelDataPath}`)
        return undefined
      }
      const levelData = JSON.parse(fs.readFileSync(levelDataPath, 'utf8'))
      onLevelOpened?.()

      if (difficulty === undefined || inventory === undefined) {
        console.error("Did not receive difficulty/inventory from client!")
        difficulty = 1
        inventory = []
      }
      // Note: `LevelScope` and `Runner` have to stay on the same line as each other so that
      // the proof still starts on line `PROOF_START_LINE`.
      const levelIdArgs =
        `${JSON.stringify(gameData.name)} ${JSON.stringify(worldId)} ${levelId} `
      const text =
        `import ${levelData.module} import GameServer.Runner \n` +
        (usesLevelScope ? `LevelScope ${levelIdArgs}` : ``) +
        `Runner ` + levelIdArgs +
        `(difficulty := ${difficulty}) ` +
        `(inventory := [${inventory.map(s => JSON.stringify(s)).join(',')}]) ` +
        `:= by\n${doc.text}\n`
      serverDocUri = uri
      return { jsonrpc: "2.0", method: "textDocument/didOpen",
        params: { textDocument: { uri: metadataUri, languageId: "lean4", version: doc.version, text } } }
    }

    /** Make `uri` the level that is open in Lean; returns the messages Lean needs for that. */
    const activate = (uri: string): object[] => {
      const out: object[] = []
      if (activeUri !== undefined) {
        out.push({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: metadataUri } } })
        activeUri = undefined
      }
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
        difficulty = message.params.initializationOptions.difficulty
        inventory = message.params.initializationOptions.inventory
        // We abuse the rootUri field to pass the game name to the server
        message.params.rootUri = gameData.name
        return [message]
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
        doc.text = applyChanges(doc.text, params.contentChanges)
        doc.version = params.textDocument.version
        if (uri !== activeUri) return activate(uri!)  // sends the whole new text
      } else if (message.method === "textDocument/didClose") {
        clientDocs.delete(uri!)
        if (uri !== activeUri) return []
        activeUri = undefined
      } else if (message.method === "$/lean/rpc/connect" && uri !== undefined && uri !== activeUri) {
        // The client starts working on a level it opened before, without changing it.
        if (!clientDocs.has(uri)) { replyError(message, -32801, `Unknown document ${uri}`); return [] }
        const out = activate(uri)
        if (uri !== activeUri) { replyError(message, -32801, `Cannot open level ${uri}`); return [] }
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

      for (const out of fromClient(message)) {
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


    /** Sending messages from the server to the client */
    serverConnection.forward(socketConnection, message => {
      if ((message as any)?.error) {
        console.error(`[${new Date()}] SERVER->CLIENT error payload: ${JSON.stringify((message as any).error)}`)
      }

      // Print the message as the server sends it
      if (isDevelopment) { console.log(`SERVER: ${JSON.stringify(message)}`); }

      // backwards compatibility for versions ≤ v4.7.0
      if (usesCustomLeanServer) return message

      shiftLines(message, -PROOF_START_LINE);
      if (serverDocUri !== undefined) replaceUri(message, serverDocUri)

      // Disable range semantic tokens because they are difficult to shift
      if ((message as any)?.result?.capabilities?.semanticTokensProvider?.range) {
        (message as any).result.capabilities.semanticTokensProvider.range = false
      }

      // Shift semantic tokens (https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_semanticTokens)
      if (semanticTokenRequestIds.delete((message as any)?.id)) {
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
    });
  }

  getGameDir(owner: string, repo: string) {
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
