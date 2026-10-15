function getBaseUrl() {
  const path = window.location.pathname;
  if (path.includes('/opac')) return '/opac/';
  if (path.includes('/master')) return '/master/';
  if (path.includes('/pustaka-terbuka')) return '/pustaka-terbuka/';
  if (window.location.hostname.endsWith('github.io')) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length > 0) return `/${parts[0]}/`;
  }
  return '/';
}
const BASE_URL = getBaseUrl();
let i18n = {};
let currentLang = 'en';
let pagefind = null;
let currentOrg = null;
let currentDdc = '';
let currentSearchField = 'all'; // 'all', 'title', 'author', 'subject', 'isbn', 'call'
let currentSort = 'relevance'; // 'relevance', 'year-desc', 'year-asc', 'title-asc'
let searchDebounceTimer = null;
let searchSequenceToken = 0;
const resultDataCache = new Map();
let lastSearchTimeMs = 0;
let orgsData = {};
let orgHoldingsMap = {}; // recordId -> { call_number }
let basket = new Set(); // Set of recordIds

// Pagination state
let currentSearchResults = [];
let currentPage = 1;
const PAGE_SIZE = 10;
let currentQuery = '';

async function getResultData(res) {
  if (resultDataCache.has(res.id)) {
    return resultDataCache.get(res.id);
  }
  const data = await res.data();
  resultDataCache.set(res.id, data);
  return data;
}

