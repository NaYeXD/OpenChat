const Service = require('node-windows').Service;
const path    = require('path');

const svc = new Service({
  name:        'OpenChat Server',
  description: 'OpenChat voice & text chat server',
  script:      path.join(__dirname, '..', 'server.js'),
  nodeOptions: [],
  env: [{ name: 'NODE_ENV', value: 'production' }],
});

svc.on('install', () => {
  console.log('Service installed. Starting...');
  svc.start();
});

svc.on('error', (err) => console.error('Service error:', err));

svc.install();