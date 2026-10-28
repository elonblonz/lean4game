import fs from 'fs';
import got from 'got'
import path from 'path';
import { safeImport } from './middleware.js'
import { Octokit } from 'octokit';
import { spawn } from 'child_process'
import { fileURLToPath } from 'url';
import { gameActivityStore } from './services/GameActivityStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN = process.env.LEAN4GAME_GITHUB_TOKEN
const USERNAME = process.env.LEAN4GAME_GITHUB_USER
const CONTACT = process.env.ISSUE_CONTACT
/** Imports download and install games, so they need this token (`?token=...`); unset, they are off. */
const IMPORT_TOKEN = process.env.IMPORT_TOKEN

/** The games folder, and the folder downloads are unpacked in. */
const gamesPath = path.join(__dirname, "..", "..", "..", "games")
const gamesTmpPath = path.join(gamesPath, "tmp")

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

const octokit = new Octokit({
  auth: TOKEN
})

const progress = {}

async function runProcess(id, cmd, args, cwd) {
  return new Promise<void>((resolve, reject) => {
    const ls = spawn(cmd, args, {cwd});

    ls.stdout.on('data', (data) => {
      progress[id].output += data.toString()
    });

    ls.stderr.on('data', (data) => {
      try {
        if (args[0].includes("unpack.sh")){
          throw new Error(".zip file of artifact could not be fetched. Make sure it exists and is not expired. \n")
        } else {
          progress[id].output += data.toString()
        }
      } catch(e){
        progress[id].output += `Error: ${e.toString()}\n${e.stack}`
      }

    });

    ls.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(cmd + " exited with code " + code))
    });
  })
}

