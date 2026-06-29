// --- State ---
let currentRole = null;
let currentUser = '';
let buildings = [];
let suites = [];
let contacts = [];
let pending = [];

// --- DOM refs ---
const $ = id => document.getElementById(id);

// --- Field definitions per category ---
const FIELD_DEFS = {
  Buildings: [
    { id: 'building_id', label: 'Building ID', type: 'text' },
    { id: 'building_name', label: 'Building Name', type: 'text' },
    { id: 'address', label: 'Address', type: 'text' },
    { id: 'city', label: 'City', type: 'text' },
    { id: 'state', label: 'State', type: 'text' },
    { id: 'zip', label: 'ZIP', type: 'text' },
    { id: 'description', label: 'Description', type: 'textarea' },
    { id: 'listing_type', label: 'Listing Type', type: 'select', options: [{ value: 'lease', label: 'Lease' }, { value: 'sale', label: 'Sale' }] },
    { id: 'asking_price', label: 'Asking Price', type: 'text' },
    { id: 'broker', label: 'Broker', type: 'text' },
  ],
  Suites: [
    { id: 'suite_id', label: 'Suite ID', type: 'text' },
    { id: 'building_id', label: 'Building', type: 'building-select' },
    { id: 'suite_number', label: 'Suite Number', type: 'text' },
    { id: 'floor', label: 'Floor', type: 'text' },
    { id: 'square_feet', label: 'Square Feet', type: 'text' },
    { id: 'lease_rate', label: 'Lease Rate', type: 'text' },
    { id: 'rate_unit', label: 'Rate Unit', type: 'text', default: '/SF/yr' },
    { id: 'status', label: 'Status', type: 'select', options: [{ value: 'Available', label: 'Available' }, { value: 'Pending', label: 'Pending' }, { value: 'Leased', label: 'Leased' }] },
    { id: 'available_date', label: 'Available Date', type: 'date' },
    { id: 'notes', label: 'Notes', type: 'textarea' },
  ],
  Contacts: [
    { id: 'name', label: 'Name', type: 'text' },
    { id: 'title', label: 'Title', type: 'text' },
    { id: 'phone', label: 'Phone', type: 'tel' },
    { id: 'email', label: 'Email', type: 'email' },
  ],
};

const ID_FIELDS = { Buildings: 'building_id', Suites: 'suite_id', Contacts: 'name' };

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  if (ADMIN_CONFIG.DEMO_MODE) $('demo-hint').style.display = 'block';

  const session = API.getSession();
  if (session) {
    currentRole = session.role;
    currentUser = session.name;
    enterApp();
  }

  $('login-form').addEventListener('submit', handleLogin);
  $('btn-logout').addEventListener('click', handleLogout);
  $('menu-toggle').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('modal-close').addEventListener('click', closeModal);
  $('modal-cancel').addEventListener('click', closeModal);
  $('modal-overlay').addEventListener('click', e => { if (e.target === $('modal-overlay')) closeModal(); });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(link.dataset.page);
      $('sidebar').classList.remove('open');
    });
  });

  $('btn-add-building').addEventListener('click', () => openBuildingForm(null));
  $('btn-add-suite').addEventListener('click', () => openSuiteForm(null));
  $('btn-add-contact').addEventListener('click', () => openContactForm(null));

  // Broker request form
  $('req-type').addEventListener('change', onRequestFormChange);
  $('req-tab').addEventListener('change', onRequestFormChange);
  $('req-target').addEventListener('change', onRequestTargetChange);
  $('btn-submit-request').addEventListener('click', handleBrokerSubmit);
});

// --- Auth ---
async function handleLogin(e) {
  e.preventDefault();
  const name = $('login-name').value.trim();
  const password = $('login-password').value;
  $('login-error').textContent = '';

  const result = await API.callApi('login', { password });
  if (result.success) {
    currentRole = result.role;
    currentUser = name;
    API.setSession({ role: result.role, name });
    enterApp();
  } else {
    $('login-error').textContent = result.error || 'Login failed';
  }
}

function handleLogout() {
  API.clearSession();
  currentRole = null;
  currentUser = '';
  $('page-login').classList.add('active');
  $('app-shell').style.display = 'none';
  document.body.className = '';
  $('login-password').value = '';
}

