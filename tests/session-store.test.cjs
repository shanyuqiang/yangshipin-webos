const assert = require('node:assert/strict');
const test = require('node:test');
const { createSessionStore, registerSessionMethods } = require('../service/session-store');
const APP = 'com.shanyuqiang.yangshipin';
const clone = value => JSON.parse(JSON.stringify(value));
function fakeDB(initial) {
  let record = initial ? clone(initial) : undefined;
  let revision = record ? record._rev : 0;
  let failedPut = false;
  let denied = false;
  let pending;
  const calls = [];
  const handlers = {};
  const service = {
    register(name, fn) { handlers[name] = fn; },
    call(uri, payload, callback) {
      const method = uri.split('/').pop();
      calls.push({ method, payload:clone(payload) });
      const finish = () => {
        let result = {returnValue:true};
        if (denied) result = {returnValue:false,errorText:'private upstream details'};
        else if (method === 'find') result.results = record ? [clone(record)] : [];
        else if (method === 'put') {
          if (failedPut) { failedPut = false; result = {returnValue:false,errorText:'secret'}; }
          else {
            const value = payload.objects[0];
            if (record && (value._id !== record._id || value._rev !== record._rev)) result = {returnValue:false};
            else {
              revision++;
              record = {...clone(value),_id:'record-1',_rev:revision};
              result.results = [{id:record._id,rev:revision}];
            }
          }
        }
        callback({payload:result});
      };
      if (method === 'put' && pending === true) pending = finish;
      else setImmediate(finish);
    }
  };
  return {service,calls,handlers,read:()=>clone(record || null),fail:()=>{failedPut=true;},deny:()=>{denied=true;},hold:()=>{pending=true;},release:()=>{const done=pending;pending=null;done();}};
}
const persistent = (value, expiresAt=2000) => ({name:'ysp_strAccesstoken',value,expiresAt});
const save = (store,cookie,generation=0) => store.save({...cookie,generation});

test('only the app sender can load, save or clear; DB kind remains private to service', async () => {
  const db = fakeDB();
  const store = createSessionStore(db.service,{now:()=>1000});
  registerSessionMethods(db.service,store);
  for (const method of ['loadSession','saveSessionCookie','clearSession']) {
    const denied = await new Promise(resolve => db.handlers[method]({sender:'other.app',payload:persistent('test'),respond:resolve}));
    assert.equal(denied.returnValue,false);
  }
  assert.equal(db.calls.length,0);
  const result = await new Promise(resolve => db.handlers.loadSession({sender:APP,payload:{},respond:resolve}));
  assert.equal(result.returnValue,true);
  assert.deepEqual(db.calls[0],{method:'putKind',payload:{id:APP+'.session:1',owner:APP+'.service',private:true}});
  assert.equal(db.calls.some(call=>call.method==='putPermissions'),false);
});

test('persistent cookies restore after service restart and returned values cannot mutate cache', async () => {
  const db = fakeDB();
  const store = createSessionStore(db.service,{now:()=>1000});
  await save(store,persistent('encoded%2Bvalue'));
  const loaded = await store.load();
  loaded.cookies[0].value='tampered';
  assert.equal((await store.load()).cookies[0].value,'encoded%2Bvalue');
  assert.deepEqual(await createSessionStore(db.service,{now:()=>1000}).load(),{cookies:[persistent('encoded%2Bvalue')],generation:0});
});

test('expired and blank values delete; session-only replacement cannot resurrect an old persisted value', async () => {
  const db=fakeDB();
  const store=createSessionStore(db.service,{now:()=>1000});
  await save(store,persistent('old'));
  await save(store,persistent('temporary',null));
  assert.equal((await store.load()).cookies[0].expiresAt,null);
  assert.deepEqual(await createSessionStore(db.service,{now:()=>1000}).load(),{cookies:[],generation:0});
  await save(store,persistent('next'));
  await save(store,persistent('',2000));
  assert.deepEqual(await store.load(),{cookies:[],generation:0});
  await save(store,persistent('old',999));
  assert.deepEqual(await store.load(),{cookies:[],generation:0});
  await save(store,persistent('expires',1500));
  assert.deepEqual(await createSessionStore(db.service,{now:()=>1600}).load(),{cookies:[],generation:0});
});

