/**
 * Deploy as a Web App: execute as yourself; allow Anyone.
 * Script Properties: UPLOAD_TOKEN (random >=32 chars), ROOT_FOLDER_ID (your folder),
 * PUBLIC_IMAGES ('true' to allow anyone with link; otherwise private).
 * Call through api.php?action=upload; never embed UPLOAD_TOKEN in frontend code.
 */
const MODULE_FOLDERS = Object.freeze({
  purchases: 'Purchases',
  investments: 'Investments',
  temp_investments: 'TempInvestments',
  subscriptions: 'Subscriptions',
  savings: 'Savings',
  currencies: 'Currencies',
  cards: 'Cards',
  passwords: 'Passwords'
});

function jsonOutput(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeTokenEqual(a, b) {
  const first = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, a, Utilities.Charset.UTF_8);
  const second = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b, Utilities.Charset.UTF_8);
  let diff = 0;
  for (let i = 0; i < first.length; i++) diff |= first[i] ^ second[i];
  return diff === 0;
}

function doGet() {
  return jsonOutput({ ok: false, error: 'POST required' });
}

function doPost(e) {
  let lock = null;
  try {
    const props = PropertiesService.getScriptProperties();
    const expected = props.getProperty('UPLOAD_TOKEN');
    const rootId = props.getProperty('ROOT_FOLDER_ID');
    if (!expected || expected.length < 32 || !rootId) {
      return jsonOutput({ ok: false, error: 'Uploader not configured' });
    }
    if (!e || !e.postData || !e.postData.contents || e.postData.contents.length > 4500000) {
      return jsonOutput({ ok: false, error: 'Invalid request size' });
    }
    const payload = JSON.parse(e.postData.contents);
    if (!payload || typeof payload.token !== 'string' || payload.token.length > 1024 || !safeTokenEqual(expected, payload.token)) {
      return jsonOutput({ ok: false, error: 'Unauthorized' });
    }
    if (!Object.prototype.hasOwnProperty.call(MODULE_FOLDERS, payload.module)) {
      return jsonOutput({ ok: false, error: 'Invalid module' });
    }
    if (typeof payload.image !== 'string') {
      return jsonOutput({ ok: false, error: 'Image required' });
    }
    const match = /^data:image\/(jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(payload.image);
    if (!match) return jsonOutput({ ok: false, error: 'JPEG or WebP required' });
    const bytes = Utilities.base64Decode(match[2]);
    if (bytes.length < 12 || bytes.length > 3 * 1024 * 1024) {
      return jsonOutput({ ok: false, error: 'Image too large or empty' });
    }
    const unsigned = bytes.map(function (b) { return b & 255; });
    const jpeg = unsigned[0] === 255 && unsigned[1] === 216 && unsigned[2] === 255;
    const webp = String.fromCharCode.apply(null, unsigned.slice(0, 4)) === 'RIFF'
      && String.fromCharCode.apply(null, unsigned.slice(8, 12)) === 'WEBP';
    if ((match[1] === 'jpeg' && !jpeg) || (match[1] === 'webp' && !webp)) {
      return jsonOutput({ ok: false, error: 'Image signature mismatch' });
    }
    // Serialize folder discovery/creation to avoid duplicate module folders.
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    const root = DriveApp.getFolderById(rootId);
    const folderName = MODULE_FOLDERS[payload.module];
    const matches = root.getFoldersByName(folderName);
    const folder = matches.hasNext() ? matches.next() : root.createFolder(folderName);
    const filename = payload.module + '_' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd_HHmmss')
      + '_' + Utilities.getUuid() + (match[1] === 'jpeg' ? '.jpg' : '.webp');
    const blob = Utilities.newBlob(bytes, 'image/' + match[1], filename);
    const file = folder.createFile(blob);
    const publicImages = props.getProperty('PUBLIC_IMAGES') === 'true';
    try {
      file.setSharing(publicImages ? DriveApp.Access.ANYONE_WITH_LINK : DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    } catch (sharingError) {
      file.setTrashed(true);
      throw sharingError;
    }
    const id = file.getId();
    return jsonOutput({
      ok: true,
      file_id: id,
      view_url: 'https://drive.google.com/file/d/' + id + '/view',
      image_url: 'https://drive.google.com/uc?export=view&id=' + id,
      public: publicImages
    });
  } catch (error) {
    // Apps Script ContentService uses JSON errors rather than custom HTTP status codes.
    return jsonOutput({ ok: false, error: 'Upload failed; check configuration, deployment and Drive quota' });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