async function enterApp() {
  $('page-login').classList.remove('active');
  $('app-shell').style.display = '';
  $('user-name').textContent = currentUser + ' (' + currentRole + ')';
  document.body.className = 'role-' + currentRole;
  await loadAllData();
  const params = new URLSearchParams(window.location.search);
  const reviewId = params.get('review');
  if (reviewId && currentRole === 'owner') {
    navigateTo('pending');
    highlightPendingCard(reviewId);
  } else {
    navigateTo(currentRole === 'owner' ? 'dashboard' : 'submit-request');
  }
}

// --- Navigation ---
function navigateTo(page) {
  document.querySelectorAll('.main-content > .page').forEach(p => p.classList.remove('active'));
  const target = $('page-' + page);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.page === page);
  });
}

// --- Data loading ---
async function loadAllData() {
  const [b, s, c] = await Promise.all([
    API.callApi('getBuildings', {}),
    API.callApi('getSuites', {}),
    API.callApi('getContacts', {}),
  ]);
  buildings = b.success ? b.data : [];
  suites = s.success ? s.data : [];
  contacts = c.success ? c.data : [];

  if (currentRole === 'owner') {
    const p = await API.callApi('getPending', { password: API.getSession()?.password || (ADMIN_CONFIG.DEMO_MODE ? 'owner123' : '') });
    pending = p.success ? p.data : [];
    renderDashboard();
    renderBuildings();
    renderSuites();
    renderContacts();
    renderPending();
  }

  if (currentRole === 'broker') {
    const p = await API.callApi('getPending', { role: 'broker', submittedBy: currentUser });
    pending = p.success ? p.data : [];
    renderMyRequests();
  }
}

// --- Dashboard (owner) ---
function renderDashboard() {
  $('stat-buildings').textContent = buildings.length;
  $('stat-suites').textContent = suites.length;
  $('stat-contacts').textContent = contacts.length;
  const pendingCount = pending.filter(p => p.status === 'pending').length;
  $('stat-pending').textContent = pendingCount;

  const badge = $('pending-count');
  if (pendingCount > 0) {
    badge.style.display = '';
    badge.textContent = pendingCount;
  } else {
    badge.style.display = 'none';
  }
}

// --- Buildings table (owner) ---
function renderBuildings() {
  const tbody = document.querySelector('#buildings-table tbody');
  tbody.innerHTML = buildings.map(b => `
    <tr>
      <td>${esc(b.building_id)}</td>
      <td>${esc(b.building_name)}</td>
      <td>${esc(b.address)}</td>
      <td>${esc(b.city)}</td>
      <td>${esc(b.listing_type)}</td>
      <td>${esc(b.broker || '—')}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="openBuildingForm('${esc(b.building_id)}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="submitRemove('Buildings','${esc(b.building_id)}','${esc(b.building_name)}')">Remove</button>
      </td>
    </tr>
  `).join('');
}

// --- Suites table (owner) ---
function renderSuites() {
  const tbody = document.querySelector('#suites-table tbody');
  tbody.innerHTML = suites.map(s => {
    const bldg = buildings.find(b => b.building_id === s.building_id);
    return `
    <tr>
      <td>${esc(s.suite_id)}</td>
      <td>${esc(bldg ? bldg.building_name : s.building_id)}</td>
      <td>${esc(s.suite_number)}</td>
      <td>${esc(s.floor)}</td>
      <td>${esc(s.square_feet)}</td>
      <td>${s.lease_rate ? '$' + esc(s.lease_rate) + ' ' + esc(s.rate_unit || '') : '—'}</td>
      <td><span class="status-${(s.status||'').toLowerCase()}">${esc(s.status)}</span></td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="openSuiteForm('${esc(s.suite_id)}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="submitRemove('Suites','${esc(s.suite_id)}','${esc(s.suite_number)}')">Remove</button>
      </td>
    </tr>`;
  }).join('');
}