test('logout persists empty state and cannot resurrect after restart', async () => {
  const db=fakeDB();
  const store=createSessionStore(db.service,{now:()=>1000});
  await save(store,persistent('old'));
  await store.clear();
  assert.deepEqual(await createSessionStore(db.service,{now:()=>1000}).load(),{cookies:[],generation:1});
});

test('failed writes and owner rejection leave existing state intact', async () => {
  const db=fakeDB();
  const store=createSessionStore(db.service,{now:()=>1000});
  await save(store,persistent('old'));
  db.fail();
  await assert.rejects(save(store,persistent('new')),/Session storage failed/);
  assert.equal((await store.load()).cookies[0].value,'old');
  db.fail();
  await assert.rejects(store.clear(),/Session storage failed/);
  assert.equal(db.read().cookies[0].value,'old');
  const refused=fakeDB(); refused.deny();
  await assert.rejects(createSessionStore(refused.service).load(),/Session storage failed/);
});

test('refresh then logout is serialized even while a DB write is delayed', async () => {
  const db=fakeDB();
  const store=createSessionStore(db.service,{now:()=>1000});
  await save(store,persistent('old'));
  db.hold();
  const refresh=save(store,persistent('refreshed'));
  const logout=store.clear();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(db.calls.filter(call=>call.method==='put').length,2);
  db.release();
  await Promise.all([refresh,logout]);
  assert.deepEqual(await createSessionStore(db.service,{now:()=>1000}).load(),{cookies:[],generation:1});
});

test('cookie trust boundary rejects unknown names, unsafe values and oversized state', async () => {
  const db=fakeDB();
  const store=createSessionStore(db.service,{now:()=>1000});
  for (const value of [{...persistent('x'),name:'other_app'},persistent('x;y'),persistent('x\n'),persistent('"x"'),persistent('x'.repeat(8193)),persistent('x',Infinity)]) {
    await assert.rejects(save(store,value),/Invalid session cookie/);
  }
  const names=['ysp_openid','ysp_yspOpenid','strVideotoken','endtime','ysp_appid','ysp_strAccesstoken','ysp_strRefreshtoken','ysp_strOpenid'];
  for (const name of names.slice(0,7)) await save(store,{name,value:'x'.repeat(8192),expiresAt:2000});
  await assert.rejects(save(store,{name:names[7],value:'x'.repeat(8192),expiresAt:2000}),/Session storage limit/);
  assert.equal((await store.load()).cookies.length,7);
});


test('logout generation rejects late refreshes while an explicit new session can save', async () => {
  const db=fakeDB();
  const store=createSessionStore(db.service,{now:()=>1000});
  await save(store,persistent('old'));
  const logout=store.clear();
  const late=save(store,persistent('late'),0);
  assert.deepEqual(await logout,{generation:1});
  const putsBefore=db.calls.filter(call=>call.method==='put').length;
  await assert.rejects(late,/Stale session generation/);
  assert.equal(db.calls.filter(call=>call.method==='put').length,putsBefore);
  const restored=createSessionStore(db.service,{now:()=>1000});
  assert.deepEqual(await restored.load(),{cookies:[],generation:1});
  await assert.rejects(save(restored,persistent('late'),0),/Stale session generation/);
  await save(restored,persistent('new-login'),1);
  assert.equal((await restored.load()).cookies[0].value,'new-login');
});

test('failed logout does not advance generation; absent or invalid generations cannot write', async () => {
  const db=fakeDB();
  const store=createSessionStore(db.service,{now:()=>1000});
  await save(store,persistent('old'));
  db.fail();
  await assert.rejects(store.clear(),/Session storage failed/);
  assert.equal((await store.load()).generation,0);
  assert.equal(db.read().generation,0);
  for (const generation of [undefined,null,-1,1.5,Infinity]) {
    await assert.rejects(store.save({...persistent('bad'),generation}),/Invalid session generation/);
  }
  await save(store,persistent('still-current'),0);
});


test('legacy records start at generation zero and clearing an empty store persists its generation', async () => {
  const legacy=fakeDB({_kind:APP+'.session:1',_id:'record-1',_rev:5,cookies:[persistent('old')]});
  const migrated=createSessionStore(legacy.service,{now:()=>1000});
  assert.deepEqual(await migrated.load(),{cookies:[persistent('old')],generation:0});
  await migrated.clear();
  assert.equal(legacy.read()._rev,6);
  assert.equal(legacy.read().generation,1);
  const fresh=fakeDB();
  await createSessionStore(fresh.service,{now:()=>1000}).clear();
  const restarted=createSessionStore(fresh.service,{now:()=>1000});
  assert.deepEqual(await restarted.load(),{cookies:[],generation:1});
  await assert.rejects(save(restarted,persistent('late'),0),/Stale session generation/);
});

