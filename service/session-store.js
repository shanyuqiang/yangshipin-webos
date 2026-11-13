'use strict';
var APP = 'com.shanyuqiang.yangshipin';
var KIND = APP + '.session:1';
var NAMES = ['ysp_openid', 'ysp_yspOpenid', 'strVideotoken', 'endtime', 'ysp_appid',
  'ysp_strAccesstoken', 'ysp_strRefreshtoken', 'ysp_strOpenid', 'ysp_currentLoginId',
  'uinfo_logintype', 'uinfo_refreshed', 'uinfo_expired_time', 'yspopenid', 'ysp_uinfo_pc'];

function checkedCookie(input) {
  if (!input || NAMES.indexOf(input.name) === -1 || typeof input.value !== 'string'
      || Buffer.byteLength(input.value, 'utf8') > 8192
      || !/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/.test(input.value)
      || (input.expiresAt !== null && (typeof input.expiresAt !== 'number' || !isFinite(input.expiresAt)))) {
    throw new Error('Invalid session cookie');
  }
  return { name: input.name, value: input.value, expiresAt: input.expiresAt };
}

function createSessionStore(service, options) {
  var now = options && options.now || Date.now;
  var timeoutMs = options && options.timeoutMs !== undefined ? options.timeoutMs : 8000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid storage timeout');
  var queue = Promise.resolve();
  var initialized = false;
  var record;
  var cookies = [];
  var generation = 0;
  var uncertainWrite;

  function call(method, payload, writeContext) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        initialized = false;
        if (writeContext) uncertainWrite = writeContext;
        finish(new Error('Session storage timeout'));
      }, timeoutMs);
      function finish(error, result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(result);
      }
      try {
        service.call('luna://com.palm.db/' + method, payload, function (message) {
          if (settled) return;
          if (!message || !message.payload || message.payload.returnValue !== true) finish(new Error('Session storage failed'));
          else finish(null, message.payload);
        });
      } catch (error) { finish(new Error('Session storage failed')); }
    });
  }

  function initialize() {
    if (initialized) return Promise.resolve();
    return call('putKind', { id: KIND, owner: APP + '.service', private: true })
      .then(function () { return call('find', { query: { from: KIND, limit: 2 } }); })
      .then(function (result) {
        if (!Array.isArray(result.results) || result.results.length > 1) throw new Error('Session storage failed');
        var saved = result.results[0] || { _kind: KIND, cookies: [] };
        if (!Array.isArray(saved.cookies)) throw new Error('Session storage failed');
        var savedGeneration = saved.generation === undefined ? 0 : saved.generation;
        if (!Number.isSafeInteger(savedGeneration) || savedGeneration < 0) throw new Error('Session storage failed');
        var restored = saved.cookies.map(checkedCookie).filter(function (cookie) {
          return cookie.value && cookie.expiresAt !== null && cookie.expiresAt > now();
        });
        var temporary = savedGeneration === generation && !(uncertainWrite && uncertainWrite.clear)
          ? cookies.filter(function (cookie) {
            return cookie.expiresAt === null && cookie.value
              && !(uncertainWrite && uncertainWrite.name === cookie.name)
              && !restored.some(function (savedCookie) { return savedCookie.name === cookie.name; });
          }).map(checkedCookie) : [];
        var recovered = restored.concat(temporary);
        if (Buffer.byteLength(JSON.stringify(recovered), 'utf8') > 65536) throw new Error('Session storage limit');
        record = saved;
        cookies = recovered;
        generation = savedGeneration;
        uncertainWrite = undefined;
        initialized = true;
      });
  }

  function enqueue(operation) {
    var result = queue.then(initialize).then(operation);
    queue = result.then(function () {}, function () {});
    return result;
  }

  function live() {
    return cookies.filter(function (cookie) { return cookie.value && (cookie.expiresAt === null || cookie.expiresAt > now()); });
  }

  function replace(next, nextGeneration, changedName) {
    if (Buffer.byteLength(JSON.stringify(next), 'utf8') > 65536) return Promise.reject(new Error('Session storage limit'));
    var persistent = next.filter(function (cookie) { return cookie.expiresAt !== null && cookie.expiresAt > now(); });
    if (generation === nextGeneration && JSON.stringify(record.cookies) === JSON.stringify(persistent)) {
      cookies = next;
      return Promise.resolve({ generation: generation });
    }
    var object = { _kind: KIND, cookies: persistent, generation: nextGeneration };
    if (record._id) { object._id = record._id; object._rev = record._rev; }
    var writeContext = { name: changedName, clear: nextGeneration !== generation };
    return call('put', { objects: [object] }, writeContext).then(function (result) {
      var updated = result.results && result.results[0];
      if (!updated || !updated.id || updated.rev === undefined) {
        initialized = false;
        uncertainWrite = writeContext;
        throw new Error('Session storage failed');
      }
      record = { _kind: KIND, _id: updated.id, _rev: updated.rev, cookies: persistent, generation: nextGeneration };
      cookies = next;
      generation = nextGeneration;
      return { generation: generation };
    });
  }

  return {
    load: function () {
      return enqueue(function () { return { cookies: live().map(checkedCookie), generation: generation }; });
    },
    save: function (input) {
      var cookie;
      var requestedGeneration;
      try {
        cookie = checkedCookie(input);
        requestedGeneration = input.generation;
        if (!Number.isSafeInteger(requestedGeneration) || requestedGeneration < 0) throw new Error('Invalid session generation');
      }
      catch (error) { return Promise.reject(error); }
      return enqueue(function () {
        if (requestedGeneration !== generation) throw new Error('Stale session generation');
        var remaining = live().filter(function (existing) { return existing.name !== cookie.name; });
        var keep = cookie.value && (cookie.expiresAt === null || cookie.expiresAt > now());
        return replace(keep ? remaining.concat([cookie]) : remaining, generation, cookie.name);
      });
    },
    clear: function () {
      return enqueue(function () {
        if (!Number.isSafeInteger(generation + 1)) throw new Error('Session storage limit');
        return replace([], generation + 1);
      });
    }
  };
}

function registerSessionMethods(service, store) {
  [['loadSession', 'load'], ['saveSessionCookie', 'save'], ['clearSession', 'clear']].forEach(function (entry) {
    service.register(entry[0], function (message) {
      if (message.sender !== APP) { message.respond({ returnValue: false, errorText: 'Session access denied' }); return; }
      store[entry[1]](message.payload).then(function (result) {
        message.respond(Object.assign({ returnValue: true }, result));
      }, function () { message.respond({ returnValue: false, errorText: 'Session storage operation failed' }); });
    });
  });
}

module.exports = { createSessionStore: createSessionStore, registerSessionMethods: registerSessionMethods };
