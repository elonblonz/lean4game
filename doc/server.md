
# Notes for Server maintainer

In order to set up the server to allow imports, one needs to create a
[Github Access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens). A fine-grained access token with only reading rights for public
repos will suffice.

You need to set the environment variables `LEAN4GAME_GITHUB_USER` and `LEAN4GAME_GITHUB_TOKEN`
with your user name and access token. For example, you can set these in `ecosystem.config.cjs` if
you're using `pm2`

Imports download and install a game, so they are disabled unless you also set `IMPORT_TOKEN`.
Then you (or a workflow that knows the token) can call:

> https://{website}/import/trigger/{owner}/{repo}?token={IMPORT_TOKEN}

where you replace:
- website: The website your server runs on, e.g. `localhost:3000`
- owner, repo: The owner and repository name of the game you want to load from github.

 will trigger to download the latest version of your game from github onto your server.
 Once this import reports "Done", you should be able to play your game under:

> https://{website}/#/g/{owner}/{repo}

## Limits and other settings

Environment variables of the relay (`relay/src`):

- `MAX_SESSIONS`: the most game sessions at the same time (default: no limit). Each session runs
  its own Lean server, which needs about 2 GB of memory; new connections beyond the limit are
  refused with "The server is busy".
- `MAX_SESSIONS_PER_IP`: the most sessions from one (anonymized) address (default: no limit).
  Note that a school or office behind one router shares an address.
- `IDLE_TIMEOUT_MIN`: close a session after this many minutes without a message from the
  player (default: 30; `0` keeps sessions open).
- `TRUST_PROXY`: set it when the relay runs behind a reverse proxy, so that the client address
  is taken from `X-Forwarded-For`. Without a proxy, leave it unset: the header can be faked.
- `API_PORT`: the port of the statistics API. It only listens on `127.0.0.1`, and only if set.
- `RESERVED_DISC_SPACE_MB`: imports are refused if they would leave less free disk space than
  this (default: 1024).
- `LEAN_POOL_SIZE`: how many spare Lean servers to keep started per game, so that a new player
  does not wait for one to start (default: 1 in development, 0 in production; `0` disables the
  pool). A spare saves the start of the server (about a second); for games with
  `LEAN4GAME_STABLE_HEADER` it also imports the game in advance, so the player's first level
  starts as fast as a level switch. Spares need memory too (about 1 GB each, or as much as an
  open level once they have imported the game) and do not count towards `MAX_SESSIONS`. They
  are stopped when the relay stops.
- `LEAN_POOL_GAMES`: the games to keep spares for, comma separated as `owner/repo` (default: in
  development the local games next to `lean4game`, played as `local/<folder>`; in production
  a few popular games).
- `LEAN4GAME_STABLE_HEADER`: the games for which Lean keeps its imports when the player
  switches levels, as a comma separated list of `owner/repo` (e.g. `local/STG4`), or `true` for
  all games (default: none). Otherwise each level is opened with
  `import <the level's module>`, so every switch imports the game again (about 2-3 s for a
  game on Mathlib). For the listed games every level imports the whole game (its root module,
  e.g. `Game`), and switching levels only replaces the text after the imports (about 0.2 s).
  The catch: a level also sees everything later levels define, so only list games for which
  that is harmless. Definitions are not locked by the inventory, so a level can become
  trivial: in Reintroduction to Proofs, `exact Function.swap` (defined in a later level)
  solves the level that asks you to define it. A theorem proven in a later level is reported
  as locked under the regular and strict rules (instead of unknown), but can be used under
  relaxed rules; a name can resolve differently if a later level defines it; and instances,
  `simp` lemmas and notation declared in a later level apply everywhere. Needs a `GameServer`
  with `LevelScope` (v4.31.0 or later); older ones always reopen the level.

Lean runs the players' proofs, and Lean code can run programs. In production, Lean runs inside
`bubblewrap` (`relay/scripts/bubblewrap.sh`: no network, read-only game files, a CPU time limit).
Never run a public server in development mode (`NODE_ENV=development`), which runs Lean without
the sandbox. The sandbox does not limit memory: run the server in a container or cgroup with a
memory limit (for example `docker run --memory=...`, or `systemd-run -p MemoryMax=...`).

## Data management
Everything downloaded remains in the folder `lean4game/games`.
The subfolder `tmp` contains downloaded artifacts and can be deleted without loss.
The other folders should only contain the built lean-games, sorted by owner and repo.

## Server capacity

If you would like to display the server capacity on the landing page,
you can create a file `lean4game/games/stats.csv` of the following form:

```
CPU,MEM
0.1,0.8
```

These numbers will be displayed on the landing page ("CPU: 10 % used" and "RAM: 80 % used").

If you only want one of the numbers, replace the number you don't want with `nan` (or anything
else which does not parse as number).

If you don't want to show either, simply do not create `stats.csv`

Use your own script or cronjob to update the CSV file as desired.
