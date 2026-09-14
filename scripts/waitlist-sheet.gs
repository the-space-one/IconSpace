/**
 * Google Apps Script backing the waitlist Sheets backup.
 * Paired with src/server/waitlist-sheet.ts.
 *
 * SETUP
 *  1. Create a Google Sheet. Name the first tab exactly `Waitlist`
 *     (or change SHEET_NAME below).
 *  2. Extensions > Apps Script. Delete the placeholder, paste this file.
 *  3. Replace SECRET below with a long random string. Generate one with:
 *       node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
 *  4. Deploy > New deployment > type "Web app".
 *       Execute as:        Me
 *       Who has access:    Anyone
 *     "Anyone" is what lets the server POST without a Google login. The secret
 *     is what actually protects the endpoint, so do not skip step 3.
 *  5. Copy the /exec URL into WAITLIST_SHEET_WEBHOOK_URL, and the same secret
 *     into WAITLIST_SHEET_WEBHOOK_SECRET.
 *
 * After editing this script you must Deploy > Manage deployments > edit >
 * New version, or the /exec URL keeps serving the old code.
 */

const SHEET_NAME = 'Waitlist';
const SECRET = 'REPLACE_WITH_A_LONG_RANDOM_STRING';

const HEADERS = ['Signed up at', 'Email', 'Subscriber ID', 'Wrote to'];

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'empty body' });
    }

    const body = JSON.parse(e.postData.contents);

    // Reject before touching the sheet. Length check first so a missing secret
    // can never match an empty configured one.
    if (!SECRET || SECRET.length < 16 || body.secret !== SECRET) {
      return json({ ok: false, error: 'unauthorized' });
    }

    if (!body.email) {
      return json({ ok: false, error: 'missing email' });
    }

    const sheet = getSheet();

    // A retry from the server (timeout, then success) must not double-write.
    if (body.subscriberId && hasSubscriberId(sheet, body.subscriberId)) {
      return json({ ok: true, deduped: true });
    }

    sheet.appendRow([
      body.createdAt || new Date().toISOString(),
      body.email,
      body.subscriberId || '',
      body.source || '',
    ]);

    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: String(error).slice(0, 200) });
  }
}

function getSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();

  // Create the tab rather than failing when it is missing. A fresh sheet ships
  // with a tab called "Sheet1", and a rename is an easy step to miss — losing
  // a signup backup over a tab name is not a worthwhile trade.
  let sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/** Column C holds the subscriber id. Scanning it keeps appends idempotent. */
function hasSubscriberId(sheet, subscriberId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const ids = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
  const needle = String(subscriberId);
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === needle) return true;
  }
  return false;
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
