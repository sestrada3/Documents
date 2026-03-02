/* ============================================================
   FAMILY TREE GENERATOR — app.js
   ============================================================ */

// ── Data Store ──────────────────────────────────────────────
let people = [];       // Array of person objects
let nextId  = 1;       // Auto-increment ID counter
let editingId = null;  // ID of person being edited (null = new)
let pendingDeleteId = null;

// ── Layout State ────────────────────────────────────────────
let transform = { x: 0, y: 0, scale: 1 };
const NODE_W  = 160;
const NODE_H  = 200;
const H_GAP   = 40;   // horizontal gap between nodes
const V_GAP   = 90;   // vertical gap between generations

// ── DOM References ──────────────────────────────────────────
const treeCanvas   = document.getElementById('treeCanvas');
const treeSvg      = document.getElementById('treeSvg');
const svgLines     = document.getElementById('svgLines');
const treeWrapper  = document.getElementById('treeWrapper');
const treeEmpty    = document.getElementById('treeEmpty');
const peopleGrid   = document.getElementById('peopleGrid');
const peopleEmpty  = document.getElementById('peopleEmpty');
const glossaryBody = document.getElementById('glossaryBody');

// Modal
const personModal   = document.getElementById('personModal');
const modalTitle    = document.getElementById('modalTitle');
const deleteModal   = document.getElementById('deleteModal');
const deletePersonName = document.getElementById('deletePersonName');

// Form fields
const photoUploadArea = document.getElementById('photoUploadArea');
const photoPreview    = document.getElementById('photoPreview');
const photoPlaceholder = document.getElementById('photoPlaceholder');
const photoInput      = document.getElementById('photoInput');
const fieldName       = document.getElementById('fieldName');
const fieldBirth      = document.getElementById('fieldBirth');
const fieldDeath      = document.getElementById('fieldDeath');
const fieldGender     = document.getElementById('fieldGender');
const fieldNickname   = document.getElementById('fieldNickname');
const fieldBirthplace = document.getElementById('fieldBirthplace');
const fieldBio        = document.getElementById('fieldBio');
const fieldParents    = document.getElementById('fieldParents');
const fieldSpouses    = document.getElementById('fieldSpouses');
const fieldChildren   = document.getElementById('fieldChildren');

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

let currentPhotoData = null; // base64 string

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

// ── Modal ────────────────────────────────────────────────────
function openAddModal() {
  editingId = null;
  currentPhotoData = null;
  modalTitle.textContent = 'Add Person';
  fieldName.value = '';
  fieldBirth.value = '';
  fieldDeath.value = '';
  fieldGender.value = '';
  fieldNickname.value = '';
  fieldBirthplace.value = '';
  fieldBio.value = '';
  photoPreview.src = '';
  photoPreview.style.display = 'none';
  photoPlaceholder.style.display = 'flex';
  document.getElementById('deletePersonBtn').style.display = 'none';
  populateRelSelects(null);
  personModal.classList.remove('hidden');
  fieldName.focus();
}

function openEditModal(id) {
  const p = getPerson(id);
  if (!p) return;
  editingId = id;
  currentPhotoData = p.photo || null;
  modalTitle.textContent = 'Edit Person';
  fieldName.value = p.name || '';
  fieldBirth.value = p.birth || '';
  fieldDeath.value = p.death || '';
  fieldGender.value = p.gender || '';
  fieldNickname.value = p.nickname || '';
  fieldBirthplace.value = p.birthplace || '';
  fieldBio.value = p.bio || '';
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
  populateRelSelects(id);
  // Pre-select existing relationships
  Array.from(fieldParents.options).forEach(o => {
    o.selected = (p.parents || []).includes(parseInt(o.value));
  });
  Array.from(fieldSpouses.options).forEach(o => {
    o.selected = (p.spouses || []).includes(parseInt(o.value));
  });
  Array.from(fieldChildren.options).forEach(o => {
    o.selected = (p.children || []).includes(parseInt(o.value));
  });
  personModal.classList.remove('hidden');
  fieldName.focus();
}

function closeModal() {
  personModal.classList.add('hidden');
  editingId = null;
  currentPhotoData = null;
}

