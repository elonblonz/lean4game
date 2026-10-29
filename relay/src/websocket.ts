import anonymize from 'ip-anonymize';
import * as jsonrpcserver from 'vscode-ws-jsonrpc/server';
import { IWebSocket, WebSocketMessageReader, WebSocketMessageWriter } from 'vscode-ws-jsonrpc';
import { WebSocket, WebSocketServer } from 'ws';
import { ChildProcess } from 'child_process';
import { GameManager, GameSession } from './serverProcess.js'
import { IncomingMessage } from 'http';
import { randomUUID, UUID } from 'crypto';
import { gameActivityStore } from './services/GameActivityStore.js';

interface Player {
  id: UUID,
  currentGame: string
  anonIP: string
  lang: string
  process: ChildProcess
}

/** Optional limits on Lean sessions (each one needs a Lean server, about 2 GB of memory). */
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS ?? '') || 0           // 0: no limit
const MAX_SESSIONS_PER_IP = parseInt(process.env.MAX_SESSIONS_PER_IP ?? '') || 0
/** Close a session after this many minutes without a message from the client (0: never). */
const IDLE_TIMEOUT_MIN = parseInt(process.env.IDLE_TIMEOUT_MIN ?? '') || 30

/** The client's IP address. `X-Forwarded-For` is only trusted behind a proxy (`TRUST_PROXY`). */
export function clientIp(req: IncomingMessage): string | undefined {
  const forwarded = req.headers['x-forwarded-for']
  if (process.env.TRUST_PROXY && typeof forwarded === 'string' && forwarded) {
    // The proxy appends the address it saw; the first entry is the client's.
    return forwarded.split(',')[0].trim()
  }
  return req.socket.remoteAddress
}

interface PlayerMeasurement {
  date: Array<Date>
  anon_Ip: Array<string>
  game: Array<string>
  lang: Array<string>
}

export class GameSessionsObserver {
  gameManager: GameManager
  wss: WebSocketServer
  players: Map<WebSocket, Player>
  socketCounter: number

  constructor(gameManager: GameManager, wss: WebSocketServer) {
    this.gameManager = gameManager
    this.wss = wss
    this.players = new Map<WebSocket, Player>()
  };

  /**
   * Return information about all current open game sessions on the server.
   * @returns A PlayerMeasurement object containing all current open game sessions
   */
  getAllConnectedPlayers(): PlayerMeasurement {
    const webSockets: Array<WebSocket> = this.getAllOpenWebSockets()
    const timestamp = new Date()

    let measurement: PlayerMeasurement = {
      date: new Array<Date>(),
      anon_Ip: new Array<string>(),
      game: new Array<string>(),
      lang: new Array<string>()
    }

    /**
     * Iterate over every open websocket of the server
     * while checking if the socket corresponds to player.
     * If the socket is corresponding to a player add the
     * player's information to the PlayerMeasuremnt intance.
     */
    webSockets.forEach( (ws) => {
      if(this.players.get(ws) !== undefined){
        measurement.date.push(timestamp)
        measurement.anon_Ip.push(this.players.get(ws).anonIP)
        measurement.game.push(this.players.get(ws).currentGame)
        measurement.lang.push( this.players.get(ws).lang)
      }
    })

    return measurement
  }

