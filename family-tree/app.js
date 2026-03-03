/* ============================================================
   FAMILY TREE GENERATOR — app.js
   ============================================================ */

// ── Data Store ──────────────────────────────────────────────
let people = [];
let nextId  = 1;
let editingId = null;
let pendingDeleteId = null;

// ── Firebase ─────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyAsYZ0sbusitUQ5YkBnJ8rL4TySXsiu7uE',
  authDomain:        'estradasphere-55a3c.firebaseapp.com',
  databaseURL:       'https://estradasphere-55a3c-default-rtdb.firebaseio.com',
  projectId:         'estradasphere-55a3c',
  storageBucket:     'estradasphere-55a3c.firebasestorage.app',
  messagingSenderId: '632911162499',
  appId:             '1:632911162499:web:5c7febd7495b94cf04bfb6',
  measurementId:     'G-E0WZYPLKZ0'
};
let treeRef = null; // Firebase Realtime Database reference

function initFirebase() {
  firebase.initializeApp(FIREBASE_CONFIG);
  const db = firebase.database();
  treeRef = db.ref('familyTree');

  // Real-time listener — fires on page load AND whenever any user saves a change
  treeRef.on('value', snapshot => {
    const data = snapshot.val();
    if (data && Array.isArray(data.people)) {
      people = data.people.map(migratePersonData);
      nextId  = data.nextId || (Math.max(0, ...people.map(p => p.id)) + 1);
    } else {
      people = [];
      nextId  = 1;
    }
    autoFitted = false; // allow fit-to-view to run again after new data
    renderTree();
    renderPeopleGrid();
  }, err => {
    console.error('Firebase read error:', err);
  });
}

function saveToFirebase() {
  if (!treeRef) return;
  treeRef.set({ people, nextId }).catch(err => {
    console.error('Firebase save failed:', err);
    alert('⚠️ Save failed. Check your internet connection and try again.');
  });
}

/** Migrate old single-name format to new firstName/lastName fields */
function migratePersonData(p) {
  if (!p.firstName && p.name) {
    const cleaned = p.name.replace(/\[née [^\]]+\]/g, '').trim();
    const parts   = cleaned.split(/\s+/);
    p.firstName  = parts[0] || '';
    p.middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : (p.middleName || '');
    p.lastName   = parts.length > 1 ? parts[parts.length - 1] : (p.lastName || '');
    p.maidenName = p.maidenName || p.nickname || '';
    p.otherNames = p.otherNames || '';
  }
  if (!p.parents)  p.parents  = [];
  if (!p.spouses)  p.spouses  = [];
  if (!p.children) p.children = [];
  return p;
}

// ── Relationship chip state ──────────────────────────────────
// Tracks which person IDs are selected for each relationship type
const relState = {
  parents:  new Set(),
  spouses:  new Set(),
  children: new Set()
};

// ── Layout State ────────────────────────────────────────────
let transform  = { x: 0, y: 0, scale: 1 };
let autoFitted = false; // tracks whether fit-to-view has run after latest data load
const NODE_W  = 160;
const NODE_H  = 200;
const H_GAP   = 40;
const V_GAP   = 90;

// ── Month names ──────────────────────────────────────────────
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL  = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

// ── DOM References ──────────────────────────────────────────
const treeCanvas   = document.getElementById('treeCanvas');
const treeSvg      = document.getElementById('treeSvg');
const svgLines     = document.getElementById('svgLines');
const treeWrapper  = document.getElementById('treeWrapper');
const treeEmpty    = document.getElementById('treeEmpty');
const peopleGrid   = document.getElementById('peopleGrid');
const peopleEmpty  = document.getElementById('peopleEmpty');
const glossaryBody = document.getElementById('glossaryBody');

// Main modal
const personModal      = document.getElementById('personModal');
const modalTitle       = document.getElementById('modalTitle');
const deleteModal      = document.getElementById('deleteModal');
const deletePersonName = document.getElementById('deletePersonName');

// Quick-add sub-modal
const quickAddModal  = document.getElementById('quickAddModal');
const quickAddTitle  = document.getElementById('quickAddTitle');
const quickAddHint   = document.getElementById('quickAddHint');
const qaFirstName    = document.getElementById('qaFirstName');
const qaLastName     = document.getElementById('qaLastName');
const qaGender       = document.getElementById('qaGender');
let   quickAddRelType = null; // which relationship we're quick-adding for

// Form — Name fields
const fieldFirstName  = document.getElementById('fieldFirstName');
const fieldMiddleName = document.getElementById('fieldMiddleName');
const fieldMaidenName = document.getElementById('fieldMaidenName');
const fieldLastName   = document.getElementById('fieldLastName');
const fieldOtherNames = document.getElementById('fieldOtherNames');

// Form — Date fields
const fieldBirthDay   = document.getElementById('fieldBirthDay');
const fieldBirthMonth = document.getElementById('fieldBirthMonth');
const fieldBirthYear  = document.getElementById('fieldBirthYear');
const fieldDeathDay   = document.getElementById('fieldDeathDay');
const fieldDeathMonth = document.getElementById('fieldDeathMonth');
const fieldDeathYear  = document.getElementById('fieldDeathYear');

// Form — Other
const fieldGender     = document.getElementById('fieldGender');
const fieldBirthplace = document.getElementById('fieldBirthplace');
const fieldBio        = document.getElementById('fieldBio');

// Photo
const photoUploadArea  = document.getElementById('photoUploadArea');
const photoPreview     = document.getElementById('photoPreview');
const photoPlaceholder = document.getElementById('photoPlaceholder');
const photoInput       = document.getElementById('photoInput');

// Location autocomplete
const birthplaceDropdown = document.getElementById('birthplaceDropdown');

// Detail panel
const detailPanel     = document.getElementById('detailPanel');
const detailPhoto     = document.getElementById('detailPhoto');
const detailAvatar    = document.getElementById('detailAvatar');
const detailName      = document.getElementById('detailName');
const detailNickname  = document.getElementById('detailNickname');
const detailDates     = document.getElementById('detailDates');
const detailBirthplace = document.getElementById('detailBirthplace');
const detailBio       = document.getElementById('detailBio');
const detailRels      = document.getElementById('detailRels');

let currentPhotoData = null;

// ── Day dropdown population ──────────────────────────────────
function populateDaySelect(select) {
  while (select.options.length > 1) select.remove(1);
  for (let d = 1; d <= 31; d++) {
    const o = document.createElement('option');
    o.value = String(d).padStart(2, '0');
    o.textContent = d;
    select.appendChild(o);
  }
}

// ── Date helpers ─────────────────────────────────────────────
function buildDateString(day, month, year) {
  const parts = [];
  if (day)   parts.push(parseInt(day, 10));
  if (month) parts.push(MONTHS_SHORT[parseInt(month, 10) - 1]);
  if (year)  parts.push(year);
  return parts.join(' ');
}

function parseDateString(str) {
  if (!str) return { day: '', month: '', year: '' };
  const tokens = str.trim().split(/\s+/);
  let day = '', month = '', year = '';
  tokens.forEach(tok => {
    const asNum = parseInt(tok, 10);
    if (!isNaN(asNum)) {
      if (asNum > 31) year = String(asNum);
      else if (asNum >= 1 && asNum <= 31 && !day) day = String(asNum).padStart(2, '0');
    } else {
      const idx = MONTHS_SHORT.findIndex(m => m.toLowerCase() === tok.toLowerCase());
      if (idx !== -1) month = String(idx + 1).padStart(2, '0');
      else {
        const idx2 = MONTHS_FULL.findIndex(m => m.toLowerCase() === tok.toLowerCase());
        if (idx2 !== -1) month = String(idx2 + 1).padStart(2, '0');
      }
    }
  });
  return { day, month, year };
}

function setDateFields(daySel, monthSel, yearInput, dateStr) {
  const { day, month, year } = parseDateString(dateStr);
  daySel.value    = day;
  monthSel.value  = month;
  yearInput.value = year;
}

function clearDateFields(daySel, monthSel, yearInput) {
  daySel.value    = '';
  monthSel.value  = '';
  yearInput.value = '';
}

// ── Name helpers ─────────────────────────────────────────────
function buildDisplayName(p) {
  const parts = [];
  if (p.firstName)  parts.push(p.firstName);
  if (p.middleName) parts.push(p.middleName);
  if (p.maidenName) parts.push(`[née ${p.maidenName}]`);
  if (p.lastName)   parts.push(p.lastName);
  return parts.join(' ') || p.name || '(No Name)';
}

function buildShortName(p) {
  const parts = [];
  if (p.firstName) parts.push(p.firstName);
  if (p.lastName)  parts.push(p.lastName);
  if (parts.length === 0 && p.name) return p.name;
  return parts.join(' ') || '(No Name)';
}

// ── Photo Compression ────────────────────────────────────────
/**
 * Resize & compress an image file to max 200×200px JPEG at 70% quality.
 * Reduces a typical phone photo from 3 MB → ~30 KB.
 */
