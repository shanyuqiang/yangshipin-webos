const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
const files = {
  '/tv-shell': ['tests/e2e/tv-shell.html', 'text/html'],
  '/tv-shell.js': ['service/tv-shell.js', 'application/javascript'],
  '/tv-shell.css': ['service/tv-shell.css', 'text/css'],
  '/fixture': ['tests/e2e/fixture.html', 'text/html'],
  '/readability': ['tests/e2e/readability.html', 'text/html'],
  '/input': ['tests/e2e/input.html', 'text/html'],
  '/login': ['tests/e2e/login.html', 'text/html'],
  '/adapter.js': ['service/adapter.js', 'application/javascript'],
  '/bootstrap': ['app/index.html', 'text/html'],
  '/start.js': ['app/start.js', 'application/javascript']
};
http.createServer((req, res) => {
  const target = files[req.url];
  if (!target) { res.writeHead(404); res.end(); return; }
  fs.readFile(path.join(root, target[0]), (error, data) => {
    res.writeHead(error ? 500 : 200, {'Content-Type': target[1]});
    res.end(error ? 'Fixture unavailable' : data);
  });
}).listen(41973, '127.0.0.1');

const {EventEmitter} = require('node:events');
const {createServer} = require('../../service/core');
createServer({request() {
  const request = new EventEmitter();
  request.setTimeout = () => request;
  request.destroy = () => {};
  request.end = () => setImmediate(() => request.emit('error', new Error('fixture upstream offline')));
  return request;
}}).listen(41974, '127.0.0.1');
