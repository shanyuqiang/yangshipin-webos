(function () {
  'use strict';
  if (window.__yspTvPlayerContext) return;
  window.__yspTvPlayerContext = true;
  var upstream = new URL('https://www.yangshipin.cn/tv/home');
  var localOrigin = window.location.origin;
  var active;
  var currentFactory;
  var factories = new WeakMap();
  var wrappedFactories = new WeakSet();
  var context = new Proxy(window, {
    get: function (target, key) {
      if (key === 'location') return upstream;
      if (key === 'origin') return upstream.origin;
      return Reflect.get(target, key, target);
    }
  });

  function adapt(factory) {
    if (typeof factory !== 'function' || wrappedFactories.has(factory)) return factory;
    if (factories.has(factory)) return factories.get(factory);
    try {
      var script = new URL(document.currentScript.src);
      if (script.origin !== 'https://sapi.yangshipin.cn' ||
          !/^\/assets\/\d{4}\/wasm\/cmg\.worker\.js$/.test(script.pathname)) throw new Error('Unexpected player source');
      // shortcut: the official factory captures _scriptDir; revalidate this boundary when its SDK changes.
      var source = Function.prototype.toString.call(factory);
      var adapted = new Function('window', 'self', 'globalThis', 'location', '_scriptDir',
        'return (' + source + ');')(context, context, context, upstream, script.href);
      factories.set(factory, adapted);
      wrappedFactories.add(adapted);
      return adapted;
    } catch (error) {
      window.__yspTvPlayerContextError = true;
      return factory;
    }
  }

  Object.defineProperty(window, 'activeURL', {
    configurable: true,
    get: function () { return active; },
    set: function (value) { active = value === localOrigin ? upstream.origin : value; }
  });
  Object.defineProperty(window, 'CMGDecModule', {
    configurable: true,
    get: function () { return currentFactory; },
    set: function (factory) { currentFactory = adapt(factory); }
  });
}());
