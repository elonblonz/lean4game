import { execFile } from 'child_process'
import fs from 'fs'
import anonymize from 'ip-anonymize'
import { Octokit } from 'octokit'
import path from 'path'
import { resolve } from 'path'
import process from 'process'
import { AccessLogger, Connection } from './services/AccessLogger.js'
import { Request, Response } from 'express'

const TOKEN = process.env.LEAN4GAME_GITHUB_TOKEN
/** Imports are refused if they would leave less free disk space than this (in MB). */
const RESERVED_DISK_SPACE_MB: number = parseInt(process.env.RESERVED_DISC_SPACE_MB ?? '') || 1024
const octokit = new Octokit({auth: TOKEN})
const accessLogger = new AccessLogger()

/** The free disk space (in MB) on the file system that contains `dir`. */
function freeDiskSpaceMB(dir: string) {
  return new Promise<number>((resolve, reject) => {
    execFile('df', ['-BM', '--output=avail', dir], (error, stdout) => {
      if (error) {
        return reject(new Error(`Error checking disk space: ${error.message}`))
      }
      const free = parseInt(stdout.toString().trim().split('\n').pop()?.replace('M', '') ?? '')
      if (isNaN(free)) {
        return reject(new Error(`Invalid disk information output: ${stdout}`))
      }
      resolve(free)
    })
  })
}

/** The size (in bytes) of the newest build artifact of a GitHub repository. */
async function latestArtifactSize(owner: string, repo: string): Promise<number> {
  const { data } = await octokit.request('GET /repos/{owner}/{repo}/actions/artifacts', {
    owner,
    repo,
    headers: {
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
  if (!data.artifacts.length) {
    throw new Error(`${owner}/${repo} has no build artifacts.`)
  }
  return data.artifacts.reduce((acc, cur) => acc.created_at < cur.created_at ? cur : acc).size_in_bytes
}

/** Import a game with `importFunc`, unless its artifact would leave too little free disk space. */
export async function safeImport(owner: string, repo: string, id: string, gamesPath: string,
    importFunc: (owner: string, repo: string, id: string) => Promise<void>) {
  fs.mkdirSync(gamesPath, { recursive: true })
  const free = await freeDiskSpaceMB(gamesPath)
  const artifactMB = Math.ceil(await latestArtifactSize(owner, repo) / Math.pow(1024, 2))
  if (free - artifactMB < RESERVED_DISK_SPACE_MB) {
    throw new Error(`Importing ${owner}/${repo} (${artifactMB} MB) would leave less than ` +
      `${RESERVED_DISK_SPACE_MB} MB of free disk space (${free} MB free).`)
  }
  console.log(`[${new Date()}] Importing ${owner}/${repo} (${artifactMB} MB, ${free} MB free).`)
  await importFunc(owner, repo, id)
}

export function logConnection(req: Request, res: Response): void {
  accessLogger.logConnections(req, res)
}

export function getActiveConnections(): Connection[] {
  return accessLogger.getActiveConnections()
}

export function logGameAccess(req) {
  const owner = req.params.owner;
  const repo = req.params.repo;
  const lang = req.params.lang;

  const anon_ip = anonymize(req.headers['x-forwarded-for'] || req.socket.remoteAddress);
  const log = path.join(process.cwd(), 'logs', 'game-access.log');
  const header = "date;anon-ip;game;lang\n";
  const data = `${new Date()};${anon_ip};${owner}/${repo};${lang}\n`;

  fs.mkdir(path.join(process.cwd(), 'logs'), { recursive: true }, (err) => {
    if (err) console.log("Failed to create logs directory!");
    else {
      // 'ax' fails if the file already exists: https://nodejs.org/api/fs.html#file-system-flags
      fs.writeFile(log, header.concat(data), { flag: 'ax' }, (file_exists) => {
        if (file_exists) {
          fs.appendFile(log, data, (err) => {
            if (err) console.log(`Failed to append to log: ${err}`);
          });
        }
      });
    }
  });

  console.log(`[${new Date()}] ${anon_ip} requested translation for ${owner}/${repo} in ${lang}`);
  return { owner, repo, lang };
}