function compressImage(file, callback) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const MAX = 200;
      let { width, height } = img;
      if (width > height) {
        if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
      } else {
        if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── Utilities ────────────────────────────────────────────────
function uid() { return nextId++; }
function getPerson(id) { return people.find(p => p.id === id); }
function genderEmoji(g) {
  if (g === 'male')   return '👨';
  if (g === 'female') return '👩';
  return '🧑';
}
function formatDates(p) {
  if (!p.birth && !p.death) return '';
  const b = p.birth || '?';
  if (p.death) return `${b} – ${p.death}`;
  return `b. ${b}`;
}

// ── Relationship label helpers ────────────────────────────────
const REL_LABELS = {
  parents:  'Parent',
  spouses:  'Spouse / Partner',
  children: 'Child'
};

// ── Chip-based Relationship Selectors ────────────────────────

/** Render chips for a relationship type from relState */
function renderRelChips(relType) {
  const container = document.getElementById(`relChips-${relType}`);
  container.innerHTML = '';
  relState[relType].forEach(id => {
    const p = getPerson(id);
    if (!p) return;
    const chip = document.createElement('span');
    chip.className = 'rel-chip-selected';
    chip.innerHTML = `${genderEmoji(p.gender)} ${buildShortName(p)} <button class="chip-remove" data-id="${id}" data-rel="${relType}" title="Remove">✕</button>`;
    chip.querySelector('.chip-remove').addEventListener('click', e => {
      e.stopPropagation();
      const rmId = parseInt(e.currentTarget.dataset.id);
      relState[relType].delete(rmId);
      renderRelChips(relType);
    });
    container.appendChild(chip);
  });
}

/** Initialize searchable dropdown for a relationship type */
function initRelSearch(relType) {
  const input    = document.getElementById(`relSearch-${relType}`);
  const dropdown = document.getElementById(`relDropdown-${relType}`);
  let debounce   = null;

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => renderRelSearchResults(relType), 150);
  });

  input.addEventListener('focus', () => renderRelSearchResults(relType));

  input.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('.rel-search-option');
    const active = dropdown.querySelector('.rel-search-option.active');
    let idx = active ? parseInt(active.dataset.idx) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(idx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
    } else if (e.key === 'Enter' && active) {
      e.preventDefault();
      const selId = parseInt(active.dataset.id);
      addRelChip(relType, selId);
      input.value = '';
      dropdown.innerHTML = '';
      dropdown.style.display = 'none';
      return;
    } else if (e.key === 'Escape') {
      dropdown.innerHTML = '';
      dropdown.style.display = 'none';
      return;
    } else { return; }

    items.forEach(el => el.classList.remove('active'));
    if (idx >= 0) {
      items[idx].classList.add('active');
      items[idx].scrollIntoView({ block: 'nearest' });
    }
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest(`#relSelector-${relType}`)) {
      dropdown.innerHTML = '';
      dropdown.style.display = 'none';
    }
  });
}

function renderRelSearchResults(relType) {
  const input    = document.getElementById(`relSearch-${relType}`);
  const dropdown = document.getElementById(`relDropdown-${relType}`);
  const q        = input.value.trim().toLowerCase();

  // Filter: exclude self, exclude already-selected
  const candidates = people.filter(p => {
    if (p.id === editingId) return false;
    if (relState[relType].has(p.id)) return false;
    if (!q) return true;
    return buildShortName(p).toLowerCase().includes(q) ||
           buildDisplayName(p).toLowerCase().includes(q);
  });

  dropdown.innerHTML = '';
  if (candidates.length === 0) {
    dropdown.style.display = 'none';
    return;
  }

  candidates.slice(0, 8).forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'rel-search-option';
    li.dataset.id  = p.id;
    li.dataset.idx = i;
    const dates = p.birth ? ` · b. ${p.birth}` : '';
    li.innerHTML = `<span class="rel-opt-emoji">${genderEmoji(p.gender)}</span>
                    <span class="rel-opt-name">${buildShortName(p)}</span>
                    <span class="rel-opt-dates">${dates}</span>`;
    li.addEventListener('mousedown', e => {
      e.preventDefault();
      addRelChip(relType, p.id);
      input.value = '';
      dropdown.innerHTML = '';
      dropdown.style.display = 'none';
    });
    dropdown.appendChild(li);
  });
  dropdown.style.display = 'block';
}

function addRelChip(relType, id) {
  relState[relType].add(id);
  renderRelChips(relType);
}

/** Populate all three chip selectors from a person's existing data */
function populateRelSelectors(excludeId, p) {
  ['parents', 'spouses', 'children'].forEach(relType => {
    relState[relType].clear();
    if (p && p[relType]) {
      p[relType].forEach(id => {
        if (id !== excludeId) relState[relType].add(id);
      });
    }
    renderRelChips(relType);
    // Clear search inputs/dropdowns
    const input = document.getElementById(`relSearch-${relType}`);
    const dropdown = document.getElementById(`relDropdown-${relType}`);
    if (input) input.value = '';
    if (dropdown) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; }
  });
}

// ── Quick-Add Sub-Modal ───────────────────────────────────────
function openQuickAdd(relType) {
  quickAddRelType = relType;
  const label = REL_LABELS[relType];
  quickAddTitle.textContent = `Quick Add ${label}`;
  quickAddHint.innerHTML = `Will be linked as: <strong>${label}</strong>`;
  qaFirstName.value = '';
  qaLastName.value  = '';
  qaGender.value    = '';
  quickAddModal.classList.remove('hidden');
  qaFirstName.focus();
}

function closeQuickAdd() {
  quickAddModal.classList.add('hidden');
  quickAddRelType = null;
}

function saveQuickAdd() {
  const firstName = qaFirstName.value.trim();
  if (!firstName) {
    qaFirstName.focus();
    qaFirstName.style.borderColor = '#ef4444';
    return;
  }
  qaFirstName.style.borderColor = '';

  const lastName = qaLastName.value.trim();
  const gender   = qaGender.value;

  const id = uid();
  const newPerson = {
    id,
    firstName, middleName: '', maidenName: '', lastName, otherNames: '',
    name: [firstName, lastName].filter(Boolean).join(' '),
    birth: '', death: '',
    gender,
    birthplace: '', bio: '',
    photo: null,
    parents: [], spouses: [], children: []
  };
  people.push(newPerson);

  // Link into the current relState
  if (quickAddRelType) {
    addRelChip(quickAddRelType, id);
  }

  closeQuickAdd();
}

// ── Tab Switching ────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tab-' + tab).classList.add('active');
      if (tab === 'tree') renderTree();
    });
  });
}

// ── Main Modal ───────────────────────────────────────────────
function openAddModal() {
  editingId = null;
  currentPhotoData = null;
  modalTitle.textContent = 'Add Person';

  fieldFirstName.value  = '';
  fieldMiddleName.value = '';
  fieldMaidenName.value = '';
  fieldLastName.value   = '';
  fieldOtherNames.value = '';

  clearDateFields(fieldBirthDay, fieldBirthMonth, fieldBirthYear);
  clearDateFields(fieldDeathDay, fieldDeathMonth, fieldDeathYear);

  fieldGender.value     = '';
  fieldBirthplace.value = '';
  fieldBio.value        = '';

  photoPreview.src = '';
  photoPreview.style.display = 'none';
  photoPlaceholder.style.display = 'flex';
  document.getElementById('deletePersonBtn').style.display = 'none';

  populateRelSelectors(null, null);
  personModal.classList.remove('hidden');
  fieldFirstName.focus();
}

function openEditModal(id) {
  const p = getPerson(id);
  if (!p) return;
  editingId = id;
  currentPhotoData = p.photo || null;
  modalTitle.textContent = 'Edit Person';

  fieldFirstName.value  = p.firstName  || '';
  fieldMiddleName.value = p.middleName || '';
  fieldMaidenName.value = p.maidenName || '';
  fieldLastName.value   = p.lastName   || '';
  fieldOtherNames.value = p.otherNames || '';

  setDateFields(fieldBirthDay, fieldBirthMonth, fieldBirthYear, p.birth || '');
  setDateFields(fieldDeathDay, fieldDeathMonth, fieldDeathYear, p.death || '');

  fieldGender.value     = p.gender     || '';
  fieldBirthplace.value = p.birthplace || '';
  fieldBio.value        = p.bio        || '';

  if (p.photo) {
    photoPreview.src = p.photo;
    photoPreview.style.display = 'block';
    photoPlaceholder.style.display = 'none';
  } else {
    photoPreview.src = '';
    photoPreview.style.display = 'none';
    photoPlaceholder.style.display = 'flex';
  }
  document.getElementById('deletePersonBtn').style.display = 'inline-flex';

  populateRelSelectors(id, p);
  personModal.classList.remove('hidden');
  fieldFirstName.focus();
}

function closeModal() {
  personModal.classList.add('hidden');
  editingId = null;
  currentPhotoData = null;
  birthplaceDropdown.innerHTML = '';
  birthplaceDropdown.style.display = 'none';
  // Clear all rel dropdowns
  ['parents','spouses','children'].forEach(rt => {
    const dd = document.getElementById(`relDropdown-${rt}`);
    if (dd) { dd.innerHTML = ''; dd.style.display = 'none'; }
  });
}

function savePerson() {
  const firstName = fieldFirstName.value.trim();
  if (!firstName) {
    fieldFirstName.focus();
    fieldFirstName.style.borderColor = '#ef4444';
    return;
  }
  fieldFirstName.style.borderColor = '';

  const middleName = fieldMiddleName.value.trim();
  const maidenName = fieldMaidenName.value.trim();
  const lastName   = fieldLastName.value.trim();
  const otherNames = fieldOtherNames.value.trim();

  const birth = buildDateString(fieldBirthDay.value, fieldBirthMonth.value, fieldBirthYear.value);
  const death = buildDateString(fieldDeathDay.value, fieldDeathMonth.value, fieldDeathYear.value);

  const parents  = [...relState.parents];
  const spouses  = [...relState.spouses];
  const children = [...relState.children];

  if (editingId === null) {
    const id = uid();
    const person = {
      id,
      firstName, middleName, maidenName, lastName, otherNames,
      name: buildDisplayName({ firstName, middleName, maidenName, lastName }),
      birth, death,
      gender: fieldGender.value,
      birthplace: fieldBirthplace.value.trim(),
      bio: fieldBio.value.trim(),
      photo: currentPhotoData,
      parents, spouses, children
    };
    people.push(person);
    syncRelationships(id, parents, spouses, children);
  } else {
    const p = getPerson(editingId);
    p.firstName  = firstName;
    p.middleName = middleName;
    p.maidenName = maidenName;
    p.lastName   = lastName;
    p.otherNames = otherNames;
    p.name = buildDisplayName({ firstName, middleName, maidenName, lastName });
    p.birth = birth;
    p.death = death;
    p.gender = fieldGender.value;
    p.birthplace = fieldBirthplace.value.trim();
    p.bio = fieldBio.value.trim();
    p.photo = currentPhotoData;
    p.parents = parents;
    p.spouses = spouses;
    p.children = children;
    syncRelationships(editingId, parents, spouses, children);
  }

  closeModal();
  saveToFirebase();
}

