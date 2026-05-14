module.exports = {
  apps: [
    {
      name: 'outreach-backend',
      script: 'server.js',
      cwd: 'C:/Users/it/contentcrafterzz-outreach-os/backend',
      restart_delay: 2000,
      max_restarts: 20,
      env: { NODE_ENV: 'production', PORT: 3001 },
    },
    {
      name: 'outreach-frontend',
      script: 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js',
      args: 'run dev',
      cwd: 'C:/Users/it/contentcrafterzz-outreach-os/frontend',
      restart_delay: 3000,
      max_restarts: 20,
    },
  ],
};
