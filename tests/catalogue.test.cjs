const {test} = require('node:test');
const assert = require('node:assert/strict');
const {channels,guide,serverTime} = require('../service/catalogue');

function number(value) {
  const out = [];
  while (value >= 128) { out.push(value % 128 + 128); value = Math.floor(value / 128); }
  return Buffer.from(out.concat(value));
}
function field(id, value) {
  if (typeof value === 'number') return Buffer.concat([number(id * 8), number(value)]);
  const bytes = Buffer.from(value);
  return Buffer.concat([number(id * 8 + 2), number(bytes.length), bytes]);
}
const record = (...parts) => Buffer.concat(parts);
const response = (...payload) => record(field(1,200), ...payload.map(value => field(2,value)));

test('channel catalogue preserves groups, identities, dates and packed rights', () => {
  const cctv = record(field(2,'CCTV1'),field(4,'10'),field(6,'20'),field(10,'2026-11-14'),
    field(11,'yangshi'),field(15,number(1443)),field(18,'880'));
  const satellite = record(field(2,'湖南卫视'),field(4,'11'),field(6,'21'),field(11,'weishi'));
  const result = channels(response(field(2,record(field(15,cctv),field(15,satellite)))));
  assert.deepEqual(result.map(group => group.map(channel => channel.channelName)), [['CCTV1'],['湖南卫视']]);
  assert.deepEqual(result[0][0], {pid:'10',streamId:'20',channelName:'CCTV1',payType:'880',viewRights:[1443],programDates:['2026-11-14']});
});

test('guide marks the current programme from server time', () => {
  const entry = record(field(2,'新闻'),field(3,100),field(4,200),field(5,'01:00'));
  assert.equal(serverTime(response(field(1,1794590000000))),1794590000000);
  assert.deepEqual(guide(response(entry),150),[{name:'新闻',startTime:'01:00',sta:2}]);
  assert.equal(guide(response(entry),200)[0].sta,0);
});

test('truncated data and upstream errors are rejected', () => {
  assert.throws(() => channels(Buffer.from([8,200,1,18,10,1])), /length/);
  assert.throws(() => guide(field(1,403),0), /failed/);
});