// Keep relationships two-way consistent
function syncRelationships(id, parents, spouses, children) {
  people.forEach(p => {
    if (p.id === id) return;
    if (parents.includes(p.id)) {
      if (!(p.children || []).includes(id)) p.children = [...(p.children || []), id];
    } else {
      p.children = (p.children || []).filter(c => c !== id);
    }
    if (spouses.includes(p.id)) {
      if (!(p.spouses || []).includes(id)) p.spouses = [...(p.spouses || []), id];
    } else {
      p.spouses = (p.spouses || []).filter(s => s !== id);
    }
    if (children.includes(p.id)) {
      if (!(p.parents || []).includes(id)) p.parents = [...(p.parents || []), id];
    } else {
      p.parents = (p.parents || []).filter(par => par !== id);
    }
  });
}

// ── Delete ───────────────────────────────────────────────────
function promptDelete(id) {
  pendingDeleteId = id;
  const p = getPerson(id);
  deletePersonName.textContent = p ? buildDisplayName(p) : 'this person';
  closeModal();
  deleteModal.classList.remove('hidden');
}

function confirmDelete() {
  if (pendingDeleteId === null) return;
  const id = pendingDeleteId;
  people.forEach(p => {
    p.parents   = (p.parents  || []).filter(x => x !== id);
    p.spouses   = (p.spouses  || []).filter(x => x !== id);
    p.children  = (p.children || []).filter(x => x !== id);
  });
  people = people.filter(p => p.id !== id);
  pendingDeleteId = null;
  deleteModal.classList.add('hidden');
  closeDetail();
  saveToFirebase();
}

// ── Detail Panel ─────────────────────────────────────────────
function showDetail(id) {
  const p = getPerson(id);
  if (!p) return;

  if (p.photo) {
    detailPhoto.src = p.photo;
    detailPhoto.style.display = 'block';
    detailAvatar.style.display = 'none';
  } else {
    detailPhoto.style.display = 'none';
    detailAvatar.textContent = genderEmoji(p.gender);
    detailAvatar.style.display = 'flex';
  }

  detailName.textContent = buildDisplayName(p);
  const nickStr = p.otherNames ? `also known as: ${p.otherNames}` : (p.nickname ? `"${p.nickname}"` : '');
  detailNickname.textContent = nickStr;
  detailNickname.style.display = nickStr ? '' : 'none';

  detailDates.textContent = formatDates(p);
  detailBirthplace.textContent = p.birthplace ? `📍 ${p.birthplace}` : '';
  detailBio.textContent = p.bio || '';
  detailBio.style.display = p.bio ? 'block' : 'none';

  detailRels.innerHTML = '';
  const addGroup = (label, ids) => {
    if (!ids || ids.length === 0) return;
    const grp = document.createElement('div');
    grp.className = 'detail-rel-group';
    grp.innerHTML = `<div class="detail-rel-label">${label}</div><div class="detail-rel-chips"></div>`;
    const chips = grp.querySelector('.detail-rel-chips');
    ids.forEach(rid => {
      const rel = getPerson(rid);
      if (!rel) return;
      const chip = document.createElement('span');
      chip.className = 'rel-chip';
      chip.textContent = genderEmoji(rel.gender) + ' ' + buildShortName(rel);
      chip.addEventListener('click', () => showDetail(rid));
      chips.appendChild(chip);
    });
    detailRels.appendChild(grp);
  };
  addGroup('Parents', p.parents);
  addGroup('Spouse / Partner', p.spouses);
  addGroup('Children', p.children);

  if (p.parents && p.parents.length > 0) {
    const siblingIds = new Set();
    p.parents.forEach(pid => {
      const par = getPerson(pid);
      if (par && par.children) par.children.forEach(cid => { if (cid !== id) siblingIds.add(cid); });
    });
    addGroup('Siblings', [...siblingIds]);
  }

  // Relationship finder widget (only useful when there are ≥2 people)
  if (people.length >= 2) initRelFinder(id);

  document.getElementById('detailEditBtn').onclick = () => openEditModal(id);
  detailPanel.classList.remove('hidden');
}

function closeDetail() {
  detailPanel.classList.add('hidden');
}

// ── People Tab ───────────────────────────────────────────────
function renderPeopleGrid() {
  peopleGrid.innerHTML = '';
  if (people.length === 0) {
    peopleEmpty.classList.remove('hidden');
    return;
  }
  peopleEmpty.classList.add('hidden');

  const sorted = [...people].sort((a, b) => buildDisplayName(a).localeCompare(buildDisplayName(b)));
  sorted.forEach(p => {
    const displayName = buildDisplayName(p);
    const shortName   = buildShortName(p);
    const card = document.createElement('div');
    card.className = `people-card${p.gender ? ' ' + p.gender : ''}`;
    card.innerHTML = p.photo
      ? `<img class="card-photo" src="${p.photo}" alt="${shortName}"/>`
      : `<div class="card-avatar">${genderEmoji(p.gender)}</div>`;
    const dates = formatDates(p);
    const otherLabel = p.otherNames
      ? `<br/><span style="font-weight:400;font-style:italic;font-size:.73rem">${p.otherNames}</span>` : '';
    card.innerHTML += `
      <div class="card-name">${displayName}${otherLabel}</div>
      ${dates ? `<div class="card-dates">${dates}</div>` : ''}
      <div class="card-actions">
        <button class="btn btn-secondary btn-sm" data-view="${p.id}">View</button>
        <button class="btn btn-primary btn-sm" data-edit="${p.id}">Edit</button>
      </div>`;
    card.querySelector('[data-view]').addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
      document.querySelector('[data-tab="tree"]').classList.add('active');
      document.getElementById('tab-tree').classList.add('active');
      renderTree();
      showDetail(p.id);
    });
    card.querySelector('[data-edit]').addEventListener('click', e => {
      e.stopPropagation();
      openEditModal(p.id);
    });
    card.addEventListener('click', () => openEditModal(p.id));
    peopleGrid.appendChild(card);
  });
}

