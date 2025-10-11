module.exports = {
  apps: [
    {
      name: 'quantum-management-mcp',
      script: './packages/management/dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: 'management-logs-mcp',
      script: './packages/management-logs/dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
  ],
};