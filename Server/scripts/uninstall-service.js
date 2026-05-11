const Service = require('node-windows').Service;
const path    = require('path');

const svc = new Service({
  name:   'OpenChat Server',
  script: path.join(__dirname, '..', 'server.js'),
});

svc.on('uninstall', () => console.log('Service removed.'));
svc.uninstall();