// ── Tree Rendering ───────────────────────────────────────────
function layoutTree() {
  if (people.length === 0) return new Map();

  const genMap  = new Map();
  const isolatedIds = new Set();

  // ── Step 1: BFS from roots (people with no parents) ──────
  const roots   = people.filter(p => !p.parents || p.parents.length === 0);
  const queue   = roots.map(r => ({ id: r.id, gen: 0 }));
  const visited = new Set();

  while (queue.length > 0) {
    const { id, gen } = queue.shift();
    if (visited.has(id)) {
      if (gen > genMap.get(id)) genMap.set(id, gen);
      continue;
    }
    visited.add(id);
    genMap.set(id, gen);
    const p = getPerson(id);
    if (p && p.children) p.children.forEach(cid => queue.push({ id: cid, gen: gen + 1 }));
    if (p && p.spouses)  p.spouses.forEach(sid => { if (!visited.has(sid)) queue.push({ id: sid, gen }); });
  }

  // ── Step 2: Infer generation for unvisited people ────────
  // Repeatedly scan reverse-relationships until stable
  let changed = true;
  while (changed) {
    changed = false;
    people.forEach(p => {
      if (genMap.has(p.id)) return;
      let inferredGen = null;

      // Check p's own relationship arrays for already-placed anchors
      (p.parents || []).forEach(pid => {
        if (genMap.has(pid)) {
          const cand = genMap.get(pid) + 1;
          if (inferredGen === null || cand > inferredGen) inferredGen = cand;
        }
      });
      (p.children || []).forEach(cid => {
        if (genMap.has(cid)) {
          const cand = genMap.get(cid) - 1;
          if (inferredGen === null || cand < inferredGen) inferredGen = cand;
        }
      });
      (p.spouses || []).forEach(sid => {
        if (genMap.has(sid) && inferredGen === null) inferredGen = genMap.get(sid);
      });

      // Also scan reverse: other people who reference p
      if (inferredGen === null) {
        people.forEach(other => {
          if (!genMap.has(other.id)) return;
          const og = genMap.get(other.id);
          if ((other.parents   || []).includes(p.id) && inferredGen === null) inferredGen = og - 1;
          if ((other.children  || []).includes(p.id) && inferredGen === null) inferredGen = og + 1;
          if ((other.spouses   || []).includes(p.id) && inferredGen === null) inferredGen = og;
        });
      }

      if (inferredGen !== null) {
        genMap.set(p.id, inferredGen);
        changed = true;
      }
    });
  }

  // ── Step 2.5: Adjust misplaced root nodes ───────────────
  // Roots (no parents in system) are placed at gen 0 by BFS before their
  // children's true generation is known. If a root's children end up at
  // gen N > 1, the root should be at gen N-1, not gen 0.
  // Example: Lenox has no parents, but his daughter Sasha is gen 2 because
  // Sasha has another parent descended from Oscar/Evangeline (gen 0→1→Sasha).
  // So Lenox should be gen 1, not gen 0.
  let adjustMade = true;
  while (adjustMade) {
    adjustMade = false;
    people.forEach(p => {
      // Only adjust people who have no parents recorded (true roots)
      if ((p.parents || []).length > 0) return;
      if (!genMap.has(p.id)) return;
      const childGens = (p.children || [])
        .map(cid => genMap.get(cid))
        .filter(g => g !== undefined);
      if (childGens.length === 0) return;
      const expectedGen = Math.min(...childGens) - 1;
      // Only move DOWN (increase gen number) — never up
      if (expectedGen > genMap.get(p.id)) {
        genMap.set(p.id, expectedGen);
        adjustMade = true;
      }
    });
  }

  // ── Step 3: Mark truly isolated nodes (no relationships) ─
  people.forEach(p => {
    if (!genMap.has(p.id)) {
      const hasAnyRel = (p.parents  || []).length > 0 ||
                        (p.spouses  || []).length > 0 ||
                        (p.children || []).length > 0;
      genMap.set(p.id, 0);
      if (!hasAnyRel) isolatedIds.add(p.id);
    }
  });

  // ── Step 4: Normalize generations so minimum = 0 ─────────
  const minGen = Math.min(...genMap.values());
  if (minGen !== 0) {
    genMap.forEach((gen, id) => genMap.set(id, gen - minGen));
  }

  // ── Step 5: Group by generation ──────────────────────────
  const byGen = new Map();
  genMap.forEach((gen, id) => {
    if (!byGen.has(gen)) byGen.set(gen, []);
    byGen.get(gen).push(id);
  });

  // ── Step 6: Smart column ordering — barycenter method ────────
  // Pulls parents above their children and children below their parents,
  // including non-spouse parents. Then enforces spouse adjacency.
  const genNums = [...byGen.keys()].sort((a, b) => a - b);

  // Run 3 full sweeps (top-down + bottom-up) to converge on good positions
  for (let sweep = 0; sweep < 3; sweep++) {

    // Top-down pass: sort gen N by average column index of its children in gen N+1
    genNums.forEach(gen => {
      const nextGen = gen + 1;
      if (!byGen.has(nextGen)) return;
      const ids     = [...byGen.get(gen)];
      const nextIds = byGen.get(nextGen);

      ids.sort((a, b) => {
        const childrenInNext = id => (getPerson(id)?.children || []).filter(c => nextIds.includes(c));
        const avg = id => {
          const ch = childrenInNext(id);
          return ch.length ? ch.reduce((s, c) => s + nextIds.indexOf(c), 0) / ch.length : null;
        };
        const pa = avg(a), pb = avg(b);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;   // push no-child nodes to the right
        if (pb === null) return -1;
        return pa - pb;
      });
      byGen.set(gen, ids);
    });

    // Bottom-up pass: sort gen N by average column index of its parents in gen N-1
    [...genNums].reverse().forEach(gen => {
      const prevGen = gen - 1;
      if (!byGen.has(prevGen)) return;
      const ids     = [...byGen.get(gen)];
      const prevIds = byGen.get(prevGen);

      ids.sort((a, b) => {
        const parentsInPrev = id => (getPerson(id)?.parents || []).filter(p => prevIds.includes(p));
        const avg = id => {
          const prs = parentsInPrev(id);
          return prs.length ? prs.reduce((s, p) => s + prevIds.indexOf(p), 0) / prs.length : null;
        };
        const pa = avg(a), pb = avg(b);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pa - pb;
      });
      byGen.set(gen, ids);
    });
  }

  // Adjacency pass — keep spouses AND co-parents (share a child) side-by-side
  byGen.forEach((ids, gen) => {
    const ordered = [];
    const placed  = new Set();
    ids.forEach(id => {
      if (placed.has(id)) return;
      placed.add(id);
      ordered.push(id);
      const p = getPerson(id);
      // 1. Keep spouses adjacent
      if (p && p.spouses) {
        p.spouses.forEach(sid => {
          if (ids.includes(sid) && !placed.has(sid)) { placed.add(sid); ordered.push(sid); }
        });
      }
      // 2. Keep co-parents adjacent — two people who share a child but aren't spouses
      //    e.g. Lenox and Sasha are both parents of Mallory → place them next to each other
      if (p && p.children) {
        p.children.forEach(cid => {
          const child = getPerson(cid);
          if (!child) return;
          (child.parents || []).forEach(coParentId => {
            if (coParentId === id) return; // skip self
            if (ids.includes(coParentId) && !placed.has(coParentId)) {
              placed.add(coParentId);
              ordered.push(coParentId);
            }
          });
        });
      }
    });
    byGen.set(gen, ordered);
  });

  // ── Step 7: Calculate pixel positions (family-centred, generation by generation) ──
  // Each generation is laid out family-group by family-group, with every group
  // centred directly below its parents' midpoint.  This guarantees that John's
  // kids, Phaedra's kid, and Sasha+Lenox's kid never interleave in the same row,
  // and that connector bars can't visually span across unrelated children.
  const positions  = new Map();
  const PADDING_TOP  = 60;
  const PADDING_LEFT = 60;
  const FAMILY_GAP   = H_GAP; // extra gap inserted between adjacent family groups

  const genNums2 = [...byGen.keys()].sort((a, b) => a - b);

  genNums2.forEach(gen => {
    const ids = byGen.get(gen);
    const y   = PADDING_TOP + gen * (NODE_H + V_GAP);

    if (gen === 0) {
      // Root generation — simple even distribution left-to-right
      ids.forEach((id, col) => {
        positions.set(id, {
          gen, col, x: PADDING_LEFT + col * (NODE_W + H_GAP), y,
          isolated: isolatedIds.has(id)
        });
      });
      return;
    }

    // Build family groups using already-calculated parent positions
    const familyGroupMap = new Map(); // parentKey → { posParentIds, childIds[] }
    ids.forEach(id => {
      const p = getPerson(id);
      const posParentIds = (p?.parents || [])
        .filter(pid => positions.has(pid))
        .sort((a, b) => a - b);
      const key = posParentIds.join(',') || '__unparented__';
      if (!familyGroupMap.has(key)) {
        familyGroupMap.set(key, { posParentIds, childIds: [] });
      }
      familyGroupMap.get(key).childIds.push(id);
    });

    // Sort groups left-to-right by average parent X, then preserve barycenter order within each
    const groups = [...familyGroupMap.values()]
      .map(group => {
        let avgParentX = null;
        if (group.posParentIds.length > 0) {
          const xs = group.posParentIds
            .map(pid => positions.get(pid))
            .filter(Boolean)
            .map(pp => pp.x + NODE_W / 2);
          if (xs.length) avgParentX = xs.reduce((s, x) => s + x, 0) / xs.length;
        }
        // Keep barycenter order within the group
        group.childIds.sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
        return { ...group, avgParentX };
      })
      .sort((a, b) => (a.avgParentX ?? Infinity) - (b.avgParentX ?? Infinity));

    // Place each group centred under its parents; push right if it would overlap the previous group
    let cursorX = PADDING_LEFT;
    groups.forEach(group => {
      const nKids  = group.childIds.length;
      const groupW = nKids * (NODE_W + H_GAP) - H_GAP;

      let startX = cursorX;
      if (group.avgParentX !== null) {
        startX = Math.round(group.avgParentX - groupW / 2);
      }
      startX = Math.max(startX, cursorX);
      startX = Math.max(startX, PADDING_LEFT);

      group.childIds.forEach((id, ci) => {
        positions.set(id, {
          gen, col: ci,
          x: startX + ci * (NODE_W + H_GAP), y,
          isolated: isolatedIds.has(id)
        });
      });

      cursorX = startX + groupW + H_GAP + FAMILY_GAP;
    });
  });

  return positions;
}

function renderTree() {
  treeCanvas.innerHTML = '';
  svgLines.innerHTML   = '';

  if (people.length === 0) {
    treeEmpty.classList.remove('hidden');
    return;
  }
  treeEmpty.classList.add('hidden');

  const positions = layoutTree();
  drawLines(positions);

  positions.forEach((pos, id) => {
    const p = getPerson(id);
    if (!p) return;
    const node = document.createElement('div');
    node.className = `person-node${p.gender ? ' ' + p.gender : ''}${pos.isolated ? ' isolated' : ''}`;
    node.style.left = pos.x + 'px';
    node.style.top  = pos.y + 'px';
    node.dataset.id = id;

    node.innerHTML = p.photo
      ? `<img class="node-photo" src="${p.photo}" alt="${buildShortName(p)}"/>`
      : `<div class="node-avatar">${genderEmoji(p.gender)}</div>`;

    const dates = formatDates(p);
    node.innerHTML += `
      <div class="node-name">${buildShortName(p)}</div>
      ${dates ? `<div class="node-dates">${dates}</div>` : ''}`;

    node.addEventListener('click', () => showDetail(id));
    treeCanvas.appendChild(node);
  });

  // Auto-fit the first time data loads (not on every manual re-render)
  if (!autoFitted) {
    autoFitted = true;
    setTimeout(fitToView, 0); // defer so DOM has painted the nodes
  }
}