function extractSearchIsbn(text) {
  if (!text) return null;
  const match = text.match(/([\d\-\sX]{9,})/i);
  if (!match) return null;
  const clean = match[1].replace(/[-\s]/g, '').toUpperCase();
  if (clean.length === 10 || clean.length === 13) {
    return clean;
  }
  return null;
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* Theme Management (Light / Dark Mode) */
function initTheme() {
  const savedTheme = localStorage.getItem('pustaka-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
  applyTheme(initialTheme);

  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('pustaka-theme', next);
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

/* Localization */
async function loadI18n(lang) {
  try {
    const res = await fetch(`${BASE_URL}i18n/${lang}.json`);
    if (!res.ok) throw new Error('Network response was not ok');
    i18n = await res.json();
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (i18n[key]) {
        el.textContent = i18n[key];
      }
    });

    const searchInput = document.getElementById('search-input');
    if (searchInput && i18n['search_placeholder']) {
      searchInput.placeholder = i18n['search_placeholder'];
    }

    const fieldSelect = document.getElementById('search-field');
    if (fieldSelect) {
      fieldSelect.querySelectorAll('option').forEach(opt => {
        const key = opt.getAttribute('data-i18n');
        if (key && i18n[key]) opt.textContent = i18n[key];
      });
    }

    const sortSelect = document.getElementById('sort-filter');
    if (sortSelect) {
      sortSelect.querySelectorAll('option').forEach(opt => {
        const key = opt.getAttribute('data-i18n');
        if (key && i18n[key]) opt.textContent = i18n[key];
      });
    }
    
    const btn = document.getElementById('download-basket-btn');
    if (btn && i18n['download_basket']) {
      btn.textContent = i18n['download_basket'];
    }

    renderActiveFilters();
  } catch (err) {
    console.error('Failed to load i18n', err);
  }
}

function updateLangSelect() {
  const select = document.getElementById('lang-select');
  if (select) {
    select.value = currentLang;
    select.addEventListener('change', (e) => {
      const newLang = e.target.value;
      const url = new URL(window.location);
      url.searchParams.set('lang', newLang);
      window.history.pushState({}, '', url);
      currentLang = newLang;
      document.documentElement.lang = currentLang;
      loadI18n(currentLang);
    });
  }
}

/* Organization & Filter Loading */
async function loadOrgs() {
  try {
    try {
      const orgsRes = await fetch(`${BASE_URL}orgs.json`);
      if (orgsRes.ok) orgsData = await orgsRes.json();
    } catch (e) {}

    let filters = null;
    if (pagefind) {
      try {
        filters = await pagefind.filters();
      } catch (e) {}
    }

    const select = document.getElementById('org-filter');
    if (!select) return;

    while (select.options.length > 1) {
      select.remove(1);
    }

    const orgKeys = new Set();
    if (filters && filters.organization) {
      for (const org of Object.keys(filters.organization)) {
        orgKeys.add(org);
      }
    }
    for (const org of Object.keys(orgsData)) {
      orgKeys.add(org);
    }

    const sortedOrgs = Array.from(orgKeys).sort((a, b) => {
      const nameA = orgsData[a]?.name || a;
      const nameB = orgsData[b]?.name || b;
      return nameA.localeCompare(nameB);
    });

    for (const org of sortedOrgs) {
      const option = document.createElement('option');
      option.value = org;
      const orgName = orgsData[org]?.name ? `${orgsData[org].name} (${org})` : org;
      option.textContent = orgName;
      select.appendChild(option);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const urlOrg = urlParams.get('org');
    if (urlOrg && orgKeys.has(urlOrg)) {
      select.value = urlOrg;
      currentOrg = urlOrg;
    }

    if (!select._listenerAttached) {
      select._listenerAttached = true;
      select.addEventListener('change', async (e) => {
        const val = e.target.value;
        const url = new URL(window.location);
        if (val) {
          url.searchParams.set('org', val);
        } else {
          url.searchParams.delete('org');
        }
        window.history.pushState({}, '', url);
        await onOrgChange(val);
      });
    }

    if (urlOrg) {
      await onOrgChange(urlOrg);
    }
  } catch (err) {
    console.error('Failed to load orgs', err);
  }
}

async function onOrgChange(org) {
  currentOrg = org;
  orgHoldingsMap = {};
  
  const linksContainer = document.getElementById('shelf-browse-links');
  if (linksContainer) {
    linksContainer.innerHTML = '';
  }
  
  if (org) {
    try {
      const res = await fetch(`${BASE_URL}org/${org}/index.json`);
      if (res.ok) {
        const data = await res.json();
        for (const item of data) {
          orgHoldingsMap[item.id] = item;
        }
      }
      
      if (linksContainer) {
        const lccLink = document.createElement('a');
        lccLink.href = `${BASE_URL}browse/${org}/LCC.json`;
        lccLink.textContent = `Browse LCC`;
        lccLink.style.marginRight = '8px';
        
        const ddcLink = document.createElement('a');
        ddcLink.href = `${BASE_URL}browse/${org}/DDC.json`;
        ddcLink.textContent = `Browse DDC`;
        
        linksContainer.appendChild(lccLink);
        linksContainer.appendChild(ddcLink);
      }
    } catch (e) {
      console.warn('Could not load org index', e);
    }
  }
  
  renderActiveFilters();
  const customInput = document.getElementById('search-input');
  const resultsContainer = document.getElementById('search-results');
  if (resultsContainer) {
    await performSearch(customInput ? customInput.value : '', resultsContainer, false);
  }
}

/* Active Filter Chips */
function renderActiveFilters() {
  const container = document.getElementById('active-filters-chips');
  const chipsList = document.getElementById('filter-chips-list');
  if (!container || !chipsList) return;

  chipsList.innerHTML = '';
  let count = 0;

  if (currentOrg) {
    count++;
    const orgName = orgsData[currentOrg]?.name || currentOrg;
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.innerHTML = `${escapeHTML(i18n['organization'] || 'Org')}: ${escapeHTML(orgName)} <button class="filter-chip-remove" aria-label="Remove filter">&times;</button>`;
    chip.querySelector('.filter-chip-remove').onclick = () => {
      const select = document.getElementById('org-filter');
      if (select) select.value = '';
      onOrgChange('');
    };
    chipsList.appendChild(chip);
  }

  if (currentDdc) {
    count++;
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.innerHTML = `DDC: ${escapeHTML(currentDdc)}00s <button class="filter-chip-remove" aria-label="Remove filter">&times;</button>`;
    chip.querySelector('.filter-chip-remove').onclick = () => {
      setDdcFilter('');
    };
    chipsList.appendChild(chip);
  }

  if (currentSearchField && currentSearchField !== 'all') {
    count++;
    const fieldLabel = i18n[`search_field_${currentSearchField}`] || currentSearchField;
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.innerHTML = `Medan: ${escapeHTML(fieldLabel)} <button class="filter-chip-remove" aria-label="Remove filter">&times;</button>`;
    chip.querySelector('.filter-chip-remove').onclick = () => {
      currentSearchField = 'all';
      const select = document.getElementById('search-field');
      if (select) select.value = 'all';
      renderActiveFilters();
      const customInput = document.getElementById('search-input');
      const resultsContainer = document.getElementById('search-results');
      performSearch(customInput ? customInput.value : '', resultsContainer, false);
    };
    chipsList.appendChild(chip);
  }

  if (currentSort && currentSort !== 'relevance') {
    count++;
    const sortLabel = i18n[`sort_${currentSort.replace('-', '_')}`] || currentSort;
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.innerHTML = `Susun: ${escapeHTML(sortLabel)} <button class="filter-chip-remove" aria-label="Remove filter">&times;</button>`;
    chip.querySelector('.filter-chip-remove').onclick = () => {
      currentSort = 'relevance';
      const select = document.getElementById('sort-filter');
      if (select) select.value = 'relevance';
      renderActiveFilters();
      const customInput = document.getElementById('search-input');
      const resultsContainer = document.getElementById('search-results');
      performSearch(customInput ? customInput.value : '', resultsContainer, false);
    };
    chipsList.appendChild(chip);
  }

  container.style.display = count > 0 ? 'flex' : 'none';

  const clearBtn = document.getElementById('clear-all-filters-btn');
  if (clearBtn && !clearBtn._attached) {
    clearBtn._attached = true;
    clearBtn.onclick = () => {
      const orgSelect = document.getElementById('org-filter');
      if (orgSelect) orgSelect.value = '';
      const fieldSelect = document.getElementById('search-field');
      if (fieldSelect) fieldSelect.value = 'all';
      const sortSelect = document.getElementById('sort-filter');
      if (sortSelect) sortSelect.value = 'relevance';
      const input = document.getElementById('search-input');
      if (input) input.value = '';
      const clearSearchBtn = document.getElementById('search-clear-btn');
      if (clearSearchBtn) clearSearchBtn.style.display = 'none';

      currentOrg = null;
      currentDdc = '';
      currentSearchField = 'all';
      currentSort = 'relevance';
      currentQuery = '';
      updateDdcPills();
      renderActiveFilters();
      const resultsContainer = document.getElementById('search-results');
      performSearch('', resultsContainer, false);
    };
  }
}

/* DDC 000-900 Pills Filter */
function initDdcPills() {
  const pillsContainer = document.getElementById('ddc-pills');
  if (!pillsContainer) return;

  pillsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.ddc-pill');
    if (!btn) return;
    const ddcCode = btn.getAttribute('data-ddc') || '';
    setDdcFilter(ddcCode);
  });
}

