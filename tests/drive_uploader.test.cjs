const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const properties = { UPLOAD_TOKEN: 'x'.repeat(48), ROOT_FOLDER_ID: 'private-root' };
let createdFolders = 0;
let createdFiles = 0;
let folderExists = false;
let currentSharing;
let locked = false;
const file = {
  getId: () => 'fake_drive_id_123456789',
  setSharing: (access) => { currentSharing = access; },
  setTrashed: () => {}
};
const folder = {
  createFile: () => { createdFiles++; return file; }
};
const context = vm.createContext({
  PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties[key] }) },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (text) => ({ text, setMimeType() { return this; } })
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (_, value) => Array.from(crypto.createHash('sha256').update(value).digest()),
    base64Decode: (value) => Array.from(Buffer.from(value, 'base64')),
    formatDate: () => '20261106_010000', getUuid: () => crypto.randomUUID(),
    newBlob: (bytes, type, name) => ({ bytes, type, name })
  },
  LockService: {
    getScriptLock: () => ({
      waitLock: () => { locked = true; },
      hasLock: () => locked,
      releaseLock: () => { locked = false; }
    })
  },
  DriveApp: {
    Access: { ANYONE_WITH_LINK: 'public', PRIVATE: 'private' }, Permission: { VIEW: 'view' },
    getFolderById: () => ({
      getFoldersByName: () => ({ hasNext: () => folderExists, next: () => folder }),
      createFolder: (name) => {
        assert.equal(name, 'Purchases');
        createdFolders++;
        folderExists = true;
        return folder;
      }
    })
  }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../DriveUploader.gs'), 'utf8'), context);
function post(payload) {
  return JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }).text);
}
const image = 'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, ...Array(20).fill(0)]).toString('base64');
// This test verifies protocol and Drive orchestration; image decoding is tested by PHP.
assert.equal(post({ token: 'wrong', module: 'purchases', image }).ok, false);
assert.equal(createdFiles, 0);
assert.equal(post({ token: properties.UPLOAD_TOKEN, module: '__proto__', image }).ok, false);
assert.equal(post({ token: properties.UPLOAD_TOKEN, module: 'purchases', image: 'bad' }).ok, false);
let result = post({ token: properties.UPLOAD_TOKEN, module: 'purchases', image });
assert.equal(result.ok, true);
assert.equal(result.public, false);
assert.equal(currentSharing, 'private');
assert.equal(locked, false);
properties.PUBLIC_IMAGES = 'true';
result = post({ token: properties.UPLOAD_TOKEN, module: 'purchases', image });
assert.equal(result.ok, true);
assert.equal(result.public, true);
assert.equal(currentSharing, 'public');
assert.equal(createdFolders, 1);
assert.equal(createdFiles, 2);
assert.equal(JSON.parse(context.doGet().text).ok, false);
console.log('PASS: uploader authentication, module validation, image envelope, folder reuse, sharing, lock release (mock Drive)');