function drawLines(positions) {
  svgLines.innerHTML = '';

  // Helper: create an SVG line element (with optional dash pattern)
  const makeLine = (x1, y1, x2, y2, stroke, width, dash) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    el.setAttribute('x1', x1); el.setAttribute('y1', y1);
    el.setAttribute('x2', x2); el.setAttribute('y2', y2);
    el.setAttribute('stroke', stroke);
    el.setAttribute('stroke-width', width);
    if (dash) el.setAttribute('stroke-dasharray', dash);
    return el;
  };

  // ── Family-unit connector drawing ────────────────────────────
  //
  // Group every child by its set of positioned parents.
  // This ensures co-parents (e.g. Sasha + Lenox) produce exactly ONE
  // combined connector to their shared child, rather than two separate
  // connectors that overlap and look wrong.
  //
  //   Single parent, many children:
  //        John
  //          |
  //     ─────┼─────
  //     |  |  |  |
  //    Am Ka Ri Mo
  //
  //   Two co-parents, one child:
  //     Sasha ♥ Lenox
  //       |        |
  //       +────────+   ← horizontal bar at junctionY
  //            |
  //          Mallory
  //
  const familyMap = new Map(); // parentKey → { parentIds[], childIds[] }

  people.forEach(child => {
    if (!positions.has(child.id)) return;
    // Only include parents that appear in the current layout
    const posParentIds = (child.parents || [])
      .filter(pid => positions.has(pid))
      .sort((a, b) => a - b); // stable sort for consistent key
    if (posParentIds.length === 0) return;

    const key = posParentIds.join(',');
    if (!familyMap.has(key)) {
      familyMap.set(key, { parentIds: posParentIds, childIds: [] });
    }
    familyMap.get(key).childIds.push(child.id);
  });

  familyMap.forEach(({ parentIds, childIds }) => {
    if (childIds.length === 0) return;

    const parentPos = parentIds.map(pid => positions.get(pid));
    const childPos  = childIds .map(cid => positions.get(cid));

    // Junction Y: 20 px below the bottom of the lowest parent box.
    // Using max() handles the rare case of parents at different generations.
    const junctionY = Math.max(...parentPos.map(pp => pp.y + NODE_H)) + 20;

    // ── 1. Vertical stems: each parent's bottom-centre → junctionY ──
    const parentXs = parentPos.map(pp => pp.x + NODE_W / 2);
    parentPos.forEach((pp, i) => {
      svgLines.appendChild(
        makeLine(parentXs[i], pp.y + NODE_H, parentXs[i], junctionY, '#94a3b8', 2)
      );
    });

    // ── 2. Horizontal bar connecting all co-parents at junctionY ────
    //    (for a single parent this bar has zero width and is skipped)
    if (parentXs.length > 1) {
      svgLines.appendChild(
        makeLine(
          Math.min(...parentXs), junctionY,
          Math.max(...parentXs), junctionY,
          '#94a3b8', 2
        )
      );
    }

    // ── 3. Downward connector from midpoint of parents → children ───
    const mergeX   = parentXs.reduce((s, x) => s + x, 0) / parentXs.length;
    const childXs  = childPos.map(cp => cp.x + NODE_W / 2);
    const minCx    = Math.min(...childXs);
    const maxCx    = Math.max(...childXs);

    if (childIds.length === 1) {
      // One child: straight vertical (± a short horizontal jog if needed)
      const cx = childXs[0];
      if (Math.abs(cx - mergeX) > 1) {
        // short horizontal segment at junctionY to align over the child
        svgLines.appendChild(makeLine(mergeX, junctionY, cx, junctionY, '#94a3b8', 2));
      }
      svgLines.appendChild(makeLine(cx, junctionY, cx, childPos[0].y, '#94a3b8', 2));
    } else {
      // Multiple children: horizontal bar spanning them, then vertical drops
      const barMinX = Math.min(mergeX, minCx);
      const barMaxX = Math.max(mergeX, maxCx);
      svgLines.appendChild(makeLine(barMinX, junctionY, barMaxX, junctionY, '#94a3b8', 2));

      childPos.forEach((cp, i) => {
        svgLines.appendChild(makeLine(childXs[i], junctionY, childXs[i], cp.y, '#94a3b8', 2));
      });
    }
  });

  // ── Co-parent dashed connector ───────────────────────────────
  // Two people who share a child but are NOT listed as spouses get a
  // grey dashed line to show they are co-parents (e.g. ex-partner, outside
  // relationship). This is auto-detected — no extra data field needed.
  const drawnCo = new Set();
  people.forEach(p => {
    if (!positions.has(p.id)) return;
    const pPos = positions.get(p.id);
    (p.children || []).forEach(cid => {
      const child = getPerson(cid);
      if (!child) return;
      (child.parents || []).forEach(coId => {
        if (coId === p.id) return;
        if ((p.spouses || []).includes(coId)) return; // already shown as spouse ♥
        const key = [p.id, coId].sort().join('-');
        if (drawnCo.has(key)) return;
        drawnCo.add(key);
        const coPos = positions.get(coId);
        if (!coPos) return;
        // Draw a dashed grey line between the two co-parents at mid-box height
        const y1 = pPos.y + NODE_H / 2;
        const y2 = coPos.y + NODE_H / 2;
        let x1, x2;
        if (pPos.x < coPos.x) { x1 = pPos.x + NODE_W; x2 = coPos.x; }
        else                   { x1 = pPos.x;           x2 = coPos.x + NODE_W; }
        svgLines.appendChild(makeLine(x1, y1, x2, y2, '#94a3b8', 1.5, '6,4'));
        // Small "co-parent" text label at midpoint
        const lx = (x1 + x2) / 2, ly = Math.min(y1, y2) - 4;
        const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txt.setAttribute('x', lx); txt.setAttribute('y', ly);
        txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-size', '9');
        txt.setAttribute('fill', '#94a3b8'); txt.setAttribute('font-style', 'italic');
        txt.textContent = 'co-parent';
        svgLines.appendChild(txt);
      });
    });
  });

  // ── Spouse / partner connector ───────────────────────────────
  const drawnSpouse = new Set();
  people.forEach(p => {
    const pPos = positions.get(p.id);
    if (!pPos) return;
    (p.spouses || []).forEach(sid => {
      const key = [p.id, sid].sort().join('-');
      if (drawnSpouse.has(key)) return;
      drawnSpouse.add(key);
      const sPos = positions.get(sid);
      if (!sPos) return;
      const x1   = pPos.x + NODE_W, y1 = pPos.y + NODE_H / 2;
      const x2   = sPos.x,          y2 = sPos.y + NODE_H / 2;
      const midX = (x1 + x2) / 2,   midY = (y1 + y2) / 2;
      [-3, 3].forEach(offset => {
        svgLines.appendChild(makeLine(x1, y1 + offset, x2, y2 + offset, '#f472b6', 1.5));
      });
      const heart = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      heart.setAttribute('x', midX); heart.setAttribute('y', midY + 5);
      heart.setAttribute('text-anchor', 'middle'); heart.setAttribute('font-size', '14');
      heart.textContent = '♥'; heart.setAttribute('fill', '#f472b6');
      svgLines.appendChild(heart);
    });
  });
}

// ── Pan & Zoom ───────────────────────────────────────────────
function initPanZoom() {
  let isDragging = false, startX, startY;

  treeWrapper.addEventListener('mousedown', e => {
    if (e.target.closest('.person-node')) return;
    isDragging = true;
    startX = e.clientX - transform.x;
    startY = e.clientY - transform.y;
    treeWrapper.classList.add('dragging');
  });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    transform.x = e.clientX - startX;
    transform.y = e.clientY - startY;
    applyTransform();
  });
  window.addEventListener('mouseup', () => { isDragging = false; treeWrapper.classList.remove('dragging'); });

  treeWrapper.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || e.target.closest('.person-node')) return;
    isDragging = true;
    startX = e.touches[0].clientX - transform.x;
    startY = e.touches[0].clientY - transform.y;
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (!isDragging || e.touches.length !== 1) return;
    transform.x = e.touches[0].clientX - startX;
    transform.y = e.touches[0].clientY - startY;
    applyTransform();
  }, { passive: true });
  window.addEventListener('touchend', () => { isDragging = false; });

  treeWrapper.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const rect  = treeWrapper.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    transform.x = mx - (mx - transform.x) * delta;
    transform.y = my - (my - transform.y) * delta;
    transform.scale = Math.min(3, Math.max(0.2, transform.scale * delta));
    applyTransform();
  }, { passive: false });

  document.getElementById('zoomIn').addEventListener('click', () => {
    transform.scale = Math.min(3, transform.scale * 1.2); applyTransform();
  });
  document.getElementById('zoomOut').addEventListener('click', () => {
    transform.scale = Math.max(0.2, transform.scale / 1.2); applyTransform();
  });
  document.getElementById('zoomReset').addEventListener('click', () => {
    transform = { x: 40, y: 20, scale: 1 }; applyTransform();
  });
}

function applyTransform() {
  const t = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
  treeCanvas.style.transform = t;
  treeSvg.style.transform    = t;
  treeSvg.style.transformOrigin = '0 0';
}

// ── Fit to View ──────────────────────────────────────────────
/**
 * Scale + pan the tree so all nodes fit inside the visible viewport.
 * Reads node positions directly from the rendered DOM so it always works.
 */
function fitToView() {
  const nodes = treeCanvas.querySelectorAll('.person-node');
  if (nodes.length === 0) return;

  const wrapperRect = treeWrapper.getBoundingClientRect();
  const PADDING = 50;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(node => {
    const x = parseFloat(node.style.left) || 0;
    const y = parseFloat(node.style.top)  || 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + NODE_W);
    maxY = Math.max(maxY, y + NODE_H);
  });

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  if (contentW === 0 || contentH === 0) return;

  const scaleX = (wrapperRect.width  - PADDING * 2) / contentW;
  const scaleY = (wrapperRect.height - PADDING * 2) / contentH;
  const newScale = Math.min(scaleX, scaleY, 1.4);

  transform.scale = Math.max(0.15, newScale);
  transform.x = (wrapperRect.width  - contentW * transform.scale) / 2 - minX * transform.scale;
  transform.y = (wrapperRect.height - contentH * transform.scale) / 2 - minY * transform.scale;
  applyTransform();
}