// --- Contacts table (owner) ---
function renderContacts() {
  const tbody = document.querySelector('#contacts-table tbody');
  tbody.innerHTML = contacts.map(c => `
    <tr>
      <td>${esc(c.name)}</td>
      <td>${esc(c.title)}</td>
      <td>${esc(c.phone)}</td>
      <td>${esc(c.email)}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="openContactForm('${esc(c.name)}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="submitRemove('Contacts','${esc(c.name)}','${esc(c.name)}')">Remove</button>
      </td>
    </tr>
  `).join('');
}

// --- Pending changes (owner) ---
function renderPending() {
  const list = $('pending-list');
  const pendingItems = pending.slice().sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  if (pendingItems.length === 0) {
    list.innerHTML = '';
    $('pending-empty').style.display = '';
    return;
  }
  $('pending-empty').style.display = 'none';
  list.innerHTML = pendingItems.map(renderPendingCard).join('');
}

function renderPendingCard(p) {
  let changeObj = {};
  try { changeObj = JSON.parse(p.changeData); } catch {}
  const typeClass = 'type-' + p.changeType;
  const statusClass = 'status-' + p.status;

  let detailHtml = '<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>';
  for (const k in changeObj) {
    detailHtml += `<tr><td>${esc(k)}</td><td>${esc(String(changeObj[k]))}</td></tr>`;
  }
  detailHtml += '</tbody></table>';

  const actions = p.status === 'pending'
    ? `<button class="btn btn-sm btn-success" onclick="handleApprove('${p.id}')">Approve</button>
       <button class="btn btn-sm btn-danger" onclick="handleDeny('${p.id}')">Deny</button>`
    : `<span style="font-size:.8rem;color:var(--gray-500);text-transform:uppercase">${esc(p.status)}</span>`;

  return `
    <div class="pending-card ${statusClass}">
      <div class="pending-meta">
        <span class="${typeClass}">${esc(p.changeType)}</span>
        <span>${esc(p.targetTab)}</span>
        <span>ID: ${esc(p.targetId)}</span>
        <span>by ${esc(p.submittedBy)}</span>
        <span>${new Date(p.timestamp).toLocaleString()}</span>
      </div>
      <div class="pending-detail">${detailHtml}</div>
      <div class="pending-actions">${actions}</div>
    </div>`;
}

// =============================================
// BROKER: Submit Request form
// =============================================

function onRequestFormChange() {
  const reqType = $('req-type').value;
  const reqTab = $('req-tab').value;
  const targetWrap = $('req-target-wrap');
  const fields = $('req-fields');
  const btn = $('btn-submit-request');

  fields.innerHTML = '';
  btn.disabled = true;

  if (!reqType || !reqTab) {
    targetWrap.style.display = 'none';
    return;
  }

  if (reqType === 'edit' || reqType === 'remove') {
    targetWrap.style.display = '';
    populateTargetSelect(reqTab);
  } else {
    targetWrap.style.display = 'none';
    $('req-target').value = '';
    if (reqType === 'add') {
      renderRequestFields(reqTab, null);
      btn.disabled = false;
    }
  }
}

