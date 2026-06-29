// --- State ---
let currentRole = null;
let currentUser = '';
let buildings = [];
let suites = [];
let contacts = [];
let pending = [];

// --- DOM refs ---
const $ = id => document.getElementById(id);

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

function enterApp() {
  $('page-login').classList.remove('active');
  $('app-shell').style.display = '';
  $('user-name').textContent = currentUser + ' (' + currentRole + ')';
  document.body.className = 'role-' + currentRole;
  loadAllData();
  navigateTo('dashboard');
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

  if (currentRole === 'admin') {
    const p = await API.callApi('getPending', { password: API.getSession()?.password || (ADMIN_CONFIG.DEMO_MODE ? 'admin123' : '') });
    pending = p.success ? p.data : [];
  }

  renderDashboard();
  renderBuildings();
  renderSuites();
  renderContacts();
  if (currentRole === 'admin') renderPending();
}

// --- Dashboard ---
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

// --- Buildings table ---
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

// --- Suites table ---
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

// --- Contacts table ---
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

// --- Pending changes ---
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

  list.innerHTML = pendingItems.map(p => {
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
  }).join('');
}

// --- Modal / Forms ---
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
    // value = { selected, options: [{value,label}] }
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

// --- Building form ---
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

// --- Suite form ---
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

// --- Contact form ---
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

// --- Submit change ---
async function submitChange(changeType, targetTab, targetId, data) {
  const result = await API.callApi('submitChange', {
    password: ADMIN_CONFIG.DEMO_MODE ? (currentRole === 'admin' ? 'admin123' : 'broker123') : '',
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

// --- Admin actions ---
async function handleApprove(changeId) {
  const result = await API.callApi('approveChange', {
    password: ADMIN_CONFIG.DEMO_MODE ? 'admin123' : '',
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
    password: ADMIN_CONFIG.DEMO_MODE ? 'admin123' : '',
    changeId,
  });
  if (result.success) {
    showToast('Change denied', 'success');
    await loadAllData();
  } else {
    showToast(result.error || 'Failed', 'error');
  }
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