// ── Tree Search ───────────────────────────────────────────────
function initTreeSearch() {
  const input    = document.getElementById('treeSearch');
  const dropdown = document.getElementById('treeSearchDropdown');
  let debounce   = null;

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => renderTreeSearchResults(), 150);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim()) renderTreeSearchResults();
  });

  input.addEventListener('keydown', e => {
    const items  = dropdown.querySelectorAll('.tree-search-option');
    const active = dropdown.querySelector('.tree-search-option.active');
    let idx = active ? parseInt(active.dataset.idx) : -1;

    if (e.key === 'ArrowDown')  { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); idx = Math.max(idx - 1, 0); }
    else if (e.key === 'Enter' && active) {
      e.preventDefault();
      jumpToNode(parseInt(active.dataset.id));
      clearTreeSearch();
      return;
    } else if (e.key === 'Escape') {
      clearTreeSearch();
      return;
    } else return;

    items.forEach(el => el.classList.remove('active'));
    if (idx >= 0) { items[idx].classList.add('active'); items[idx].scrollIntoView({ block: 'nearest' }); }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.tree-search-wrap')) {
      dropdown.innerHTML = '';
      dropdown.style.display = 'none';
    }
  });
}

function renderTreeSearchResults() {
  const input    = document.getElementById('treeSearch');
  const dropdown = document.getElementById('treeSearchDropdown');
  const q        = input.value.trim().toLowerCase();

  // Clear previous highlights
  treeCanvas.querySelectorAll('.person-node.search-highlight').forEach(el =>
    el.classList.remove('search-highlight')
  );

  if (!q || people.length === 0) {
    dropdown.innerHTML = '';
    dropdown.style.display = 'none';
    return;
  }

  const matches = people.filter(p =>
    buildShortName(p).toLowerCase().includes(q) ||
    buildDisplayName(p).toLowerCase().includes(q)
  );

  // Highlight all matches in tree
  matches.forEach(p => {
    const node = treeCanvas.querySelector(`[data-id="${p.id}"]`);
    if (node) node.classList.add('search-highlight');
  });

  dropdown.innerHTML = '';
  if (matches.length === 0) { dropdown.style.display = 'none'; return; }

  matches.slice(0, 10).forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'tree-search-option';
    li.dataset.id  = p.id;
    li.dataset.idx = i;
    const dates = p.birth ? ` · b. ${p.birth}` : '';
    li.innerHTML = `<span class="ts-opt-emoji">${genderEmoji(p.gender)}</span>
                    <span class="ts-opt-name">${buildShortName(p)}</span>
                    <span class="ts-opt-dates">${dates}</span>`;
    li.addEventListener('mousedown', e => {
      e.preventDefault();
      jumpToNode(p.id);
      clearTreeSearch();
    });
    dropdown.appendChild(li);
  });
  dropdown.style.display = 'block';
}

function clearTreeSearch() {
  treeCanvas.querySelectorAll('.person-node.search-highlight').forEach(el =>
    el.classList.remove('search-highlight')
  );
  const input    = document.getElementById('treeSearch');
  const dropdown = document.getElementById('treeSearchDropdown');
  if (input) input.value = '';
  if (dropdown) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; }
}

/**
 * Pan the viewport so the given node is centred, then show its detail panel.
 */
function jumpToNode(id) {
  // Clear previous highlights
  treeCanvas.querySelectorAll('.person-node.search-highlight').forEach(el =>
    el.classList.remove('search-highlight')
  );

  const node = treeCanvas.querySelector(`[data-id="${id}"]`);
  if (!node) return;

  node.classList.add('search-highlight');

  const wrapperRect = treeWrapper.getBoundingClientRect();
  const x = parseFloat(node.style.left) || 0;
  const y = parseFloat(node.style.top)  || 0;

  transform.x = wrapperRect.width  / 2 - (x + NODE_W / 2) * transform.scale;
  transform.y = wrapperRect.height / 2 - (y + NODE_H / 2) * transform.scale;
  applyTransform();

  showDetail(id);
}

// ── Relationship Calculator ───────────────────────────────────
/**
 * BFS from fromId to toId across the full bidirectional graph.
 * Each edge is one of: 'parent' (we moved down to a child),
 *                      'child'  (we moved up to a parent),
 *                      'spouse' (lateral via marriage/partnership).
 * Returns a human-readable relationship label, or null if no path found.
 */
function computeRelationship(fromId, toId) {
  if (fromId === toId) return null;

  const MAX_DEPTH = 12;
  const queue   = [{ id: fromId, path: [] }];
  const visited = new Set([fromId]);

  while (queue.length > 0) {
    const { id, path } = queue.shift();
    if (path.length >= MAX_DEPTH) continue;

    const p = getPerson(id);
    if (!p) continue;

    const neighbors = [];
    (p.children || []).forEach(cid => neighbors.push({ id: cid, edge: 'parent'  }));
    (p.parents  || []).forEach(pid => neighbors.push({ id: pid, edge: 'child'   }));
    (p.spouses  || []).forEach(sid => neighbors.push({ id: sid, edge: 'spouse'  }));

    for (const nb of neighbors) {
      if (visited.has(nb.id)) continue;
      const newPath = [...path, nb.edge];
      if (nb.id === toId) return describeRelationship(newPath);
      visited.add(nb.id);
      queue.push({ id: nb.id, path: newPath });
    }
  }
  return null;
}

/**
 * Convert an edge-sequence (BFS path) into a plain-English relationship label.
 * Edge key: 'parent' = moved DOWN (current → child), 'child' = moved UP (current → parent).
 */
function describeRelationship(edges) {
  const e = edges.join(',');

  // ── Direct ────────────────────────────────────────────────
  if (e === 'parent') return 'child';
  if (e === 'child')  return 'parent';
  if (e === 'spouse') return 'spouse / partner';

  // ── Grandparent / grandchild ──────────────────────────────
  if (e === 'child,child')     return 'grandparent';
  if (e === 'parent,parent')   return 'grandchild';

  // ── Great-grandparent / great-grandchild ──────────────────
  if (e === 'child,child,child')       return 'great-grandparent';
  if (e === 'parent,parent,parent')    return 'great-grandchild';
  if (e === 'child,child,child,child') return '2× great-grandparent';
  if (e === 'parent,parent,parent,parent') return '2× great-grandchild';
  if (e === 'child,child,child,child,child') return '3× great-grandparent';
  if (e === 'parent,parent,parent,parent,parent') return '3× great-grandchild';

  // ── Siblings ──────────────────────────────────────────────
  if (e === 'child,parent') return 'sibling';

  // ── Aunts / Uncles ────────────────────────────────────────
  if (e === 'child,child,parent')        return 'aunt / uncle';
  if (e === 'child,parent,parent')       return 'niece / nephew';
  if (e === 'child,child,child,parent')  return 'great-aunt / great-uncle';
  if (e === 'child,parent,parent,parent') return 'great-niece / great-nephew';
  if (e === 'child,child,child,child,parent') return '2× great-aunt / great-uncle';
  if (e === 'child,parent,parent,parent,parent') return '2× great-niece / great-nephew';

  // ── Cousins ───────────────────────────────────────────────
  if (e === 'child,child,parent,parent')                 return '1st cousin';
  if (e === 'child,child,child,parent,parent,parent')    return '2nd cousin';
  if (e === 'child,child,child,child,parent,parent,parent,parent') return '3rd cousin';

  // 1st cousin once removed (two variants: up or down)
  if (e === 'child,child,parent,parent,parent')          return '1st cousin once removed';
  if (e === 'child,child,child,parent,parent')           return '1st cousin once removed';

  // 2nd cousin once removed
  if (e === 'child,child,child,parent,parent,parent,parent') return '2nd cousin once removed';
  if (e === 'child,child,child,child,parent,parent,parent')  return '2nd cousin once removed';

  // 1st cousin twice removed
  if (e === 'child,child,parent,parent,parent,parent')   return '1st cousin twice removed';
  if (e === 'child,child,child,child,parent,parent')     return '1st cousin twice removed';

  // 3rd cousin once removed
  if (e === 'child,child,child,child,parent,parent,parent,parent,parent') return '3rd cousin once removed';
  if (e === 'child,child,child,child,child,parent,parent,parent,parent')  return '3rd cousin once removed';

  // ── In-laws ───────────────────────────────────────────────
  if (e === 'spouse,child')            return 'parent-in-law';
  if (e === 'spouse,parent')           return 'child-in-law';
  if (e === 'child,spouse')            return 'step-parent';
  if (e === 'parent,spouse')           return 'step-child';
  if (e === 'spouse,child,parent')     return 'sibling-in-law';
  if (e === 'child,spouse,child')      return 'sibling-in-law';
  if (e === 'spouse,child,child')      return 'grandparent-in-law';
  if (e === 'spouse,child,parent,parent') return 'sibling-in-law';
  if (e === 'child,child,spouse')      return 'step-grandparent';
  if (e === 'spouse,parent,parent')    return 'grandchild-in-law';

  // ── Fallback: step-by-step plain description ──────────────
  return describePathFallback(edges);
}