function setDdcFilter(ddcCode) {
  currentDdc = ddcCode;
  updateDdcPills();
  renderActiveFilters();

  const customInput = document.getElementById('search-input');
  const resultsContainer = document.getElementById('search-results');
  if (resultsContainer) {
    performSearch(customInput ? customInput.value : '', resultsContainer, false);
  }
}

function updateDdcPills() {
  document.querySelectorAll('.ddc-pill').forEach(btn => {
    const code = btn.getAttribute('data-ddc') || '';
    if (code === currentDdc) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function getRecordIdFromUrl(url) {
  if (!url) return null;
  const idMatch = url.match(/[?&]id=([^&#]+)/);
  if (idMatch) return idMatch[1];
  const match = url.match(/(?:\/|^)book\/([^\/\?\#]+)\/?/);
  return match ? match[1] : null;
}

/* Basket Management */
function toggleBasket(recordId) {
  if (basket.has(recordId)) {
    basket.delete(recordId);
  } else {
    basket.add(recordId);
  }
  saveBasket();
  renderBasket();
  updateResultButtonStates();
}

function saveBasket() {
  localStorage.setItem('pustaka-basket', JSON.stringify(Array.from(basket)));
}

function loadBasket() {
  try {
    const saved = localStorage.getItem('pustaka-basket');
    if (saved) {
      basket = new Set(JSON.parse(saved));
    }
  } catch (e) {}
}

function renderBasket() {
  const ul = document.getElementById('basket-items');
  const emptyMsg = document.getElementById('basket-empty');
  const btn = document.getElementById('download-basket-btn');
  const printBtn = document.getElementById('print-basket-slips-btn');
  const countBadge = document.getElementById('basket-count-badge');
  const mobileCountBadge = document.getElementById('mobile-basket-count');
  
  if (countBadge) countBadge.textContent = basket.size;
  if (mobileCountBadge) mobileCountBadge.textContent = basket.size;

  if (!ul) return;
  ul.innerHTML = '';

  if (basket.size === 0) {
    if (emptyMsg) emptyMsg.style.display = 'block';
    if (btn) btn.disabled = true;
    if (printBtn) printBtn.disabled = true;
  } else {
    if (emptyMsg) emptyMsg.style.display = 'none';
    if (btn) btn.disabled = false;
    if (printBtn) printBtn.disabled = false;
    
    basket.forEach(id => {
      const li = document.createElement('li');
      li.textContent = id;
      
      const removeBtn = document.createElement('button');
      removeBtn.textContent = i18n['remove_from_basket'] || 'Remove';
      removeBtn.onclick = () => toggleBasket(id);
      
      li.appendChild(removeBtn);
      ul.appendChild(li);
    });
  }
}

function updateResultButtonStates() {
  document.querySelectorAll('.basket-btn').forEach(btn => {
    const recId = btn.getAttribute('data-id');
    if (recId) {
      const inBasket = basket.has(recId);
      btn.textContent = inBasket ? (i18n['remove_from_basket'] || 'Remove') : (i18n['add_to_basket'] || '+ Add to Basket');
      if (inBasket) {
        btn.classList.add('in-basket');
      } else {
        btn.classList.remove('in-basket');
      }
    }
  });
}

async function downloadBasket() {
  if (basket.size === 0) return;
  
  let xmls = [];
  for (const id of basket) {
    try {
      let res = await fetch(`${BASE_URL}id/${id}.xml`);
      if (!res.ok) {
        const shard = id.substring(0, 2).toLowerCase();
        res = await fetch(`https://raw.githubusercontent.com/pustaka-terbuka/pnm/main/data/bib/${shard}/${id}.xml`);
      }
      if (res.ok) {
        const text = await res.text();
        const matches = text.match(/<record[^>]*>[\s\S]*?<\/record>/gi);
        if (matches) {
          xmls.push(...matches);
        }
      }
    } catch (e) {
      console.error(`Failed to fetch ${id}`, e);
    }
  }
  
  if (xmls.length > 0) {
    const collection = `<?xml version="1.0" encoding="UTF-8"?>\n<collection xmlns="http://www.loc.gov/MARC21/slim">\n${xmls.join('\n')}\n</collection>`;
    const blob = new Blob([collection], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pustaka-basket.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

/* Shelf Slip Printing */
function printBasketSlips() {
  if (basket.size === 0) return;
  const slipsContainer = document.getElementById('print-slips-container');
  if (!slipsContainer) return;

  slipsContainer.innerHTML = '';
  basket.forEach(recId => {
    const slip = document.createElement('div');
    slip.className = 'shelf-slip';
    const holding = orgHoldingsMap[recId];
    const callNum = holding?.call_number || '---';
    slip.innerHTML = `
      <div class="shelf-slip-title">PustakaTerbuka Shelf Slip</div>
      <div class="shelf-slip-id">Record ID: <strong>${escapeHTML(recId)}</strong></div>
      <div class="shelf-slip-call">${escapeHTML(callNum)}</div>
      <div class="shelf-slip-org">Organization: ${escapeHTML(currentOrg || 'National Union Catalog')}</div>
      <div class="shelf-slip-date">Date: ${new Date().toLocaleDateString()}</div>
    `;
    slipsContainer.appendChild(slip);
  });

  window.print();
}

/* MARC21 Inspector Modal Logic */
async function openMarcModal(recordId) {
  const modal = document.getElementById('marc-modal');
  const titleRecId = document.getElementById('marc-modal-record-id');
  const tableContainer = document.getElementById('marc-modal-table-container');
  const loader = document.getElementById('marc-modal-loader');
  const downloadLink = document.getElementById('modal-download-link');

  if (!modal) return;
  if (titleRecId) titleRecId.textContent = recordId;
  if (downloadLink) {
    downloadLink.href = `${BASE_URL}id/${recordId}.xml`;
    downloadLink.download = `${recordId}.xml`;
  }

  if (tableContainer) tableContainer.innerHTML = '';
  if (loader) loader.style.display = 'block';

  if (modal.showModal) {
    modal.showModal();
  } else {
    modal.setAttribute('open', '');
  }

  let xmlText = '';
  try {
    let res = await fetch(`${BASE_URL}id/${recordId}.xml`);
    if (!res.ok) {
      const shard = recordId.substring(0, 2).toLowerCase();
      res = await fetch(`https://raw.githubusercontent.com/pustaka-terbuka/pnm/main/data/bib/${shard}/${recordId}.xml`);
    }
    if (!res.ok) throw new Error('Record XML not accessible.');
    xmlText = await res.text();
  } catch (err) {
    if (loader) loader.style.display = 'none';
    if (tableContainer) {
      tableContainer.innerHTML = `<p style="color:#dc3545;">Error loading MARCXML: ${escapeHTML(err.message)}</p>`;
    }
    return;
  }

  if (loader) loader.style.display = 'none';

  // Parse MARCXML to display table
  renderMarcTable(xmlText, tableContainer, recordId);

  // Setup Toolbar Copy Buttons
  setupModalCopyButtons(xmlText, recordId);
}

function renderMarcTable(xmlText, container, recordId) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  let rows = [];

  // Leader
  const leader = xmlDoc.querySelector('leader');
  if (leader) {
    rows.push(`
      <tr>
        <td><span class="marc-tag-badge">LDR</span></td>
        <td>_</td><td>_</td>
        <td>${escapeHTML(leader.textContent)}</td>
      </tr>
    `);
  }

  // Controlfields
  xmlDoc.querySelectorAll('controlfield').forEach(cf => {
    const tag = cf.getAttribute('tag');
    rows.push(`
      <tr>
        <td><span class="marc-tag-badge">${escapeHTML(tag)}</span></td>
        <td>_</td><td>_</td>
        <td>${escapeHTML(cf.textContent)}</td>
      </tr>
    `);
  });

  // Datafields
  xmlDoc.querySelectorAll('datafield').forEach(df => {
    const tag = df.getAttribute('tag');
    const ind1 = df.getAttribute('ind1') || ' ';
    const ind2 = df.getAttribute('ind2') || ' ';

    let subfieldsHtml = [];
    df.querySelectorAll('subfield').forEach(sf => {
      const code = sf.getAttribute('code');
      subfieldsHtml.push(`<span class="marc-subfield-code">$${escapeHTML(code)}</span>${escapeHTML(sf.textContent)}`);
    });

    rows.push(`
      <tr>
        <td><span class="marc-tag-badge">${escapeHTML(tag)}</span></td>
        <td>${escapeHTML(ind1)}</td>
        <td>${escapeHTML(ind2)}</td>
        <td>${subfieldsHtml.join(' ')}</td>
      </tr>
    `);
  });

  container.innerHTML = `
    <table class="marc-table">
      <thead>
        <tr>
          <th style="width: 70px;">${escapeHTML(i18n['field_tag'] || 'Tag')}</th>
          <th style="width: 40px;">I1</th>
          <th style="width: 40px;">I2</th>
          <th>${escapeHTML(i18n['field_data'] || 'Subfield Data')}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join('')}
      </tbody>
    </table>
  `;
}

function setupModalCopyButtons(xmlText, recordId) {
  const copyXmlBtn = document.getElementById('modal-copy-marcxml-btn');
  const copyTxtBtn = document.getElementById('modal-copy-text-btn');
  const copyCsBtn = document.getElementById('modal-copy-csharp-btn');
  const toast = document.getElementById('modal-toast');

  function showToast() {
    if (toast) {
      toast.style.display = 'inline-block';
      setTimeout(() => { toast.style.display = 'none'; }, 2200);
    }
  }

  if (copyXmlBtn) {
    copyXmlBtn.onclick = () => {
      navigator.clipboard.writeText(xmlText).then(showToast);
    };
  }

  if (copyTxtBtn) {
    copyTxtBtn.onclick = () => {
      // Build plain text representation
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      let text = '';
      doc.querySelectorAll('controlfield, datafield').forEach(f => {
        const tag = f.getAttribute('tag');
        if (f.tagName === 'controlfield') {
          text += `${tag}    ${f.textContent}\n`;
        } else {
          const ind1 = f.getAttribute('ind1') || ' ';
          const ind2 = f.getAttribute('ind2') || ' ';
          let subs = [];
          f.querySelectorAll('subfield').forEach(sf => {
            subs.push(`$${sf.getAttribute('code')} ${sf.textContent}`);
          });
          text += `${tag} ${ind1}${ind2} ${subs.join(' ')}\n`;
        }
      });
      navigator.clipboard.writeText(text).then(showToast);
    };
  }

  if (copyCsBtn) {
    copyCsBtn.onclick = () => {
      const csSnippet = `// PustakaTerbuka C# Copy Cataloging Recipe
using System.Net.Http;
using System.Xml.Linq;

using var client = new HttpClient();
string xml = await client.GetStringAsync("https://pustaka-terbuka.github.io/opac/id/${recordId}.xml");
XDocument doc = XDocument.Parse(xml);
XNamespace ns = "http://www.loc.gov/MARC21/slim";
var title = doc.Descendants(ns + "datafield")
               .FirstOrDefault(d => (string)d.Attribute("tag") == "245")
               ?.Elements(ns + "subfield")
               .FirstOrDefault(s => (string)s.Attribute("code") == "a")?.Value;`;
      navigator.clipboard.writeText(csSnippet).then(showToast);
    };
  }
}

function initMarcModalListeners() {
  const modal = document.getElementById('marc-modal');
  const closeBtn = document.getElementById('marc-modal-close-btn');
  const footerCloseBtn = document.getElementById('modal-footer-close-btn');

  function closeModal() {
    if (modal) {
      if (modal.close) modal.close();
      else modal.removeAttribute('open');
    }
  }

  if (closeBtn) closeBtn.onclick = closeModal;
  if (footerCloseBtn) footerCloseBtn.onclick = closeModal;
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
}

/* Search UI Construction & Execution */
function buildCustomSearchUI() {
  const container = document.getElementById('search-ui');
  if (!container) return;

  container.innerHTML = `
    <form id="search-form">
      <div class="search-input-group">
        <select id="search-field" class="search-field-select" aria-label="Search Field">
          <option value="all" data-i18n="search_field_all">${escapeHTML(i18n['search_field_all'] || 'All Fields')}</option>
          <option value="title" data-i18n="search_field_title">${escapeHTML(i18n['search_field_title'] || 'Title')}</option>
          <option value="author" data-i18n="search_field_author">${escapeHTML(i18n['search_field_author'] || 'Author')}</option>
          <option value="subject" data-i18n="search_field_subject">${escapeHTML(i18n['search_field_subject'] || 'Subject')}</option>
          <option value="isbn" data-i18n="search_field_isbn">${escapeHTML(i18n['search_field_isbn'] || 'ISBN / ISSN')}</option>
          <option value="call" data-i18n="search_field_call">${escapeHTML(i18n['search_field_call'] || 'Call Number')}</option>
        </select>
        <div class="search-input-wrapper">
          <input type="text" id="search-input" autocomplete="off" spellcheck="false" placeholder="${escapeHTML(i18n['search_placeholder'] || 'Search by title, author, ISBN, or subject...')}" />
          <button type="button" id="search-clear-btn" class="search-clear-btn" aria-label="Clear Search" style="display: none;">&times;</button>
          <span class="search-kbd-hint" title="Press / to focus search">/</span>
        </div>
        <button type="submit" id="search-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span>${escapeHTML(i18n['search_button'] || 'Search')}</span>
        </button>
      </div>
    </form>
  `;

  const form = document.getElementById('search-form');
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  const fieldSelect = document.getElementById('search-field');
  const sortSelect = document.getElementById('sort-filter');
  const resultsContainer = document.getElementById('search-results');

  function toggleClearButton() {
    if (clearBtn) {
      clearBtn.style.display = input.value.trim().length > 0 ? 'flex' : 'none';
    }
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      currentQuery = '';
      toggleClearButton();
      input.focus();
      currentPage = 1;
      performSearch('', resultsContainer, false);
    });
  }

  // Instant Search-as-you-type with debouncing (220ms)
  input.addEventListener('input', () => {
    toggleClearButton();
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(async () => {
      currentQuery = input.value;
      currentPage = 1;
      await performSearch(currentQuery, resultsContainer, false);
    }, 220);
  });

  // Instant submit (Enter or button click) cancels debounce and fires immediately
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearTimeout(searchDebounceTimer);
    currentQuery = input.value;
    currentPage = 1;
    await performSearch(currentQuery, resultsContainer, false);
  });

  // Field selector binding
  if (fieldSelect) {
    fieldSelect.addEventListener('change', async (e) => {
      currentSearchField = e.target.value;
      renderActiveFilters();
      currentPage = 1;
      await performSearch(input.value, resultsContainer, false);
    });
  }

  // Sort selector binding
  if (sortSelect) {
    sortSelect.addEventListener('change', async (e) => {
      currentSort = e.target.value;
      renderActiveFilters();
      currentPage = 1;
      await performSearch(input.value, resultsContainer, false);
    });
  }

  // Keyboard shortcut (/ to focus search, Escape to clear/blur)
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== input && !['input', 'textarea', 'select'].includes((document.activeElement?.tagName || '').toLowerCase())) {
      e.preventDefault();
      input.focus();
      input.select();
    } else if (e.key === 'Escape' && document.activeElement === input) {
      if (input.value) {
        input.value = '';
        currentQuery = '';
        toggleClearButton();
        performSearch('', resultsContainer, false);
      } else {
        input.blur();
      }
    }
  });

  performSearch('', resultsContainer, true);
}

window.retryLastSearch = function() {
  const customInput = document.getElementById('search-input');
  const resultsContainer = document.getElementById('search-results');
  if (resultsContainer) {
    performSearch(customInput ? customInput.value : '', resultsContainer, false);
  }
};

function updateSearchStats(count, timeMs) {
  const statsEl = document.getElementById('search-stats');
  if (!statsEl) return;
  if (count === 0 && timeMs === 0) {
    statsEl.style.display = 'none';
    return;
  }
  statsEl.style.display = 'flex';
  let msg = i18n['results_count'] || '{0} results found.';
  msg = msg.replace('{0}', count);
  if (currentOrg) {
    const orgName = orgsData[currentOrg]?.name || currentOrg;
    msg += ` (${orgName})`;
  }
  const timeStr = (i18n['search_time'] || 'in {0}ms').replace('{0}', timeMs);
  statsEl.innerHTML = `
    <span>${escapeHTML(msg)}</span>
    <span class="search-stats-time">⚡ ${escapeHTML(timeStr)}</span>
  `;
}

async function performSearch(query, resultsContainer, isInitial = false) {
  if (!pagefind) {
    resultsContainer.innerHTML = `
      <div class="search-alert-card">
        <h4>${escapeHTML(i18n['index_unavailable'] || 'Indeks Carian Tidak Tersedia / Search Index Unavailable')}</h4>
        <p>PustakaTerbuka search index is not yet initialized. Please reload the page.</p>
      </div>
    `;
    return;
  }

  const currentToken = ++searchSequenceToken;

  resultsContainer.innerHTML = `
    <div class="search-loading-container" role="status" aria-live="polite">
      <div class="search-spinner"></div>
      <div class="search-progress-bar">
        <div class="search-progress-bar-fill"></div>
      </div>
      <p class="search-loading-text">${escapeHTML(i18n['searching'] || 'Mencari rekod katalog... / Searching catalog...')}</p>
      <p class="search-loading-subtext">${escapeHTML(currentOrg ? `Menapis mengikut organisasi: ${orgsData[currentOrg]?.name || currentOrg}` : 'Mencari di seluruh katalog terbuka kebangsaan...')}</p>
    </div>
  `;

  try {
    const searchOpts = {};
    const filters = {};

    if (currentOrg) {
      filters.organization = [currentOrg];
    }
    if (currentDdc) {
      filters.ddc_class = [currentDdc];
    }
    if (Object.keys(filters).length > 0) {
      searchOpts.filters = filters;
    }

    // Sort option
    if (currentSort === 'year-desc') {
      searchOpts.sort = { year: 'desc' };
    } else if (currentSort === 'year-asc') {
      searchOpts.sort = { year: 'asc' };
    } else if (currentSort === 'title-asc') {
      searchOpts.sort = { title: 'asc' };
    }

    let rawTerm = (query && query.trim()) ? query.trim() : null;
    let searchTerm = rawTerm;

    // ISBN Auto-normalization
    if (searchTerm) {
      const isbnCandidate = extractSearchIsbn(searchTerm);
      if (isbnCandidate && currentSearchField === 'isbn') {
        searchTerm = isbnCandidate;
      }
    }

    // High performance search: if empty query, use filter-only browse (searchTerm = null)
    if (!searchTerm) {
      if (currentOrg || currentDdc || isInitial) {
        searchTerm = null; // Filter-only browse mode: instant, no heavy chunk parsing
      } else {
        updateSearchStats(0, 0);
        resultsContainer.innerHTML = `<p class="search-empty-note">${escapeHTML(i18n['no_results'] || 'No records found.')}</p>`;
        hidePagination();
        return;
      }
    }

    const tStart = performance.now();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Search request timed out after 8 seconds. Please check your network connection or try again.')), 8000);
    });

    const search = await Promise.race([
      pagefind.search(searchTerm, searchOpts),
      timeoutPromise
    ]);

    const tDuration = Math.round(performance.now() - tStart);
    lastSearchTimeMs = tDuration;

    // Guard against race conditions from previous in-flight requests
    if (currentToken !== searchSequenceToken) {
      return;
    }

    if (!search || !search.results || search.results.length === 0) {
      updateSearchStats(0, tDuration);
      resultsContainer.innerHTML = `<p class="search-empty-note">${escapeHTML(i18n['no_results'] || 'No records found.')}</p>`;
      hidePagination();
      return;
    }

    let results = search.results;

    // Field-specific targeting if field is explicitly selected
    if (rawTerm && currentSearchField !== 'all') {
      const termLower = rawTerm.toLowerCase();
      const topCandidates = await Promise.all(
        results.slice(0, 60).map(async r => ({
          res: r,
          data: await getResultData(r)
        }))
      );

      const matched = [];
      const remainder = [];

      for (const item of topCandidates) {
        const meta = item.data?.meta || {};
        let matches = false;
        if (currentSearchField === 'title') {
          matches = meta.title && meta.title.toLowerCase().includes(termLower);
        } else if (currentSearchField === 'author') {
          matches = meta.author && meta.author.toLowerCase().includes(termLower);
        } else if (currentSearchField === 'subject') {
          const subjects = item.data?.filters?.subject || [];
          matches = subjects.some(s => s.toLowerCase().includes(termLower));
        } else if (currentSearchField === 'isbn') {
          const isbn = (meta.isbn || '').replace(/[-\s]/g, '');
          matches = isbn.includes(termLower.replace(/[-\s]/g, ''));
        } else if (currentSearchField === 'call') {
          const call = `${meta.call_number || ''} ${meta.ddc || ''} ${meta.lcc || ''}`.toLowerCase();
          matches = call.includes(termLower);
        }

        if (matches) {
          matched.push(item.res);
        } else {
          remainder.push(item.res);
        }
      }

      if (matched.length > 0) {
        results = matched;
      }
    }

    currentSearchResults = results;
    currentPage = 1;
    updateSearchStats(currentSearchResults.length, tDuration);
    await renderCurrentPage(resultsContainer, isInitial);
  } catch (err) {
    if (currentToken !== searchSequenceToken) return;
    console.error('Search failed:', err);
    hidePagination();
    updateSearchStats(0, 0);
    resultsContainer.innerHTML = `
      <div class="search-alert-card" role="alert">
        <h4>⚠️ Ralat Semasa Carian / Search Error</h4>
        <p>${escapeHTML(err.message || 'Carian mengambil masa terlalu lama atau gagal dimuatkan.')}</p>
        <button type="button" class="btn-retry-search" onclick="retryLastSearch()">Cuba Semula / Retry</button>
      </div>
    `;
  }
}

async function renderCurrentPage(resultsContainer, isInitial = false) {
  resultsContainer.innerHTML = '';

  const totalResults = currentSearchResults.length;
  const totalPages = Math.ceil(totalResults / PAGE_SIZE);

  if (isInitial && !currentOrg && !currentDdc && !currentQuery) {
    resultsContainer.innerHTML = `<p style="color:var(--text-muted); margin-bottom:1rem;">📚 <strong>Sorotan Katalog Kebangsaan:</strong> Memaparkan judul terkini. Gunakan kotak carian di atas atau butang DDC untuk menapis.</p>`;
  }

  const list = document.createElement('div');
  list.className = 'results-list';

  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalResults);
  const pageSlice = currentSearchResults.slice(startIndex, endIndex);

  // Parallel hydration for high-speed rendering
  const itemsData = await Promise.all(
    pageSlice.map(async (res) => {
      try {
        const data = await getResultData(res);
        return { res, data };
      } catch (itemErr) {
        console.warn('Failed to load search result item:', itemErr);
        return null;
      }
    })
  );

  for (const item of itemsData) {
    if (!item || !item.data) continue;
    const { res, data } = item;
    const node = document.createElement('div');
    node.className = 'result-item';

    const url = data.url;
    const recordId = getRecordIdFromUrl(url) || 'unknown';
    const bookUrl = (recordId !== 'unknown') ? `${BASE_URL}book/?id=${recordId}` : url;

    const isbn = data.meta?.isbn || '';
    let thumbHtml = '';
    if (isbn) {
      thumbHtml = `<div class="result-thumb-wrapper">
        <img src="https://covers.openlibrary.org/b/isbn/${escapeHTML(isbn)}-M.jpg?default=false" 
             alt="Cover for ${escapeHTML(data.meta.title || '')}" 
             class="result-thumb-img" 
             loading="lazy" 
             onerror="this.onerror=null; this.src='https://books.google.com/books/content?vid=isbn${escapeHTML(isbn)}&printsec=frontcover&img=1&zoom=1'; this.onerror=()=>this.parentElement.style.display='none';" />
      </div>`;
    }

    const titleHtml = `<h3><a href="${escapeHTML(bookUrl)}">${escapeHTML(data.meta.title || 'Untitled')}</a></h3>`;
    const authorHtml = data.meta.author ? `<p class="result-author"><strong>${escapeHTML(data.meta.author)}</strong></p>` : '';
    const publisherHtml = data.meta.publisher ? `<p class="result-publisher">${escapeHTML(data.meta.publisher)}</p>` : '';
    const excerptHtml = (currentQuery && data.excerpt) ? `<div class="result-excerpt">${data.excerpt}</div>` : '';

    // Meta badges (Format, Call number, Year, DDC, LCC, ISBN)
    let badgesHtml = '<div class="result-meta-badges">';
    if (data.meta?.format) {
      badgesHtml += `<span class="badge badge-format">${escapeHTML(data.meta.format)}</span>`;
    }
    if (data.meta?.ddc) {
      badgesHtml += `<span class="badge badge-ddc">DDC ${escapeHTML(data.meta.ddc)}</span>`;
    }
    if (data.meta?.lcc) {
      badgesHtml += `<span class="badge badge-lcc">LCC ${escapeHTML(data.meta.lcc)}</span>`;
    }
    if (data.meta?.year) {
      badgesHtml += `<span class="badge badge-year">${escapeHTML(data.meta.year)}</span>`;
    }
    if (isbn) {
      badgesHtml += `<span class="badge badge-year">ISBN ${escapeHTML(isbn)}</span>`;
    }
    badgesHtml += '</div>';

    node.innerHTML = `
      <div class="result-card-inner">
        ${thumbHtml}
        <div class="result-body">
          <div class="result-title-row">
            ${titleHtml}
          </div>
          ${authorHtml}
          ${publisherHtml}
          ${badgesHtml}
          ${excerptHtml}
        </div>
      </div>`;

    // Actions
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'actions';

    const inBasket = basket.has(recordId);
    const btn = document.createElement('button');
    btn.className = 'basket-btn' + (inBasket ? ' in-basket' : '');
    btn.setAttribute('data-id', recordId);
    btn.textContent = inBasket ? (i18n['remove_from_basket'] || 'Remove') : (i18n['add_to_basket'] || '+ Add to Basket');
    btn.onclick = (e) => {
      e.preventDefault();
      toggleBasket(recordId);
    };

    const marcBtn = document.createElement('button');
    marcBtn.className = 'marc-btn';
    marcBtn.textContent = i18n['marc_preview'] || '👁️ MARC Tags';
    marcBtn.onclick = (e) => {
      e.preventDefault();
      openMarcModal(recordId);
    };

    const dlBtn = document.createElement('a');
    dlBtn.href = `${BASE_URL}id/${recordId}.xml`;
    dlBtn.download = `${recordId}.xml`;
    dlBtn.className = 'download-btn';
    dlBtn.textContent = i18n['download_record'] || '⬇ MARCXML';

    const viewBtn = document.createElement('a');
    viewBtn.href = bookUrl;
    viewBtn.className = 'opac-link-btn';
    viewBtn.textContent = i18n['view_details'] || 'View Record →';

    actionsDiv.appendChild(btn);
    actionsDiv.appendChild(marcBtn);
    actionsDiv.appendChild(dlBtn);
    actionsDiv.appendChild(viewBtn);

    if (currentOrg && orgHoldingsMap[recordId]) {
      const callNum = orgHoldingsMap[recordId].call_number;
      const holdingsDiv = document.createElement('div');
      holdingsDiv.className = 'holdings-info';
      holdingsDiv.innerHTML = `<strong>${escapeHTML(i18n['held_by'] || 'Held by: ')}${escapeHTML(currentOrg)}</strong><br>
        Call Number: <span class="badge badge-call">${escapeHTML(callNum)}</span>
        <div class="availability-note">${escapeHTML(i18n['availability_note'] || 'Please check availability in the organization catalog.')}</div>`;
      node.appendChild(holdingsDiv);
    }

    node.appendChild(actionsDiv);
    list.appendChild(node);
  }

  resultsContainer.appendChild(list);
  renderPaginationControls(resultsContainer, totalPages);
}

/* Pagination UI */
function hidePagination() {
  const nav = document.getElementById('pagination-controls');
  if (nav) nav.style.display = 'none';
}

function renderPaginationControls(resultsContainer, totalPages) {
  const nav = document.getElementById('pagination-controls');
  if (!nav) return;

  if (totalPages <= 1) {
    nav.style.display = 'none';
    return;
  }

  nav.style.display = 'flex';
  nav.innerHTML = '';

  // Prev Button
  const prevBtn = document.createElement('button');
  prevBtn.className = 'pagination-btn';
  prevBtn.textContent = i18n['pagination_prev'] || '← Previous';
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = async () => {
    if (currentPage > 1) {
      currentPage--;
      await renderCurrentPage(resultsContainer);
      resultsContainer.scrollIntoView({ behavior: 'smooth' });
    }
  };
  nav.appendChild(prevBtn);

  // Page Numbers
  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let p = startPage; p <= endPage; p++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = 'pagination-btn' + (p === currentPage ? ' active' : '');
    pageBtn.textContent = p;
    pageBtn.onclick = async () => {
      currentPage = p;
      await renderCurrentPage(resultsContainer);
      resultsContainer.scrollIntoView({ behavior: 'smooth' });
    };
    nav.appendChild(pageBtn);
  }

  // Next Button
  const nextBtn = document.createElement('button');
  nextBtn.className = 'pagination-btn';
  nextBtn.textContent = i18n['pagination_next'] || 'Next →';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = async () => {
    if (currentPage < totalPages) {
      currentPage++;
      await renderCurrentPage(resultsContainer);
      resultsContainer.scrollIntoView({ behavior: 'smooth' });
    }
  };
  nav.appendChild(nextBtn);
}

