'use strict';

/** Receipt images in IndexedDB (local only, keyed by expense id). */
var FT_RECEIPT_DB = 'ft_receipts_v1';
var FT_RECEIPT_STORE = 'receipts';
var _receiptDbPromise = null;

function ftReceiptOpenDb_() {
  if (_receiptDbPromise) return _receiptDbPromise;
  _receiptDbPromise = new Promise(function(resolve, reject) {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }
    var req = indexedDB.open(FT_RECEIPT_DB, 1);
    req.onerror = function() { reject(req.error || new Error('IDB open failed')); };
    req.onupgradeneeded = function() {
      var db = req.result;
      if (!db.objectStoreNames.contains(FT_RECEIPT_STORE)) {
        db.createObjectStore(FT_RECEIPT_STORE);
      }
    };
    req.onsuccess = function() { resolve(req.result); };
  });
  return _receiptDbPromise;
}

function ftReceiptSave(expenseId, blob) {
  if (!expenseId || !blob) return Promise.reject(new Error('Missing receipt data'));
  return ftReceiptOpenDb_().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(FT_RECEIPT_STORE, 'readwrite');
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { reject(tx.error); };
      tx.objectStore(FT_RECEIPT_STORE).put(blob, String(expenseId));
    });
  });
}

function ftReceiptGet(expenseId) {
  if (!expenseId) return Promise.resolve(null);
  return ftReceiptOpenDb_().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(FT_RECEIPT_STORE, 'readonly');
      var req = tx.objectStore(FT_RECEIPT_STORE).get(String(expenseId));
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  });
}

function ftReceiptDelete(expenseId) {
  if (!expenseId) return Promise.resolve(false);
  return ftReceiptOpenDb_().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(FT_RECEIPT_STORE, 'readwrite');
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { reject(tx.error); };
      tx.objectStore(FT_RECEIPT_STORE).delete(String(expenseId));
    });
  });
}

function ftReceiptHas(expenseId) {
  return ftReceiptGet(expenseId).then(function(b) { return !!b; });
}