function describePathFallback(edges) {
  const steps = [];
  edges.forEach(edge => {
    if (edge === 'parent') steps.push('child of');
    else if (edge === 'child')  steps.push('parent of');
    else if (edge === 'spouse') steps.push('partner of');
  });
  return steps.join(' → ');
}

/**
 * Inject a relationship-finder widget at the bottom of the detail panel.
 * fromId = the currently displayed person.
 */
function initRelFinder(fromId) {
  const section = document.createElement('div');
  section.className = 'detail-rel-finder';
  section.innerHTML = `
    <div class="detail-rel-label">🔗 Relationship Finder</div>
    <div class="rel-finder-wrap">
      <input type="text" class="rel-finder-input" id="relFinderInput"
             placeholder="Search for another person…" autocomplete="off"/>
      <ul class="rel-finder-dropdown" id="relFinderDropdown"></ul>
      <div class="rel-finder-result" id="relFinderResult"></div>
    </div>`;
  detailRels.appendChild(section);

  const input    = document.getElementById('relFinderInput');
  const dropdown = document.getElementById('relFinderDropdown');
  const result   = document.getElementById('relFinderResult');
  let deb = null;

  input.addEventListener('input', () => {
    clearTimeout(deb);
    deb = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      dropdown.innerHTML = '';
      result.innerHTML   = '';
      if (!q) { dropdown.style.display = 'none'; return; }

      const matches = people.filter(p =>
        p.id !== fromId &&
        (buildShortName(p).toLowerCase().includes(q) ||
         buildDisplayName(p).toLowerCase().includes(q))
      );

      if (matches.length === 0) { dropdown.style.display = 'none'; return; }

      matches.slice(0, 7).forEach(p => {
        const li = document.createElement('li');
        li.className = 'rel-finder-option';
        li.innerHTML = `${genderEmoji(p.gender)} ${buildShortName(p)}`;
        li.addEventListener('mousedown', ev => {
          ev.preventDefault();
          input.value = buildShortName(p);
          dropdown.innerHTML = '';
          dropdown.style.display = 'none';

          const rel      = computeRelationship(fromId, p.id);
          const fromName = buildShortName(getPerson(fromId));
          const toName   = buildShortName(p);

          if (rel) {
            result.innerHTML =
              `<span class="rel-found">🔗 <strong>${fromName}</strong> is the <em>${rel}</em> of <strong>${toName}</strong></span>`;
          } else {
            result.innerHTML =
              `<span class="rel-not-found">No relationship path found between these two people.</span>`;
          }
        });
        dropdown.appendChild(li);
      });
      dropdown.style.display = 'block';
    }, 150);
  });

  document.addEventListener('click', ev => {
    if (!ev.target.closest('.rel-finder-wrap')) {
      dropdown.innerHTML = '';
      dropdown.style.display = 'none';
    }
  });
}

// ── Location Autocomplete (Nominatim) ────────────────────────
let locationDebounce = null;

function initLocationAutocomplete() {
  fieldBirthplace.addEventListener('input', () => {
    clearTimeout(locationDebounce);
    const q = fieldBirthplace.value.trim();
    if (q.length < 3) {
      birthplaceDropdown.innerHTML = '';
      birthplaceDropdown.style.display = 'none';
      return;
    }
    locationDebounce = setTimeout(() => fetchLocations(q, birthplaceDropdown, fieldBirthplace), 350);
  });

  fieldBirthplace.addEventListener('keydown', e => navigateDropdown(e, birthplaceDropdown, fieldBirthplace));

  document.addEventListener('click', e => {
    if (!e.target.closest('.location-wrap')) {
      birthplaceDropdown.innerHTML = '';
      birthplaceDropdown.style.display = 'none';
    }
  });
}