  /**
   * Start a game process on the server and add the player to the list
   * of currently active players until the player leaves the game.
   * @param ws
   * @param req
   * @param wss
   */
  startObservedGame(ws: WebSocket, req: IncomingMessage) {
    const ip = anonymize(clientIp(req) ?? '') || 'unknown'

    const sessions = [...this.players.values()]
    if (MAX_SESSIONS && sessions.length >= MAX_SESSIONS) {
      console.warn(`[${new Date()}] Refused a connection from ${ip}: ${sessions.length} sessions are open`)
      ws.close(1013, 'The server is busy, please try again later.')
      return
    }
    if (MAX_SESSIONS_PER_IP && sessions.filter(p => p.anonIP === ip).length >= MAX_SESSIONS_PER_IP) {
      console.warn(`[${new Date()}] Refused a connection from ${ip}: too many sessions from this address`)
      ws.close(1013, 'Too many open games from your address.')
      return
    }

    let gameSession: GameSession | undefined = this.gameManager.startGame(req, ip)
    if (!gameSession) {
      // Unknown game, or the Lean server could not be started (logged in `startGame`).
      ws.close(1008, 'Unknown game')
      return
    }
    let ps = gameSession.process
    let game = gameSession.game
    let gameDir = gameSession.gameDir

    const langRegex: RegExp = /^[a-zA-Z-]+(?=,)/
    let lang = "en-US"

    if(langRegex.exec(req.headers['accept-language']) !== null) {
      lang = langRegex.exec(req.headers['accept-language'])[0]
    }

    this.addPlayerConnection(ws, game, ip, ps, lang);

    //this.socketCounter++

    const socket: IWebSocket = {
      onMessage: (cb) => { ws.on("message", cb); },
      onError: (cb) => { ws.on("error", cb); },
      onClose: (cb) => { ws.on("close", cb); },
      send: (data) => { ws.send(data); },
      dispose: () => { }
    }

    const reader = new WebSocketMessageReader(socket);
    const writer = new WebSocketMessageWriter(socket);
    const socketConnection = jsonrpcserver.createConnection(reader, writer, () => {
      ws.close()
    });
    // A spare that was warmed up (see `GameManager.warmUp`) is connected already.
    const serverConnection = gameSession.warmUp?.connection ??
      jsonrpcserver.createProcessStreamConnection(this.players.get(ws).process);

    let activityRecorded = false
    this.gameManager.messageTranslation(
      socketConnection, serverConnection, gameDir, gameSession.usesCustomLeanServer,
      () => {
        if (activityRecorded) return
        activityRecorded = true
        const [owner, repo] = game.split('/', 2)
        gameActivityStore.recordPlay(owner, repo)
          .then(() => console.info("Recorded play activity for " + game))
          .catch(error => console.error("Failed to record play activity for " + game + ": " + error))
      },
      { game, startedAt: gameSession.startedAt, fromPool: gameSession.fromPool, warmUp: gameSession.warmUp }
    )

    socketConnection.onClose(() => {
      serverConnection.dispose()
    })
    serverConnection.onClose(() => {
      socketConnection.dispose()
    })

    //console.log(`[${new Date()}] Number of open sockets - ${this.socketCounter}`);
    //console.log(`[${new Date()}] Free RAM - ${Math.round(os.freemem() / 1024 / 1024)} / ${Math.round(os.totalmem() / 1024 / 1024)} MB`);

    // Free the Lean server of a session that has been left alone.
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    const resetIdleTimer = () => {
      if (!IDLE_TIMEOUT_MIN) return
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        console.log(`[${new Date()}] Closing idle session of ${ip} on ${game}`)
        ws.close(1000, 'Closed after a period of inactivity')
      }, IDLE_TIMEOUT_MIN * 60 * 1000)
    }
    resetIdleTimer()
    ws.on('message', resetIdleTimer)

    ws.on('close', () => {
      clearTimeout(idleTimer)
      const player = this.players.get(ws)
      this.players.delete(ws)
      //this.socketCounter--
      console.log(`[${new Date()}] Socket closed by ${ip} on ${player?.currentGame}`)
    })
  }

  /**
   * Return all open WebSocket connections to the server
   * @returns Array of WebSocket objects
   */
  private getAllOpenWebSockets() {
    return Array.from(this.wss.clients);
  }

  private addPlayerConnection(ws: WebSocket, game: string, ip: string, ps: ChildProcess, lang: string) {
    let playerId: UUID = randomUUID();
    this.players.set(ws, {
      id: playerId,
      currentGame: game,
      anonIP: ip,
      lang: lang,
      process: ps
    }
    );
  }
}