function populateRelSelects(excludeId) {
  const others = people.filter(p => p.id !== excludeId);
  [fieldParents, fieldSpouses, fieldChildren].forEach(sel => {
    sel.innerHTML = '';
    others.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + (p.birth ? ` (b. ${p.birth})` : '');
      sel.appendChild(opt);
    });
  });
}

function savePerson() {
  const name = fieldName.value.trim();
  if (!name) { fieldName.focus(); fieldName.style.borderColor = '#ef4444'; return; }
  fieldName.style.borderColor = '';
  const selectedIds = sel => Array.from(sel.selectedOptions).map(o => parseInt(o.value));
  const parents  = selectedIds(fieldParents);
  const spouses  = selectedIds(fieldSpouses);
  const children = selectedIds(fieldChildren);

  if (editingId === null) {
    // New person
    const id = uid();
    const person = {
      id, name,
      birth: fieldBirth.value.trim(),
      death: fieldDeath.value.trim(),
      gender: fieldGender.value,
      nickname: fieldNickname.value.trim(),
      birthplace: fieldBirthplace.value.trim(),
      bio: fieldBio.value.trim(),
      photo: currentPhotoData,
      parents, spouses, children
    };
    people.push(person);
    syncRelationships(id, parents, spouses, children);
  } else {
    // Edit existing
    const p = getPerson(editingId);
    p.name = name;
    p.birth = fieldBirth.value.trim();
    p.death = fieldDeath.value.trim();
    p.gender = fieldGender.value;
    p.nickname = fieldNickname.value.trim();
    p.birthplace = fieldBirthplace.value.trim();
    p.bio = fieldBio.value.trim();
    p.photo = currentPhotoData;
    p.parents = parents;
    p.spouses = spouses;
    p.children = children;
    syncRelationships(editingId, parents, spouses, children);
  }

  closeModal();
  renderTree();
  renderPeopleGrid();
}

// Keep relationships two-way consistent
function syncRelationships(id, parents, spouses, children) {
  people.forEach(p => {
    if (p.id === id) return;
    // Parents of id → id should appear in their children
    if (parents.includes(p.id)) {
      if (!(p.children || []).includes(id)) p.children = [...(p.children||[]), id];
    } else {
      p.children = (p.children||[]).filter(c => c !== id);
    }
    // Spouses of id → id should appear in their spouses
    if (spouses.includes(p.id)) {
      if (!(p.spouses || []).includes(id)) p.spouses = [...(p.spouses||[]), id];
    } else {
      p.spouses = (p.spouses||[]).filter(s => s !== id);
    }
    // Children of id → id should appear in their parents
    if (children.includes(p.id)) {
      if (!(p.parents || []).includes(id)) p.parents = [...(p.parents||[]), id];
    } else {
      p.parents = (p.parents||[]).filter(par => par !== id);
    }
  });
}

// ── Delete ───────────────────────────────────────────────────
function promptDelete(id) {
  pendingDeleteId = id;
  const p = getPerson(id);
  deletePersonName.textContent = p ? p.name : 'this person';
  closeModal();
  deleteModal.classList.remove('hidden');
}

function confirmDelete() {
  if (pendingDeleteId === null) return;
  const id = pendingDeleteId;
  // Remove all references to this person
  people.forEach(p => {
    p.parents   = (p.parents  ||[]).filter(x => x !== id);
    p.spouses   = (p.spouses  ||[]).filter(x => x !== id);
    p.children  = (p.children ||[]).filter(x => x !== id);
  });
  people = people.filter(p => p.id !== id);
  pendingDeleteId = null;
  deleteModal.classList.add('hidden');
  closeDetail();
  renderTree();
  renderPeopleGrid();
}