function populateTargetSelect(tab) {
  const sel = $('req-target');
  sel.innerHTML = '<option value="">— Select —</option>';
  const items = getItemsForTab(tab);
  const idField = ID_FIELDS[tab];
  items.forEach(item => {
    const id = item[idField];
    const label = tab === 'Buildings' ? item.building_name
      : tab === 'Suites' ? item.suite_number + ' (' + item.building_id + ')'
      : item.name;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

function onRequestTargetChange() {
  const reqType = $('req-type').value;
  const reqTab = $('req-tab').value;
  const targetId = $('req-target').value;
  const fields = $('req-fields');
  const btn = $('btn-submit-request');

  fields.innerHTML = '';
  btn.disabled = true;

  if (!targetId) return;

  if (reqType === 'remove') {
    const items = getItemsForTab(reqTab);
    const idField = ID_FIELDS[reqTab];
    const item = items.find(i => String(i[idField]) === targetId);
    const label = reqTab === 'Buildings' ? item?.building_name
      : reqTab === 'Suites' ? item?.suite_number
      : item?.name;
    fields.innerHTML = `<p style="color:var(--gray-500)">You are requesting to remove <strong>${esc(label || targetId)}</strong>.</p>`;
    btn.disabled = false;
    return;
  }

  // edit
  const items = getItemsForTab(reqTab);
  const idField = ID_FIELDS[reqTab];
  const existing = items.find(i => String(i[idField]) === targetId);
  renderRequestFields(reqTab, existing);
  btn.disabled = false;
}

function getItemsForTab(tab) {
  if (tab === 'Buildings') return buildings;
  if (tab === 'Suites') return suites;
  if (tab === 'Contacts') return contacts;
  return [];
}

function renderRequestFields(tab, existing) {
  const container = $('req-fields');
  container.innerHTML = '';
  const defs = FIELD_DEFS[tab] || [];

  defs.forEach(def => {
    const val = existing ? (existing[def.id] || '') : (def.default || '');
    const div = document.createElement('div');
    div.className = 'form-group';

    if (def.type === 'textarea') {
      div.innerHTML = `<label for="req-f-${def.id}">${def.label}</label><textarea id="req-f-${def.id}">${esc(val)}</textarea>`;
    } else if (def.type === 'select') {
      const opts = def.options.map(o => `<option value="${esc(o.value)}" ${o.value === val ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
      div.innerHTML = `<label for="req-f-${def.id}">${def.label}</label><select id="req-f-${def.id}">${opts}</select>`;
    } else if (def.type === 'building-select') {
      const bOpts = buildings.map(b => `<option value="${esc(b.building_id)}" ${b.building_id === val ? 'selected' : ''}>${esc(b.building_name)}</option>`).join('');
      div.innerHTML = `<label for="req-f-${def.id}">${def.label}</label><select id="req-f-${def.id}"><option value="">— Select —</option>${bOpts}</select>`;
    } else {
      div.innerHTML = `<label for="req-f-${def.id}">${def.label}</label><input type="${def.type || 'text'}" id="req-f-${def.id}" value="${esc(val)}">`;
    }

    // For edits, make the ID field read-only
    if (existing && def.id === ID_FIELDS[tab]) {
      const input = div.querySelector('input');
      if (input) input.readOnly = true;
    }

    container.appendChild(div);
  });
}

async function handleBrokerSubmit() {
  const reqType = $('req-type').value;
  const reqTab = $('req-tab').value;
  const targetId = $('req-target').value;

  if (!reqType || !reqTab) return;

  let data = {};
  if (reqType !== 'remove') {
    const defs = FIELD_DEFS[reqTab] || [];
    defs.forEach(def => {
      const el = $('req-f-' + def.id);
      if (el) data[def.id] = el.value;
    });
  }

  const idField = ID_FIELDS[reqTab];
  const resolvedId = reqType === 'add' ? (data[idField] || 'NEW') : targetId;

  const result = await API.callApi('submitChange', {
    password: ADMIN_CONFIG.DEMO_MODE ? 'broker123' : '',
    changeType: reqType,
    targetTab: reqTab,
    targetId: resolvedId,
    changeData: JSON.stringify(data),
    submittedBy: currentUser,
  });

  if (result.success) {
    showToast('Request submitted — awaiting owner approval', 'success');
    // Reset form
    $('req-type').value = '';
    $('req-tab').value = '';
    $('req-target').value = '';
    $('req-target-wrap').style.display = 'none';
    $('req-fields').innerHTML = '';
    $('btn-submit-request').disabled = true;
    await loadAllData();
  } else {
    showToast(result.error || 'Failed to submit', 'error');
  }
}

// --- Broker: My Requests ---
function renderMyRequests() {
  // In demo mode we can show all pending items submitted by this user
  // In production the backend would filter by submittedBy
  const list = $('my-requests-list');
  const myItems = pending.filter(p => p.submittedBy === currentUser);

  // Also check mock pending directly in demo mode
  let items = myItems;
  if (ADMIN_CONFIG.DEMO_MODE && items.length === 0) {
    // Show all pending for demo
    items = pending;
  }

  if (items.length === 0) {
    list.innerHTML = '';
    $('my-requests-empty').style.display = '';
    return;
  }
  $('my-requests-empty').style.display = 'none';

  list.innerHTML = items.map(p => {
    let changeObj = {};
    try { changeObj = JSON.parse(p.changeData); } catch {}
    const typeClass = 'type-' + p.changeType;
    const statusClass = 'status-' + p.status;
    const statusLabel = p.status === 'pending' ? 'Awaiting Review'
      : p.status === 'approved' ? 'Approved'
      : 'Denied';
    const statusColor = p.status === 'pending' ? 'var(--orange)'
      : p.status === 'approved' ? 'var(--green)'
      : 'var(--red)';

    let detailHtml = '';
    if (Object.keys(changeObj).length > 0) {
      detailHtml = '<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>';
      for (const k in changeObj) {
        detailHtml += `<tr><td>${esc(k)}</td><td>${esc(String(changeObj[k]))}</td></tr>`;
      }
      detailHtml += '</tbody></table>';
    }

    return `
      <div class="pending-card ${statusClass}">
        <div class="pending-meta">
          <span class="${typeClass}">${esc(p.changeType)}</span>
          <span>${esc(p.targetTab)}</span>
          <span>ID: ${esc(p.targetId)}</span>
          <span>${new Date(p.timestamp).toLocaleString()}</span>
        </div>
        ${detailHtml ? '<div class="pending-detail">' + detailHtml + '</div>' : ''}
        <div class="pending-actions">
          <span style="font-size:.85rem;font-weight:600;color:${statusColor}">${statusLabel}</span>
        </div>
      </div>`;
  }).join('');
}

// =============================================
// OWNER: Modal / Forms (for direct edits)
// =============================================

function openModal(title) {
  $('modal-title').textContent = title;
  $('modal-fields').innerHTML = '';
  $('modal-overlay').classList.add('open');
}

function closeModal() {
  $('modal-overlay').classList.remove('open');
  $('modal-form').onsubmit = null;
}

function addField(id, label, value, type) {
  const container = $('modal-fields');
  const div = document.createElement('div');
  if (type === 'textarea') {
    div.innerHTML = `<label for="field-${id}">${label}</label><textarea id="field-${id}">${esc(value || '')}</textarea>`;
  } else if (type === 'select') {
    const opts = value.options.map(o => `<option value="${esc(o.value)}" ${o.value === value.selected ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
    div.innerHTML = `<label for="field-${id}">${label}</label><select id="field-${id}">${opts}</select>`;
  } else {
    div.innerHTML = `<label for="field-${id}">${label}</label><input type="${type || 'text'}" id="field-${id}" value="${esc(value || '')}">`;
  }
  container.appendChild(div);
}

function getFieldVal(id) {
  const el = $('field-' + id);
  return el ? el.value : '';
}

function openBuildingForm(buildingId) {
  const isEdit = !!buildingId;
  const b = isEdit ? buildings.find(x => x.building_id === buildingId) : {};
  openModal(isEdit ? 'Edit Building' : 'Add Building');

  addField('building_id', 'Building ID', b.building_id || '', 'text');
  addField('building_name', 'Building Name', b.building_name || '', 'text');
  addField('address', 'Address', b.address || '', 'text');
  addField('city', 'City', b.city || '', 'text');
  addField('state', 'State', b.state || '', 'text');
  addField('zip', 'ZIP', b.zip || '', 'text');
  addField('description', 'Description', b.description || '', 'textarea');
  addField('listing_type', 'Listing Type', { selected: b.listing_type || 'lease', options: [{ value: 'lease', label: 'Lease' }, { value: 'sale', label: 'Sale' }] }, 'select');
  addField('asking_price', 'Asking Price', b.asking_price || '', 'text');
  addField('broker', 'Broker', b.broker || '', 'text');

  if (isEdit) $('field-building_id').readOnly = true;

  $('modal-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {};
    ['building_id','building_name','address','city','state','zip','description','listing_type','asking_price','broker'].forEach(f => {
      data[f] = getFieldVal(f);
    });
    await submitChange(isEdit ? 'edit' : 'add', 'Buildings', data.building_id, data);
  };
}

function openSuiteForm(suiteId) {
  const isEdit = !!suiteId;
  const s = isEdit ? suites.find(x => x.suite_id === suiteId) : {};
  openModal(isEdit ? 'Edit Suite' : 'Add Suite');

  const bldgOpts = buildings.map(b => ({ value: b.building_id, label: b.building_name }));
  addField('suite_id', 'Suite ID', s.suite_id || '', 'text');
  addField('building_id', 'Building', { selected: s.building_id || '', options: [{ value: '', label: '— Select —' }, ...bldgOpts] }, 'select');
  addField('suite_number', 'Suite Number', s.suite_number || '', 'text');
  addField('floor', 'Floor', s.floor || '', 'text');
  addField('square_feet', 'Square Feet', s.square_feet || '', 'text');
  addField('lease_rate', 'Lease Rate', s.lease_rate || '', 'text');
  addField('rate_unit', 'Rate Unit', s.rate_unit || '/SF/yr', 'text');
  addField('status', 'Status', { selected: s.status || 'Available', options: [{ value: 'Available', label: 'Available' }, { value: 'Pending', label: 'Pending' }, { value: 'Leased', label: 'Leased' }] }, 'select');
  addField('available_date', 'Available Date', s.available_date || '', 'date');
  addField('notes', 'Notes', s.notes || '', 'textarea');

  if (isEdit) $('field-suite_id').readOnly = true;

  $('modal-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {};
    ['suite_id','building_id','suite_number','floor','square_feet','lease_rate','rate_unit','status','available_date','notes'].forEach(f => {
      data[f] = getFieldVal(f);
    });
    await submitChange(isEdit ? 'edit' : 'add', 'Suites', data.suite_id, data);
  };
}

function openContactForm(contactName) {
  const isEdit = !!contactName;
  const c = isEdit ? contacts.find(x => x.name === contactName) : {};
  openModal(isEdit ? 'Edit Contact' : 'Add Contact');

  addField('name', 'Name', c.name || '', 'text');
  addField('title', 'Title', c.title || '', 'text');
  addField('phone', 'Phone', c.phone || '', 'tel');
  addField('email', 'Email', c.email || '', 'email');

  if (isEdit) $('field-name').readOnly = true;

  $('modal-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {};
    ['name','title','phone','email'].forEach(f => {
      data[f] = getFieldVal(f);
    });
    await submitChange(isEdit ? 'edit' : 'add', 'Contacts', data.name, data);
  };
}

// --- Submit change (owner modal) ---
async function submitChange(changeType, targetTab, targetId, data) {
  const result = await API.callApi('submitChange', {
    password: ADMIN_CONFIG.DEMO_MODE ? (currentRole === 'owner' ? 'owner123' : 'broker123') : '',
    changeType,
    targetTab,
    targetId,
    changeData: JSON.stringify(data),
    submittedBy: currentUser,
  });

  if (result.success) {
    showToast('Change submitted for review', 'success');
    closeModal();
    await loadAllData();
  } else {
    showToast(result.error || 'Failed to submit', 'error');
  }
}

async function submitRemove(targetTab, targetId, displayName) {
  if (!confirm('Submit a request to remove "' + displayName + '"?')) return;
  await submitChange('remove', targetTab, targetId, {});
}

// --- Owner: approve/deny ---
async function handleApprove(changeId) {
  const result = await API.callApi('approveChange', {
    password: ADMIN_CONFIG.DEMO_MODE ? 'owner123' : '',
    changeId,
  });
  if (result.success) {
    showToast('Change approved', 'success');
    await loadAllData();
  } else {
    showToast(result.error || 'Failed', 'error');
  }
}

async function handleDeny(changeId) {
  if (!confirm('Deny this change?')) return;
  const result = await API.callApi('denyChange', {
    password: ADMIN_CONFIG.DEMO_MODE ? 'owner123' : '',
    changeId,
  });
  if (result.success) {
    showToast('Change denied', 'success');
    await loadAllData();
  } else {
    showToast(result.error || 'Failed', 'error');
  }
}

// --- Deep-link highlight ---
function highlightPendingCard(changeId) {
  setTimeout(() => {
    const cards = document.querySelectorAll('.pending-card');
    cards.forEach(card => {
      if (card.innerHTML.includes(changeId)) {
        card.style.boxShadow = '0 0 0 3px var(--brand)';
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, 100);
}

// --- Toast ---
function showToast(msg, type) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.className = 'toast visible ' + (type || '');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.className = 'toast', 3000);
}

// --- Util ---
function esc(str) {
  if (str == null) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
