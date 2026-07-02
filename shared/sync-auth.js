'use strict';

var FT_SYNC_TOKEN_KEY = 'sync_token_v1';
var _ftSyncToken = '';

function ftSyncTokenGet() {
  return _ftSyncToken;
}

function ftSyncTokenSet(token) {
  _ftSyncToken = String(token || '').trim();
}

function ftSyncTokenLoad(chromeStorage, cb) {
  if (!chromeStorage || !chromeStorage.local || typeof chromeStorage.local.get !== 'function') {
    ftSyncTokenSet('');
    if (cb) cb(_ftSyncToken);
    return;
  }
  chromeStorage.local.get([FT_SYNC_TOKEN_KEY], function(r) {
    ftSyncTokenSet(r ? r[FT_SYNC_TOKEN_KEY] : '');
    if (cb) cb(_ftSyncToken);
  });
}

function ftSyncTokenPersist(chromeStorage) {
  if (!chromeStorage || !chromeStorage.local || typeof chromeStorage.local.set !== 'function') return;
  chromeStorage.local.set({ [FT_SYNC_TOKEN_KEY]: _ftSyncToken || '' });
}

if (typeof window !== 'undefined') {
  window.ftSyncAuth = {
    key: FT_SYNC_TOKEN_KEY,
    getToken: ftSyncTokenGet,
    setToken: ftSyncTokenSet,
    loadToken: ftSyncTokenLoad,
    persistToken: ftSyncTokenPersist,
  };
}