/* Mobile Sidebar Drawer */
function initMobileDrawer() {
  const toggleBtn = document.getElementById('mobile-basket-toggle');
  const sidebar = document.getElementById('catalog-sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
    });
  }
}

/* Initialization */
async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  currentLang = urlParams.get('lang') || 'en';
  document.documentElement.lang = currentLang;
  
  initTheme();
  updateLangSelect();
  await loadI18n(currentLang);
  
  loadBasket();
  renderBasket();
  initDdcPills();
  initMarcModalListeners();
  initMobileDrawer();
  
  await loadOrgs();

  window.addEventListener('pageshow', () => {
    loadBasket();
    renderBasket();
  });
  window.addEventListener('focus', () => {
    loadBasket();
    renderBasket();
  });
  
  const dlBasketBtn = document.getElementById('download-basket-btn');
  if (dlBasketBtn) dlBasketBtn.addEventListener('click', downloadBasket);

  const printSlipsBtn = document.getElementById('print-basket-slips-btn');
  if (printSlipsBtn) printSlipsBtn.addEventListener('click', printBasketSlips);
  
  try {
    pagefind = await import(`${BASE_URL}pagefind/pagefind.js`);
    await pagefind.init();
    
    buildCustomSearchUI();
    await loadOrgs();
  } catch (err) {
    console.error('Pagefind not found or failed to load. Are you running a built site?', err);
    const searchUi = document.getElementById('search-ui');
    if (searchUi) searchUi.textContent = 'Search index not available.';
  }
}

document.addEventListener('DOMContentLoaded', init);
