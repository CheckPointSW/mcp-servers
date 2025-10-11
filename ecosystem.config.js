// ecosystem.config.js

// Determine which service to run based on the SERVICE_PATH environment variable
const servicePath = process.env.SERVICE_PATH || 'packages/management';
const serviceName = servicePath.split('/').pop();

// Determine the number of instances to launch.
// Defaults to 1. Use 'max' to use all available CPUs.
const instances = process.env.INSTANCES || 1;

module.exports = {
  apps: [
    {
      name: `${serviceName}-mcp`,
      script: `./${servicePath}/dist/index.js`,
      instances: instances,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};