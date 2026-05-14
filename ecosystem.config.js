module.exports = {
  apps: [{
    name: 'game-manager',
    script: '/opt/game-manager/server/dist/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DATA_DIR: '/opt/game-manager/data',
      LOG_DIR: '/var/log/game-manager',
      REPOS_ROOT: '/opt/repos',
      WWW_ROOT: '/opt/www',
    },
    error_file: '/var/log/game-manager/pm2-error.log',
    out_file: '/var/log/game-manager/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    restart_delay: 3000,
    max_restarts: 10,
  }]
}