// ── Detail Panel ─────────────────────────────────────────────
function showDetail(id) {
  const p = getPerson(id);
  if (!p) return;

  // Photo or avatar
  if (p.photo) {
    detailPhoto.src = p.photo;
    detailPhoto.style.display = 'block';
    detailAvatar.style.display = 'none';
  } else {
    detailPhoto.style.display = 'none';
    detailAvatar.textContent = genderEmoji(p.gender);
    detailAvatar.style.display = 'flex';
  }

  detailName.textContent = p.name;
  detailNickname.textContent = p.nickname ? `"${p.nickname}"` : '';
  detailDates.textContent = formatDates(p);
  detailBirthplace.textContent = p.birthplace ? `📍 ${p.birthplace}` : '';
  detailBio.textContent = p.bio || '';
  detailBio.style.display = p.bio ? 'block' : 'none';

  // Relationships
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
      chip.textContent = genderEmoji(rel.gender) + ' ' + rel.name;
      chip.addEventListener('click', () => showDetail(rid));
      chips.appendChild(chip);
    });
    detailRels.appendChild(grp);
  };
  addGroup('Parents', p.parents);
  addGroup('Spouse / Partner', p.spouses);
  addGroup('Children', p.children);

  // Siblings (same parents)
  if (p.parents && p.parents.length > 0) {
    const siblingIds = new Set();
    p.parents.forEach(pid => {
      const par = getPerson(pid);
      if (par && par.children) par.children.forEach(cid => { if (cid !== id) siblingIds.add(cid); });
    });
    addGroup('Siblings', [...siblingIds]);
  }

  // Wire edit button
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

  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));
  sorted.forEach(p => {
    const card = document.createElement('div');
    card.className = `people-card${p.gender ? ' ' + p.gender : ''}`;
    card.innerHTML = p.photo
      ? `<img class="card-photo" src="${p.photo}" alt="${p.name}"/>`
      : `<div class="card-avatar">${genderEmoji(p.gender)}</div>`;
    const dates = formatDates(p);
    card.innerHTML += `
      <div class="card-name">${p.name}${p.nickname ? `<br/><span style="font-weight:400;font-style:italic;font-size:.78rem">"${p.nickname}"</span>` : ''}</div>
      ${dates ? `<div class="card-dates">${dates}</div>` : ''}
      <div class="card-actions">
        <button class="btn btn-secondary btn-sm" data-view="${p.id}">View</button>
        <button class="btn btn-primary btn-sm" data-edit="${p.id}">Edit</button>
      </div>`;
    card.querySelector('[data-view]').addEventListener('click', e => {
      e.stopPropagation();
      // Switch to tree tab and show detail
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

/**
 * Assigns each person a { generation, col } position.
 * Generation 0 = earliest ancestors (top), increasing downward.
 * Returns a Map: id -> { gen, col, x, y }
 */
function layoutTree() {
  if (people.length === 0) return new Map();

  // Step 1: Assign generations via BFS from roots (people with no parents)
  const genMap = new Map(); // id -> generation number
  const roots = people.filter(p => !p.parents || p.parents.length === 0);

  // BFS
  const queue = roots.map(r => ({ id: r.id, gen: 0 }));
  const visited = new Set();
  while (queue.length > 0) {
    const { id, gen } = queue.shift();
    if (visited.has(id)) {
      // Update to max generation seen
      if (gen > genMap.get(id)) genMap.set(id, gen);
      continue;
    }
    visited.add(id);
    genMap.set(id, gen);
    const p = getPerson(id);
    if (p && p.children) {
      p.children.forEach(cid => queue.push({ id: cid, gen: gen + 1 }));
    }
    // Spouses share the same generation
    if (p && p.spouses) {
      p.spouses.forEach(sid => {
        if (!visited.has(sid)) queue.push({ id: sid, gen });
      });
    }
  }

  // Anyone not reached (disconnected nodes) gets generation 0
  people.forEach(p => { if (!genMap.has(p.id)) genMap.set(p.id, 0); });

  // Step 2: Group by generation and assign columns
  const byGen = new Map();
  genMap.forEach((gen, id) => {
    if (!byGen.has(gen)) byGen.set(gen, []);
    byGen.get(gen).push(id);
  });

  // Sort each generation: try to keep spouses together, sort by name otherwise
  byGen.forEach((ids, gen) => {
    // Group spouse pairs together
    const ordered = [];
    const placed  = new Set();
    ids.forEach(id => {
      if (placed.has(id)) return;
      placed.add(id);
      ordered.push(id);
      const p = getPerson(id);
      if (p && p.spouses) {
        p.spouses.forEach(sid => {
          if (ids.includes(sid) && !placed.has(sid)) {
            placed.add(sid);
            ordered.push(sid);
          }
        });
      }
    });
    byGen.set(gen, ordered);
  });

  // Step 3: Calculate pixel positions
  const positions = new Map();
  const PADDING_TOP  = 60;
  const PADDING_LEFT = 60;

  let maxCols = 0;
  byGen.forEach(ids => { if (ids.length > maxCols) maxCols = ids.length; });

  byGen.forEach((ids, gen) => {
    const totalW = ids.length * (NODE_W + H_GAP) - H_GAP;
    const startX = PADDING_LEFT + Math.max(0, (maxCols * (NODE_W + H_GAP) - totalW) / 2);
    ids.forEach((id, col) => {
      positions.set(id, {
        gen, col,
        x: startX + col * (NODE_W + H_GAP),
        y: PADDING_TOP + gen * (NODE_H + V_GAP)
      });
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

  // Draw connector lines first (SVG layer)
  drawLines(positions);

  // Draw person nodes (HTML layer)
  positions.forEach((pos, id) => {
    const p = getPerson(id);
    if (!p) return;

    const node = document.createElement('div');
    node.className = `person-node${p.gender ? ' ' + p.gender : ''}`;
    node.style.left = pos.x + 'px';
    node.style.top  = pos.y + 'px';
    node.dataset.id = id;

    if (p.photo) {
      node.innerHTML = `<img class="node-photo" src="${p.photo}" alt="${p.name}"/>`;
    } else {
      node.innerHTML = `<div class="node-avatar">${genderEmoji(p.gender)}</div>`;
    }
    const dates = formatDates(p);
    node.innerHTML += `
      <div class="node-name">${p.name}</div>
      ${dates ? `<div class="node-dates">${dates}</div>` : ''}`;

    node.addEventListener('click', () => showDetail(id));
    treeCanvas.appendChild(node);
  });
}

function drawLines(positions) {
  svgLines.innerHTML = '';

  const drawnSpouse = new Set();

  people.forEach(p => {
    const pPos = positions.get(p.id);
    if (!pPos) return;

    // Parent → Child lines
    (p.children || []).forEach(cid => {
      const cPos = positions.get(cid);
      if (!cPos) return;

      // Mid-point of parent node bottom
      const x1 = pPos.x + NODE_W / 2;
      const y1 = pPos.y + NODE_H;
      const x2 = cPos.x + NODE_W / 2;
      const y2 = cPos.y;
      const cy = (y1 + y2) / 2;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${x1},${y1} C${x1},${cy} ${x2},${cy} ${x2},${y2}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#94a3b8');
      path.setAttribute('stroke-width', '2');
      svgLines.appendChild(path);
    });

    // Spouse lines (horizontal double bar ≈)
    (p.spouses || []).forEach(sid => {
      const key = [p.id, sid].sort().join('-');
      if (drawnSpouse.has(key)) return;
      drawnSpouse.add(key);

      const sPos = positions.get(sid);
      if (!sPos) return;

      const x1 = pPos.x + NODE_W;
      const y1 = pPos.y + NODE_H / 2;
      const x2 = sPos.x;
      const y2 = sPos.y + NODE_H / 2;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      // Double line (two parallel lines with small gap)
      [-3, 3].forEach(offset => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1 + offset);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2 + offset);
        line.setAttribute('stroke', '#f472b6');
        line.setAttribute('stroke-width', '1.5');
        svgLines.appendChild(line);
      });

      // Heart symbol in middle
      const heart = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      heart.setAttribute('x', midX);
      heart.setAttribute('y', midY + 5);
      heart.setAttribute('text-anchor', 'middle');
      heart.setAttribute('font-size', '14');
      heart.textContent = '♥';
      heart.setAttribute('fill', '#f472b6');
      svgLines.appendChild(heart);
    });
  });
}

// ── Pan & Zoom ───────────────────────────────────────────────
function initPanZoom() {
  let isDragging = false;
  let startX, startY;

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
  window.addEventListener('mouseup', () => {
    isDragging = false;
    treeWrapper.classList.remove('dragging');
  });

  // Touch support
  treeWrapper.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    if (e.target.closest('.person-node')) return;
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

  // Mouse wheel zoom
  treeWrapper.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const rect  = treeWrapper.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    transform.x = mx - (mx - transform.x) * delta;
    transform.y = my - (my - transform.y) * delta;
    transform.scale = Math.min(3, Math.max(0.2, transform.scale * delta));
    applyTransform();
  }, { passive: false });

  // Buttons
  document.getElementById('zoomIn').addEventListener('click', () => {
    transform.scale = Math.min(3, transform.scale * 1.2);
    applyTransform();
  });
  document.getElementById('zoomOut').addEventListener('click', () => {
    transform.scale = Math.max(0.2, transform.scale / 1.2);
    applyTransform();
  });
  document.getElementById('zoomReset').addEventListener('click', () => {
    transform = { x: 40, y: 20, scale: 1 };
    applyTransform();
  });
}

function applyTransform() {
  const t = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
  treeCanvas.style.transform = t;
  treeSvg.style.transform    = t;
  treeSvg.style.transformOrigin = '0 0';
}

// ── Import / Export ──────────────────────────────────────────
function exportData() {
  const data = JSON.stringify({ people, nextId }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'family-tree.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data.people)) {
        people = data.people;
        nextId = data.nextId || (Math.max(0, ...people.map(p => p.id)) + 1);
        renderTree();
        renderPeopleGrid();
        // Switch to tree tab
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
        document.querySelector('[data-tab="tree"]').classList.add('active');
        document.getElementById('tab-tree').classList.add('active');
      } else {
        alert('Invalid file format.');
      }
    } catch {
      alert('Could not read file. Make sure it is a valid Family Tree JSON.');
    }
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
      { term: 'Great-Aunt / Great-Uncle', def: 'The aunt or uncle of your parent — i.e., the sibling of your grandparent. (Also called Grand-Aunt/Uncle in some traditions.)' },
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
      { term: 'Once Removed', def: '"Removed" means a difference of one generation. Your 1st cousin\'s child is your 1st cousin once removed. Your parent\'s 1st cousin is also your 1st cousin once removed.' },
      { term: 'Twice Removed', def: 'Two generations apart. Your 1st cousin\'s grandchild is your 1st cousin twice removed.' },
      { term: '2nd Cousin Once Removed', def: 'Either the child of your 2nd cousin, or the 2nd cousin of one of your parents.' },
      { term: 'Double Cousin', def: 'When two siblings from one family marry two siblings from another family, their children are double cousins — sharing all four grandparents.' },
      { term: 'Half-Cousin', def: 'The child of a half-aunt or half-uncle (your parent\'s half-sibling).' },
    ]
  },
  {
    title: '📊 Cousin Relationship Chart',
    chart: true
  },
  {
    title: '🔢 The "Removed" System Explained',
    items: [
      { term: 'What does "removed" mean?', def: '"Removed" describes a generation gap between cousins. Two people are "once removed" when one is exactly one generation ahead of or behind the other. The cousin number (1st, 2nd, etc.) tells you the most recent common ancestor.' },
      { term: 'How to count: same generation', def: 'If you and another person are in the same generation (both grandchildren of the same person), you are cousins of the same degree — no "removed" needed.' },
      { term: 'How to count: different generations', def: 'Count how many steps separate you on the family tree. If you share great-grandparents and you are two generations below them but the other person is three generations below, you are 1st cousins once removed.' },
      { term: 'Example', def: 'Your grandfather\'s first cousin is YOUR first cousin twice removed — because there are two generations between you and that cousin (your grandfather = 1 gen; you = 2 gen below the common ancestor).' },
    ]
  },
  {
    title: '🔗 Step & Adoptive Relations',
    items: [
      { term: 'Step-Parent', def: 'The person who married your parent after a divorce or the death of your biological parent, without legally adopting you.' },
      { term: 'Step-Child', def: 'The child of your spouse from a previous relationship.' },
      { term: 'Adoptive Parent', def: 'A person who has legally adopted a child, taking on all legal parental rights and responsibilities.' },
      { term: 'Biological / Birth Parent', def: 'The parent who contributed genetically to a child, as distinct from an adoptive or step-parent.' },
      { term: 'Foster Parent', def: 'An adult who provides temporary care for a child without formally adopting them.' },
      { term: 'Godparent', def: 'A person (not necessarily a biological relative) chosen to play a special role in a child\'s life, often as a religious sponsor.' },
    ]
  },
  {
    title: '🌍 Special & Cultural Terms',
    items: [
      { term: 'Patriarch / Matriarch', def: 'The eldest or most influential male (patriarch) or female (matriarch) in a family.' },
      { term: 'Consanguinity', def: 'Being related by blood; sharing a common ancestor.' },
      { term: 'Affinity', def: 'Being related by marriage rather than blood.' },
      { term: 'Proband / Index Person', def: 'The specific person from whom a family pedigree is built — the starting point of a genealogical chart.' },
      { term: 'Collateral Relative', def: 'A relative who is not a direct ancestor or descendant — e.g., aunts, uncles, cousins.' },
      { term: 'Agnatic / Patrilineal', def: 'Descent traced only through male ancestors (father\'s line).' },
      { term: 'Uterine / Matrilineal', def: 'Descent traced only through female ancestors (mother\'s line).' },
      { term: 'Cognatic', def: 'Descent traced through both male and female ancestors.' },
      { term: 'Primogeniture', def: 'The right of the firstborn child (historically the eldest son) to inherit the estate.' },
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
      // Cousin chart
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
      rows.forEach(row => {
        html += '<tr>';
        row.forEach(cell => { html += `<td>${cell}</td>`; });
        html += '</tr>';
      });
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
    const anyVisible = [...items].some(i => i.style.display !== 'none');
    sec.style.display = anyVisible ? '' : 'none';
  });
}

