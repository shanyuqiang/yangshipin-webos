(function () {
  'use strict';

  function reader(bytes) {
    var position = 0;
    function number() {
      var value = 0;
      for (var factor = 1; position < bytes.length && factor <= Math.pow(2, 49); factor *= 128) {
        var byte = bytes[position++];
        value += (byte & 127) * factor;
        if (byte < 128 && Number.isSafeInteger(value)) return value;
      }
      throw new Error('Invalid catalogue data');
    }
    return {
      number: number,
      more: function () { return position < bytes.length; },
      take: function (length) {
        if (length < 0 || position + length > bytes.length) throw new Error('Invalid catalogue length');
        var value = bytes.subarray(position, position + length);
        position += length;
        return value;
      }
    };
  }

  function fields(bytes) {
    if (!(bytes instanceof Uint8Array)) throw new Error('Invalid catalogue message');
    var result = {};
    var input = reader(bytes);
    while (input.more()) {
      var key = input.number();
      var id = Math.floor(key / 8);
      var kind = key % 8;
      var value;
      if (!id) throw new Error('Invalid catalogue field');
      if (kind === 0) value = input.number();
      else {
        var length = kind === 2 ? input.number() : kind === 1 ? 8 : kind === 5 ? 4 : -1;
        value = input.take(length);
      }
      (result[id] || (result[id] = [])).push(value);
    }
    return result;
  }

  function values(record, id) { return record[id] || []; }
  function first(record, id) { return values(record, id)[0]; }
  function decode(value) { return value instanceof Uint8Array ? new TextDecoder().decode(value) : ''; }
  function message(bytes) {
    var response = fields(bytes);
    if (first(response, 1) !== 200) throw new Error('Catalogue request failed');
    return values(response, 2).filter(function (entry) { return entry instanceof Uint8Array; }).map(fields);
  }

  function channels(bytes) {
    var groups = [[], []];
    message(bytes).forEach(function (page) {
      values(page, 2).map(fields).forEach(function (section) {
        values(section, 15).map(fields).forEach(function (record) {
          var type = decode(first(record, 11));
          var pid = decode(first(record, 4));
          var streamId = decode(first(record, 6));
          var name = decode(first(record, 2));
          if (!/^\d+$/.test(pid) || !/^\d+$/.test(streamId) || !name || ['yangshi', 'weishi'].indexOf(type) < 0) return;
          groups[type === 'yangshi' ? 0 : 1].push({
            pid: pid, streamId: streamId, channelName: name, payType: decode(first(record, 18)),
            viewRights: values(record, 15).reduce(function (rights, value) {
              if (typeof value === 'number') return rights.concat(value);
              var packed = reader(value);
              var decoded = [];
              while (packed.more()) decoded.push(packed.number());
              return rights.concat(decoded);
            }, []),
            programDates: values(record, 10).map(decode).filter(function (date) { return /^\d{4}-\d{2}-\d{2}$/.test(date); })
          });
        });
      });
    });
    if (!groups[0].length || !groups[1].length) throw new Error('Channel groups unavailable');
    return groups;
  }

  function guide(bytes, now) {
    return message(bytes).map(function (entry) {
      return {
        name: decode(first(entry, 2)), startTime: decode(first(entry, 5)),
        sta: first(entry, 3) <= now && now < first(entry, 4) ? 2 : 0
      };
    });
  }

  function serverTime(bytes) {
    var record = message(bytes)[0];
    var time = record && first(record, 1);
    if (!Number.isSafeInteger(time) || time <= 0) throw new Error('Server time unavailable');
    return time;
  }

  var api = {channels:channels, guide:guide, serverTime:serverTime};
  if (typeof module === 'object') module.exports = api;
  else window.yspCatalogue = api;
}());