function withinTest(promise) {
  let timer;
  return Promise.race([promise,new Promise((resolve,reject)=>{ timer=setTimeout(()=>reject(new Error('test deadline exceeded')),200); })]).finally(()=>clearTimeout(timer));
}

test('a missing DB callback times out and a recovered database can be loaded again', async () => {
  const db=fakeDB();
  const original=db.service.call.bind(db.service);
  let drop=true;
  db.service.call=(uri,payload,callback)=>{
    if (drop) { drop=false; return; }
    original(uri,payload,callback);
  };
  const store=createSessionStore(db.service,{now:()=>1000,timeoutMs:15});
  await assert.rejects(withinTest(store.load()),/Session storage timeout/);
  assert.deepEqual(await withinTest(store.load()),{cookies:[],generation:0});
});

test('a committed put with lost callback reloads real revision and ignores its late callback', async () => {
  const db=fakeDB();
  const store=createSessionStore(db.service,{now:()=>1000,timeoutMs:15});
  await save(store,persistent('old'));
  const original=db.service.call.bind(db.service);
  let drop=true;
  let late;
  db.service.call=(uri,payload,callback)=>{
    if (drop && uri.endsWith('/put')) {
      drop=false;
      original(uri,payload,response=>{late=()=>callback(response);});
    } else original(uri,payload,callback);
  };
  await assert.rejects(withinTest(save(store,persistent('committed'))),/Session storage timeout/);
  assert.equal(db.read()._rev,2);
  assert.equal((await withinTest(store.load())).cookies[0].value,'committed');
  await save(store,persistent('newest'));
  assert.equal(db.read()._rev,3);
  late();
  assert.equal((await store.load()).cookies[0].value,'newest');
});

function loseNextPutReply(db) {
  const original=db.service.call.bind(db.service);
  let drop=true;
  db.service.call=(uri,payload,callback)=>{
    if (drop && uri.endsWith('/put')) {
      drop=false;
      original(uri,payload,()=>{});
    } else original(uri,payload,callback);
  };
}

test('reloading an uncertain write preserves unrelated session-only cookies in the same generation', async () => {
  const db=fakeDB();
  const store=createSessionStore(db.service,{now:()=>1000,timeoutMs:15});
  await save(store,{name:'strVideotoken',value:'temporary',expiresAt:null});
  loseNextPutReply(db);
  await assert.rejects(save(store,{name:'ysp_openid',value:'persistent',expiresAt:2000}),/Session storage timeout/);
  const loaded=await store.load();
  assert.equal(loaded.generation,0);
  assert.deepEqual(loaded.cookies.map(cookie=>cookie.name).sort(),['strVideotoken','ysp_openid']);
  assert.equal(loaded.cookies.find(cookie=>cookie.name==='strVideotoken').value,'temporary');
  assert.deepEqual(db.read().cookies.map(cookie=>cookie.name),['ysp_openid']);
});

test('a committed uncertain logout discards old session-only cookies when generation changes', async () => {
  const db=fakeDB();
  const store=createSessionStore(db.service,{now:()=>1000,timeoutMs:15});
  await save(store,{name:'strVideotoken',value:'temporary',expiresAt:null});
  loseNextPutReply(db);
  await assert.rejects(store.clear(),/Session storage timeout/);
  assert.deepEqual(await store.load(),{cookies:[],generation:1});
});

test('an uncertain same-name replacement cannot restore its previous temporary value', async () => {
  const db=fakeDB();
  let now=1000;
  const store=createSessionStore(db.service,{now:()=>now,timeoutMs:15});
  await save(store,{name:'ysp_openid',value:'expiring',expiresAt:1500});
  await save(store,{name:'strVideotoken',value:'old-temporary',expiresAt:null});
  now=1600;
  loseNextPutReply(db);
  await assert.rejects(save(store,{name:'strVideotoken',value:'new-temporary',expiresAt:null}),/Session storage timeout/);
  assert.deepEqual(await store.load(),{cookies:[],generation:0});
});
