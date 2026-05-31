module.exports = {
  apps: [
    {
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
    },
    {
      name: 'gayboi-bot',
      script: './bot.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
        DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
        DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID
      },
      error_file: './logs/bot-error.log',
      out_file: './logs/bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_restarts: 10,
      restart_delay: 5000
    }
  ]
};