function fetchLocations(query, dropdown, inputEl) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=0`;
  fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'FamilyTreeGenerator/1.0' } })
    .then(r => r.json())
    .then(results => {
      dropdown.innerHTML = '';
      if (!results || results.length === 0) { dropdown.style.display = 'none'; return; }
      results.forEach((item, i) => {
        const li = document.createElement('li');
        li.className = 'location-option';
        li.textContent = item.display_name;
        li.dataset.idx = i;
        li.addEventListener('mousedown', e => {
          e.preventDefault();
          inputEl.value = item.display_name;
          dropdown.innerHTML = '';
          dropdown.style.display = 'none';
        });
        dropdown.appendChild(li);
      });
      dropdown.style.display = 'block';
    })
    .catch(() => { dropdown.innerHTML = ''; dropdown.style.display = 'none'; });
}

function navigateDropdown(e, dropdown, inputEl) {
  const items  = dropdown.querySelectorAll('.location-option');
  if (!items.length) return;
  const active = dropdown.querySelector('.location-option.active');
  let idx = active ? parseInt(active.dataset.idx) : -1;
  if      (e.key === 'ArrowDown')  { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); }
  else if (e.key === 'ArrowUp')    { e.preventDefault(); idx = Math.max(idx - 1, 0); }
  else if (e.key === 'Enter' && active) { e.preventDefault(); inputEl.value = active.textContent; dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }
  else if (e.key === 'Escape')     { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }
  else return;
  items.forEach(el => el.classList.remove('active'));
  if (idx >= 0) { items[idx].classList.add('active'); items[idx].scrollIntoView({ block: 'nearest' }); }
}

// ── Import / Export ──────────────────────────────────────────
function exportData() {
  const data = JSON.stringify({ people, nextId }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'family-tree.json'; a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data.people)) {
        people = data.people.map(p => {
          if (!p.firstName && p.name) {
            const parts = p.name.replace(/\[née [^\]]+\]/g, '').trim().split(/\s+/);
            p.firstName  = parts[0] || '';
            p.middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';
            p.lastName   = parts.length > 1 ? parts[parts.length - 1] : '';
            p.maidenName = p.maidenName || p.nickname || '';
            p.otherNames = p.otherNames || '';
          }
          return p;
        });
        nextId = data.nextId || (Math.max(0, ...people.map(p => p.id)) + 1);
        saveToFirebase(); // saves imported data to Firebase for all users
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
        document.querySelector('[data-tab="tree"]').classList.add('active');
        document.getElementById('tab-tree').classList.add('active');
      } else { alert('Invalid file format.'); }
    } catch { alert('Could not read file. Make sure it is a valid Family Tree JSON.'); }
  };
  reader.readAsText(file);
}

// ── Glossary ─────────────────────────────────────────────────
const GLOSSARY_DATA = [
  {
    title: '👨‍👩‍👧 Direct Line (Lineal)',
    items: [
      { term: 'Parent', def: 'Your mother or father — the person who gave birth to or legally adopted you.' },
      { term: 'Child', def: 'Your son or daughter.' },
      { term: 'Grandparent', def: 'The parent of your parent. Your mother\'s or father\'s mother or father.' },
      { term: 'Grandchild', def: 'The child of your child.' },
      { term: 'Great-Grandparent', def: 'The parent of your grandparent — three generations above you.' },
      { term: 'Great-Grandchild', def: 'The child of your grandchild — three generations below you.' },
      { term: 'Great-Great-Grandparent', def: 'Four generations above you. Also called 2× great-grandparent.' },
      { term: 'Ancestor', def: 'Any person from whom you are directly descended: parents, grandparents, great-grandparents, and so on.' },
      { term: 'Descendant', def: 'Any person who descends directly from you: children, grandchildren, and so on.' },
    ]
  },
  {
    title: '💍 Spouses & Partners',
    items: [
      { term: 'Spouse', def: 'A husband or wife; a person you are legally married to.' },
      { term: 'Partner', def: 'A person you are in a long-term relationship with, whether married or not.' },
      { term: 'Ex-Spouse', def: 'A former husband or wife from whom you are divorced.' },
      { term: 'Widow / Widower', def: 'A person whose spouse has died and who has not remarried.' },
      { term: 'Father-in-law / Mother-in-law', def: 'The parent of your spouse.' },
      { term: 'Son-in-law', def: 'The husband of your child.' },
      { term: 'Daughter-in-law', def: 'The wife of your child.' },
      { term: 'Brother-in-law', def: 'The brother of your spouse, or the husband of your sibling.' },
      { term: 'Sister-in-law', def: 'The sister of your spouse, or the wife of your sibling.' },
    ]
  },
  {
    title: '👫 Siblings',
    items: [
      { term: 'Sibling', def: 'A brother or sister — someone who shares at least one parent with you.' },
      { term: 'Full Sibling', def: 'A brother or sister who shares both the same mother and father as you.' },
      { term: 'Half-Sibling', def: 'A brother or sister who shares only one parent with you (either mother or father, but not both).' },
      { term: 'Step-Sibling', def: 'The child of your step-parent from a previous relationship; not biologically related to you.' },
      { term: 'Adoptive Sibling', def: 'A sibling who joined your family through adoption.' },
      { term: 'Twin', def: 'A sibling born at the same birth as you. Identical twins share the same DNA; fraternal twins do not.' },
    ]
  },
  {
    title: '👴 Aunts, Uncles & Niblings',
    items: [
      { term: 'Aunt', def: 'The sister of your parent, or the wife of your parent\'s brother.' },
      { term: 'Uncle', def: 'The brother of your parent, or the husband of your parent\'s sister.' },
      { term: 'Nibling', def: 'Gender-neutral term for a niece or nephew.' },
      { term: 'Niece', def: 'The daughter of your sibling.' },
      { term: 'Nephew', def: 'The son of your sibling.' },
      { term: 'Great-Aunt / Great-Uncle', def: 'The aunt or uncle of your parent — i.e., the sibling of your grandparent.' },
      { term: 'Great-Niece / Great-Nephew', def: 'The child of your niece or nephew.' },
      { term: 'Grand-Niece / Grand-Nephew', def: 'Same as great-niece/nephew. The grandchild of your sibling.' },
    ]
  },
  {
    title: '🧩 Cousins Explained',
    items: [
      { term: '1st Cousin', def: 'The child of your aunt or uncle. You share the same grandparents.' },
      { term: '2nd Cousin', def: 'The child of your parent\'s 1st cousin. You share the same great-grandparents.' },
      { term: '3rd Cousin', def: 'The child of your parent\'s 2nd cousin. You share the same great-great-grandparents.' },
      { term: '4th Cousin', def: 'The child of your parent\'s 3rd cousin. You share the same great×3-grandparents.' },
      { term: 'Once Removed', def: '"Removed" means a difference of one generation. Your 1st cousin\'s child is your 1st cousin once removed.' },
      { term: 'Twice Removed', def: 'Two generations apart. Your 1st cousin\'s grandchild is your 1st cousin twice removed.' },
      { term: '2nd Cousin Once Removed', def: 'Either the child of your 2nd cousin, or the 2nd cousin of one of your parents.' },
      { term: 'Double Cousin', def: 'When two siblings from one family marry two siblings from another family, their children are double cousins.' },
      { term: 'Half-Cousin', def: 'The child of a half-aunt or half-uncle (your parent\'s half-sibling).' },
    ]
  },
  { title: '📊 Cousin Relationship Chart', chart: true },
  {
    title: '🔢 The "Removed" System Explained',
    items: [
      { term: 'What does "removed" mean?', def: '"Removed" describes a generation gap between cousins.' },
      { term: 'How to count: same generation', def: 'If in the same generation, you are cousins of the same degree — no "removed" needed.' },
      { term: 'How to count: different generations', def: 'Count how many steps separate you on the family tree.' },
      { term: 'Example', def: 'Your grandfather\'s first cousin is YOUR first cousin twice removed.' },
    ]
  },
  {
    title: '🔗 Step & Adoptive Relations',
    items: [
      { term: 'Step-Parent', def: 'The person who married your parent after a divorce or the death of your biological parent.' },
      { term: 'Step-Child', def: 'The child of your spouse from a previous relationship.' },
      { term: 'Adoptive Parent', def: 'A person who has legally adopted a child.' },
      { term: 'Biological / Birth Parent', def: 'The parent who contributed genetically to a child.' },
      { term: 'Foster Parent', def: 'An adult who provides temporary care for a child without formally adopting them.' },
      { term: 'Godparent', def: 'A person chosen to play a special role in a child\'s life, often as a religious sponsor.' },
    ]
  },
  {
    title: '🌍 Special & Cultural Terms',
    items: [
      { term: 'Patriarch / Matriarch', def: 'The eldest or most influential male (patriarch) or female (matriarch) in a family.' },
      { term: 'Consanguinity', def: 'Being related by blood; sharing a common ancestor.' },
      { term: 'Affinity', def: 'Being related by marriage rather than blood.' },
      { term: 'Proband / Index Person', def: 'The specific person from whom a family pedigree is built.' },
      { term: 'Collateral Relative', def: 'A relative who is not a direct ancestor or descendant — e.g., aunts, uncles, cousins.' },
      { term: 'Agnatic / Patrilineal', def: 'Descent traced only through male ancestors (father\'s line).' },
      { term: 'Uterine / Matrilineal', def: 'Descent traced only through female ancestors (mother\'s line).' },
      { term: 'Cognatic', def: 'Descent traced through both male and female ancestors.' },
      { term: 'Primogeniture', def: 'The right of the firstborn child to inherit the estate.' },
    ]
  }
];

function buildGlossary() {
  glossaryBody.innerHTML = '';
  GLOSSARY_DATA.forEach(section => {
    const sec = document.createElement('div');
    sec.className = 'glossary-section';
    sec.innerHTML = `<div class="glossary-section-title">${section.title}</div>`;
    if (section.chart) {
      const wrap = document.createElement('div');
      wrap.className = 'cousin-chart-wrap';
      const headers = ['You / Common Ancestor', '1 generation below (Child)', '2 below (Grandchild)', '3 below (Gt-Grandchild)', '4 below'];
      const rows = [
        ['1 generation below', '1st Cousin', '1st Cousin 1× Removed', '1st Cousin 2× Removed', '1st Cousin 3× Removed'],
        ['2 generations below', '1st Cousin 1× Removed', '2nd Cousin', '2nd Cousin 1× Removed', '2nd Cousin 2× Removed'],
        ['3 generations below', '1st Cousin 2× Removed', '2nd Cousin 1× Removed', '3rd Cousin', '3rd Cousin 1× Removed'],
        ['4 generations below', '1st Cousin 3× Removed', '2nd Cousin 2× Removed', '3rd Cousin 1× Removed', '4th Cousin'],
      ];
      let html = '<table class="cousin-chart"><thead><tr>';
      headers.forEach(h => { html += `<th>${h}</th>`; });
      html += '</tr></thead><tbody>';
      rows.forEach(row => { html += '<tr>'; row.forEach(cell => { html += `<td>${cell}</td>`; }); html += '</tr>'; });
      html += '</tbody></table>';
      wrap.innerHTML = html;
      sec.appendChild(wrap);
    } else {
      const grid = document.createElement('div');
      grid.className = 'glossary-items';
      (section.items || []).forEach(item => {
        const el = document.createElement('div');
        el.className = 'glossary-item';
        el.dataset.term = (item.term + ' ' + item.def).toLowerCase();
        el.innerHTML = `<div class="glossary-term">${item.term}</div><div class="glossary-def">${item.def}</div>`;
        grid.appendChild(el);
      });
      sec.appendChild(grid);
    }
    glossaryBody.appendChild(sec);
  });
}

function filterGlossary(q) {
  const lower = q.toLowerCase().trim();
  document.querySelectorAll('.glossary-item').forEach(el => {
    const match = !lower || (el.dataset.term || '').includes(lower);
    el.style.display = match ? '' : 'none';
    el.classList.toggle('highlight', !!lower && match);
  });
  document.querySelectorAll('.glossary-section').forEach(sec => {
    const items = sec.querySelectorAll('.glossary-item');
    if (items.length === 0) { sec.style.display = ''; return; }
    sec.style.display = [...items].some(i => i.style.display !== 'none') ? '' : 'none';
  });
}

// ── Boot ─────────────────────────────────────────────────────
function init() {
  populateDaySelect(fieldBirthDay);
  populateDaySelect(fieldDeathDay);

  initTabs();
  initPanZoom();
  initLocationAutocomplete();

  // Init chip search for each relationship type
  ['parents', 'spouses', 'children'].forEach(rt => initRelSearch(rt));

  buildGlossary();
  initTreeSearch();
  bindEvents();
  initFirebase(); // connects to Firebase and triggers initial render via listener
}

function bindEvents() {
  document.getElementById('addPersonTreeBtn').addEventListener('click', openAddModal);
  document.getElementById('addPersonEmptyBtn').addEventListener('click', openAddModal);
  document.getElementById('addPersonPeopleBtn').addEventListener('click', openAddModal);

  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
  document.getElementById('savePersonBtn').addEventListener('click', savePerson);
  document.getElementById('deletePersonBtn').addEventListener('click', () => {
    if (editingId !== null) promptDelete(editingId);
  });
  personModal.addEventListener('click', e => { if (e.target === personModal) closeModal(); });

  document.getElementById('deleteModalClose').addEventListener('click', () => deleteModal.classList.add('hidden'));
  document.getElementById('cancelDeleteBtn').addEventListener('click', () => deleteModal.classList.add('hidden'));
  document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
  deleteModal.addEventListener('click', e => { if (e.target === deleteModal) deleteModal.classList.add('hidden'); });

  // Quick-add sub-modal
  document.getElementById('quickAddClose').addEventListener('click', closeQuickAdd);
  document.getElementById('quickAddCancel').addEventListener('click', closeQuickAdd);
  document.getElementById('quickAddSave').addEventListener('click', saveQuickAdd);
  quickAddModal.addEventListener('click', e => { if (e.target === quickAddModal) closeQuickAdd(); });
  document.getElementById('qaFirstName').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveQuickAdd();
  });

  // "+ New Person" buttons for each rel type
  document.querySelectorAll('.btn-add-new[data-rel]').forEach(btn => {
    btn.addEventListener('click', () => openQuickAdd(btn.dataset.rel));
  });

  document.getElementById('detailClose').addEventListener('click', closeDetail);

  photoUploadArea.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) return;
    // Compress to max 200×200px JPEG @ 70% before storing
    compressImage(file, compressed => {
      currentPhotoData = compressed;
      photoPreview.src = compressed;
      photoPreview.style.display = 'block';
      photoPlaceholder.style.display = 'none';
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!quickAddModal.classList.contains('hidden')) { closeQuickAdd(); return; }
      if (!personModal.classList.contains('hidden'))   { closeModal(); return; }
      if (!deleteModal.classList.contains('hidden'))   { deleteModal.classList.add('hidden'); return; }
      if (!detailPanel.classList.contains('hidden'))   { closeDetail(); }
    }
    if (e.key === 'Enter' && !personModal.classList.contains('hidden') && quickAddModal.classList.contains('hidden')) {
      if (document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'SELECT') {
        savePerson();
      }
    }
  });

  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) { importData(file); e.target.value = ''; }
  });

  document.getElementById('zoomFit').addEventListener('click', fitToView);
  document.getElementById('glossarySearch').addEventListener('input', e => filterGlossary(e.target.value));
}

document.addEventListener('DOMContentLoaded', init);