// ── Boot ─────────────────────────────────────────────────────
function init() {
  initTabs();
  initPanZoom();
  buildGlossary();
  renderTree();
  renderPeopleGrid();
  bindEvents();
}

function bindEvents() {
  // Add person buttons
  document.getElementById('addPersonTreeBtn').addEventListener('click', openAddModal);
  document.getElementById('addPersonEmptyBtn').addEventListener('click', openAddModal);
  document.getElementById('addPersonPeopleBtn').addEventListener('click', openAddModal);

  // Modal controls
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
  document.getElementById('savePersonBtn').addEventListener('click', savePerson);
  document.getElementById('deletePersonBtn').addEventListener('click', () => {
    if (editingId !== null) promptDelete(editingId);
  });

  // Close modal on overlay click
  personModal.addEventListener('click', e => { if (e.target === personModal) closeModal(); });

  // Delete modal controls
  document.getElementById('deleteModalClose').addEventListener('click', () => deleteModal.classList.add('hidden'));
  document.getElementById('cancelDeleteBtn').addEventListener('click', () => deleteModal.classList.add('hidden'));
  document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
  deleteModal.addEventListener('click', e => { if (e.target === deleteModal) deleteModal.classList.add('hidden'); });

  // Detail panel close
  document.getElementById('detailClose').addEventListener('click', closeDetail);

  // Photo upload
  photoUploadArea.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      currentPhotoData = e.target.result;
      photoPreview.src = currentPhotoData;
      photoPreview.style.display = 'block';
      photoPlaceholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  });

  // Keyboard: Enter to save modal, Escape to close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!personModal.classList.contains('hidden')) closeModal();
      if (!deleteModal.classList.contains('hidden')) deleteModal.classList.add('hidden');
      if (!detailPanel.classList.contains('hidden')) closeDetail();
    }
    if (e.key === 'Enter' && !personModal.classList.contains('hidden')) {
      if (document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'SELECT') {
        savePerson();
      }
    }
  });

  // Export / Import
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) { importData(file); e.target.value = ''; }
  });

  // Glossary search
  document.getElementById('glossarySearch').addEventListener('input', e => filterGlossary(e.target.value));
}

document.addEventListener('DOMContentLoaded', init);
