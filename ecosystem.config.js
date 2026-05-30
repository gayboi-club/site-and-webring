module.exports = {
  apps: [{
    name: 'gayboi.club',
    script: './server.js',
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 2999
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_restarts: 10,
    restart_delay: 2000
  }]
};
