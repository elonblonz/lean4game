// This is a configuration file for pm2, a production process manager for nodejs
module.exports = {
  apps : [{
    name   : "lean4game",
    script : "relay/dist/src/index.js",
    env: {
      LEAN4GAME_GITHUB_USER: "",
      LEAN4GAME_GITHUB_TOKEN: "",
      // Keep at least this much disk space free when importing games.
      RESERVED_DISC_SPACE_MB: 1024,
      // Imports run only with `?token=<IMPORT_TOKEN>`; leave empty to disable them.
      IMPORT_TOKEN: "",
      ISSUE_CONTACT: "",
      NODE_ENV: "production",
      PORT: 8002,
      API_PORT: 8010,
      CPU_SCRIPT: ""
    },
  }]
}
