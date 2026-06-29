/**
 * Google Apps Script — Broker Admin Panel Backend
 *
 * SETUP:
 * 1. Go to https://script.google.com and create a new project
 * 2. Paste this entire file into Code.gs
 * 3. Set the Script Properties (Project Settings > Script Properties):
 *    - SHEET_ID: Your Google Sheet ID
 *    - OWNER_PASSWORD: Password for owner access
 *    - BROKER_PASSWORD: Password for broker access
 *    - OWNER_EMAIL: Email address to receive notifications
 * 4. Deploy as Web App (Deploy > New deployment > Web app)
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the deployment URL into admin/config.js
 */

// --- Config helpers ---

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    sheetId: props.getProperty('SHEET_ID'),
    ownerPassword: props.getProperty('OWNER_PASSWORD') || 'owner123',
    brokerPassword: props.getProperty('BROKER_PASSWORD') || 'broker123',
    ownerEmail: props.getProperty('OWNER_EMAIL') || 'caseysodolski@gmail.com',
  };
}

function getSheet(tabName) {
  const config = getConfig();
  const ss = SpreadsheetApp.openById(config.sheetId);
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
  }
  return sheet;
}

// --- CORS / Web App entry points ---

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const action = (e.parameter && e.parameter.action) || '';
  let result;

  try {
    switch (action) {
      case 'login':
        result = handleLogin(e);
        break;
      case 'getBuildings':
        result = getTabData('Buildings');
        break;
      case 'getSuites':
        result = getTabData('Suites');
        break;
      case 'getContacts':
        result = getTabData('Contacts');
        break;
      case 'submitChange':
        result = submitChange(e);
        break;
      case 'getPending':
        result = getPendingChanges(e);
        break;
      case 'approveChange':
        result = approveChange(e);
        break;
      case 'denyChange':
        result = denyChange(e);
        break;
      default:
        result = { success: false, error: 'Unknown action' };
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- Auth ---

function handleLogin(e) {
  const params = e.parameter || {};
  const password = params.password || '';
  const config = getConfig();

  if (password === config.ownerPassword) {
    return { success: true, role: 'owner' };
  }
  if (password === config.brokerPassword) {
    return { success: true, role: 'broker' };
  }
  return { success: false, error: 'Invalid password' };
}

// --- Read data ---

function getTabData(tabName) {
  const sheet = getSheet(tabName);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, data: [] };

  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    rows.push(row);
  }
  return { success: true, data: rows };
}

// --- Submit a change (broker) ---

function submitChange(e) {
  const params = e.parameter || {};
  const password = params.password || '';
  const config = getConfig();

  if (password !== config.brokerPassword && password !== config.ownerPassword) {
    return { success: false, error: 'Unauthorized' };
  }

  const changeType = params.changeType || '';     // add, edit, remove
  const targetTab = params.targetTab || '';       // Buildings, Suites, Contacts
  const targetId = params.targetId || '';
  const changeData = params.changeData || '{}';
  const submittedBy = params.submittedBy || 'Broker';

  const sheet = getSheet('PendingChanges');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'id', 'timestamp', 'changeType', 'targetTab', 'targetId',
      'changeData', 'submittedBy', 'status', 'reviewedBy', 'reviewedAt'
    ]);
  }

  const id = Utilities.getUuid();
  const timestamp = new Date().toISOString();

  sheet.appendRow([
    id, timestamp, changeType, targetTab, targetId,
    changeData, submittedBy, 'pending', '', ''
  ]);

  if (config.ownerEmail) {
    try {
      MailApp.sendEmail({
        to: config.ownerEmail,
        subject: 'New Change Request — Broker Admin Panel',
        body: 'A broker submitted a ' + changeType + ' request for ' + targetTab +
              ' (ID: ' + targetId + ').\n\nSubmitted by: ' + submittedBy +
              '\nTimestamp: ' + timestamp +
              '\n\nLog in to the admin panel to review.'
      });
    } catch (emailErr) {
      // Email sending may fail in some environments; don't block the request
    }
  }

  return { success: true, id: id };
}

// --- Admin: get pending changes ---

function getPendingChanges(e) {
  const params = e.parameter || {};
  const password = params.password || '';
  const config = getConfig();

  if (password !== config.ownerPassword) {
    return { success: false, error: 'Owner access required' };
  }

  const result = getTabData('PendingChanges');
  return result;
}

// --- Admin: approve ---

function approveChange(e) {
  const params = e.parameter || {};
  const password = params.password || '';
  const config = getConfig();

  if (password !== config.ownerPassword) {
    return { success: false, error: 'Owner access required' };
  }

  const changeId = params.changeId || '';
  const sheet = getSheet('PendingChanges');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  const statusCol = headers.indexOf('status');
  const reviewedByCol = headers.indexOf('reviewedBy');
  const reviewedAtCol = headers.indexOf('reviewedAt');
  const changeTypeCol = headers.indexOf('changeType');
  const targetTabCol = headers.indexOf('targetTab');
  const targetIdCol = headers.indexOf('targetId');
  const changeDataCol = headers.indexOf('changeData');

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === changeId) {
      sheet.getRange(i + 1, statusCol + 1).setValue('approved');
      sheet.getRange(i + 1, reviewedByCol + 1).setValue('Owner');
      sheet.getRange(i + 1, reviewedAtCol + 1).setValue(new Date().toISOString());

      applyChange(
        data[i][changeTypeCol],
        data[i][targetTabCol],
        data[i][targetIdCol],
        data[i][changeDataCol]
      );

      return { success: true };
    }
  }

  return { success: false, error: 'Change not found' };
}

// --- Admin: deny ---

function denyChange(e) {
  const params = e.parameter || {};
  const password = params.password || '';
  const config = getConfig();

  if (password !== config.ownerPassword) {
    return { success: false, error: 'Owner access required' };
  }

  const changeId = params.changeId || '';
  const sheet = getSheet('PendingChanges');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  const statusCol = headers.indexOf('status');
  const reviewedByCol = headers.indexOf('reviewedBy');
  const reviewedAtCol = headers.indexOf('reviewedAt');

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === changeId) {
      sheet.getRange(i + 1, statusCol + 1).setValue('denied');
      sheet.getRange(i + 1, reviewedByCol + 1).setValue('Owner');
      sheet.getRange(i + 1, reviewedAtCol + 1).setValue(new Date().toISOString());
      return { success: true };
    }
  }

  return { success: false, error: 'Change not found' };
}

// --- Apply an approved change to the target sheet ---

function applyChange(changeType, targetTab, targetId, changeDataStr) {
  const changeData = JSON.parse(changeDataStr);
  const sheet = getSheet(targetTab);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const idField = getIdField(targetTab);
  const idCol = headers.indexOf(idField);

  if (changeType === 'add') {
    const newRow = headers.map(function(h) { return changeData[h] || ''; });
    sheet.appendRow(newRow);
    return;
  }

  if (changeType === 'edit') {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(targetId)) {
        for (const key in changeData) {
          const col = headers.indexOf(key);
          if (col >= 0) {
            sheet.getRange(i + 1, col + 1).setValue(changeData[key]);
          }
        }
        return;
      }
    }
    return;
  }

  if (changeType === 'remove') {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(targetId)) {
        sheet.deleteRow(i + 1);
        return;
      }
    }
  }
}

function getIdField(tabName) {
  switch (tabName) {
    case 'Buildings': return 'building_id';
    case 'Suites': return 'suite_id';
    case 'Contacts': return 'name';
    default: return 'id';
  }
}
