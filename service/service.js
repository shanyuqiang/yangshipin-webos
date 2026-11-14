'use strict';
var Service = require('webos-service');
var createServer = require('./core').createServer;
var sessions = require('./session-store');
var service = new Service('com.shanyuqiang.yangshipin.service');
sessions.registerSessionMethods(service, sessions.createSessionStore(service));
var server = createServer();
var ready = false;
var failed = false;
var waiting = [];
var keepAlive;

function respond(message) {
  if (failed) message.respond({ returnValue: false, errorText: 'Local playback experiment could not start' });
  else message.respond({ returnValue: true, url: 'http://127.0.0.1:' + server.address().port + '/restore' });
}
function flush() {
  var messages = waiting;
  waiting = [];
  messages.forEach(respond);
}
server.on('error', function () { failed = true; flush(); });
server.listen(0, '127.0.0.1', function () { ready = true; flush(); });
service.register('start', function (message) {
  if (ready || failed) respond(message);
  else waiting.push(message);
});
service.activityManager.create('keepAlive', function (activity) { keepAlive = activity; });