async function download(id, url, dest) {
  let numProgressChars = 0
  return new Promise<void>((resolve, reject) => {
    // The options argument is optional so you can omit it
    progress[id].output += "Progress: " + "[" + "_".repeat(50) + "]"
    got.stream.get(url, {
     headers: {
       'accept': 'application/vnd.github+json',
       'User-Agent': USERNAME,
       'X-GitHub-Api-Version': '2022-11-28',
       'Authorization': 'Bearer ' + TOKEN
     }
    })
    // choose latest artifact
    .on('downloadProgress', downloadProgress => {
      let step = Math.round((downloadProgress.percent * 100) / 2);
      if (step > numProgressChars && downloadProgress.transferred != 0) {
        progress[id].output = progress[id].output.replace(/\[[#_]*\]/, `[${'#'.repeat(numProgressChars) + "_".repeat(50 - numProgressChars)}] `)
        numProgressChars = step
      }
    })
    .on('error', function (err) {
      reject(err)
    })
    .on('end', function () {
      progress[id].output += "\n"
      resolve()
    })
    .pipe(fs.createWriteStream(dest));
  })
}

async function doImport (owner, repo, id) {
  progress[id].output += `Import starting in a few seconds...\n`
  await new Promise(resolve => setTimeout(resolve, 3000))
  let artifactId = null
  try {
    const artifacts = await octokit.request('GET /repos/{owner}/{repo}/actions/artifacts', {
      owner,
      repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
    const artifact = artifacts.data.artifacts
      .reduce((acc, cur) => acc.created_at < cur.created_at ? cur : acc)

    artifactId = artifact.id
    const url = artifact.archive_download_url
    const unpackingScript = path.join(__dirname, "..", "..", "scripts", "unpack.sh")
    const toolchainScript = path.join(__dirname, "..", "..", "scripts", "install_toolchain.sh")

    // Make sure the download folder exists
    if (!fs.existsSync(gamesPath)){
      fs.mkdirSync(gamesPath);
    }
    if (!fs.existsSync(gamesTmpPath)){
      fs.mkdirSync(gamesTmpPath);
    }
    progress[id].output += `Download from ${url}\n`
    await download(id, url, path.join(gamesTmpPath, `${owner.toLowerCase()}_${repo.toLowerCase()}_${artifactId}.zip`))
    progress[id].output += `Download finished.\n`

    // Unpack downloaded game
    await runProcess(id, "/bin/bash", [unpackingScript, gamesPath, artifactId, owner.toLowerCase(), repo.toLowerCase()], path.join(__dirname, "..", ".."))
    // Install necessary toolchain
    await runProcess(id, "/bin/bash", [toolchainScript, gamesPath, owner.toLowerCase(), repo.toLowerCase()], path.join(__dirname, "..", ".."))

    const gameJsonPath = path.join(
      gamesPath, owner.toLowerCase(), repo.toLowerCase(), ".lake", "gamedata", "game.json"
    )
    if (!fs.existsSync(gameJsonPath)) {
      throw new Error("Imported artifact does not contain " + gameJsonPath)
    }
    await gameActivityStore.recordImport(owner, repo)
    progress[id].output += `Activity registry updated.\n`


    // let manifest = fs.readFileSync(`tmp/artifact_${artifactId}_inner/manifest.json`);
    // manifest = JSON.parse(manifest);
    // if (manifest.length !== 1) {
    //   throw `Unexpected manifest: ${JSON.status(manifest)}`
    // }
    // manifest[0].RepoTags = [`g/${owner.toLowerCase()}/${repo.toLowerCase()}:latest`]
    // fs.writeFileSync(`tmp/artifact_${artifactId}_inner/manifest.json`, JSON.stringify(manifest));
    // await runProcess(id, "tar", ["-cvf", `../archive_${artifactId}.tar`, "."], `tmp/artifact_${artifactId}_inner/`)
    // // await runProcess(id, "docker", ["load", "-i", `tmp/archive_${artifactId}.tar`])



    progress[id].done = true
    progress[id].output += `Done!\n`
    progress[id].output += `Play the game at: {your website}/#/g/${owner}/${repo}\n`
  } catch (e) {
    progress[id].output += `Error: ${e.toString()}\n${e.stack}`
  } finally {
    // clean-up temp. files
    if (artifactId) {
      const name = `${owner.toLowerCase()}_${repo.toLowerCase()}_${artifactId}`
      fs.rmSync(path.join(gamesTmpPath, `${name}.zip`), {force: true, recursive: false});
      fs.rmSync(path.join(gamesTmpPath, name), {force: true, recursive: true});
    }
    progress[id].done = true
  }
  await new Promise(resolve => setTimeout(resolve, 10000))
}

export const importTrigger = (req, res) => {
  const owner = req.params.owner
  const repo = req.params.repo
  const id = req.params.owner + '/' + req.params.repo
  if (!IMPORT_TOKEN || req.query.token !== IMPORT_TOKEN) {
    res.status(403).send("Imports are disabled on this server, or the token is wrong.")
    return
  }
  if(!/^[\w.-]+\/[\w.-]+$/.test(id) || owner.startsWith('.') || repo.startsWith('.')) {
    res.status(400).send(`Invalid repo name ${escapeHtml(id)}`); return
  }

  if(!progress[id] || progress[id].done) {
    progress[id] = {output: "", done: false}
    safeImport(owner, repo, id, gamesPath, doImport)
    .catch((err: Error) => {
      console.error(`[${new Date()}] Import of ${id} failed: ${err.message}`)
      progress[id].output += `Import failed: ${err.message}\n` +
        (CONTACT ? `Please contact the server admins: ${CONTACT}\n` : '')
      progress[id].done = true
    })
  }

  res.redirect(`/import/status/${owner}/${repo}`)
}

export const importStatus = (req, res) => {
  const owner = req.params.owner
  const repo = req.params.repo
  const id = req.params.owner + '/' + req.params.repo
  res.send(`<html><head><meta http-equiv="refresh" content="5"></head><body><pre>${escapeHtml(progress[id]?.output ?? "Nothing here.")}</pre></body></html>`)
}
