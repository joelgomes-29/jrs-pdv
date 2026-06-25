
const state = {
  token: localStorage.getItem('jrs_token'),
  user: JSON.parse(localStorage.getItem('jrs_user') || 'null'),
  stores: [], products: [], sellers: [], customers: [], suppliers: [],
  finance_categories: [], noteItems: [], nfeItems: [],
  currentSection: 'dashboard',
};

// ==================== HELPERS ====================

const $ = id => document.getElementById(id);
const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtDate = d => d ? d.substring(0, 10).split('-').reverse().join('/') : '—';
const payLabel = { DINHEIRO: 'Dinheiro', PIX: 'PIX', CARTAO_CREDITO: 'Cartão Crédito', CARTAO_DEBITO: 'Cartão Débito', CREDIARIO: 'Crediário', BOLETO: 'Boleto' };

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + state.token },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

function showToast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

function populateSelect(sel, items, valKey, labelKey, addEmpty) {
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = addEmpty ? `<option value="">${addEmpty}</option>` : '';
  items.forEach(it => {
    const o = document.createElement('option');
    o.value = it[valKey];
    o.textContent = it[labelKey];
    sel.appendChild(o);
  });
  if (cur) sel.value = cur;
}

function makeTable(headers, rows) {
  if (!rows.length) return '<div class="empty-state">Nenhum registro encontrado</div>';
  return `<table class="data-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c !== null && c !== undefined ? c : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// ==================== AUTH ====================

async function doLogin() {
  const username = $('loginUser').value.trim();
  const password = $('loginPass').value;
  if (!username || !password) return;
  try {
    const data = await api('POST', '/api/login', { username, password });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('jrs_token', data.token);
    localStorage.setItem('jrs_user', JSON.stringify(data.user));
    $('loginError').textContent = '';
    initApp();
  } catch (e) {
    $('loginError').textContent = e.message;
  }
}

function doLogout() {
  localStorage.removeItem('jrs_token');
  localStorage.removeItem('jrs_user');
  location.reload();
}

$('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

// ==================== INIT ====================

async function initApp() {
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('sidebarUser').textContent = state.user?.name || '';

  try {
    const boot = await api('GET', '/api/bootstrap');
    state.stores = boot.stores || [];
    state.products = boot.products || [];
    state.sellers = boot.sellers || [];
    state.customers = boot.customers || [];
    state.suppliers = boot.suppliers || [];
    state.finance_categories = boot.finance_categories || [];
  } catch (e) {
    showToast('Erro ao carregar dados: ' + e.message, 'error');
  }

  populateAllStoreSelects();
  setupNav();
  loadDashboard();
}

function populateAllStoreSelects() {
  const storeSelects = [
    'globalStore', 'saleStore', 'imeiStore', 'imeiFilterStore',
    'neStore', 'movFrom', 'movTo', 'retStore', 'stockFilterStore',
    'nfeStore', 'nfeListStore', 'cfgStore', 'finStore', 'cpStore',
    'crStore', 'salesFilterStore', 'rpStore', 'sellerStoreId',
    'pedStore', 'caixaStore', 'fcStore', 'invStore', 'compStore',
    'rsellerStore', 'rentStore',
  ];
  storeSelects.forEach(id => {
    const el = $(id);
    if (!el) return;
    const hasEmpty = el.querySelector('option[value=""]');
    const emptyLabel = hasEmpty ? hasEmpty.textContent : 'Todas as lojas';
    el.innerHTML = `<option value="">${emptyLabel}</option>`;
    state.stores.forEach(s => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.name;
      el.appendChild(o);
    });
  });

  populateSelect($('saleProduct'), state.products.filter(p => p.active), 'id', 'name', 'Selecione...');
  populateSelect($('imeiProduct'), state.products.filter(p => p.active), 'id', 'name', 'Selecione...');
  populateSelect($('nfeStore'), state.stores, 'id', 'name', 'Selecione...');
  populateSelect($('cfgStore'), state.stores, 'id', 'name', 'Selecione...');

  const supplierSelects = ['neSupplier', 'cpSupplier'];
  supplierSelects.forEach(id => populateSelect($(id), state.suppliers, 'id', 'name', 'Selecione...'));
  populateSelect($('crCustomer'), state.customers, 'id', 'name', 'Nenhum');
  populateSelect($('saleCustomer'), state.customers, 'id', 'name', 'Consumidor Final');
}

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const section = el.dataset.section;
      if (section) navigateTo(section);
    });
  });
}

function navigateTo(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Cadastros genéricos (espelho RAJ): cad:<colecao>
  if (section.startsWith('cad:')) {
    const name = section.slice(4);
    $('sec-cadastro').classList.add('active');
    const navG = document.querySelector(`[data-section="${section}"]`);
    if (navG) navG.classList.add('active');
    state.currentSection = section;
    $('topbarTitle').textContent = (CAD[name] && CAD[name].title) || 'Cadastro';
    openCadastro(name);
    return;
  }

  const sec = $('sec-' + section);
  if (sec) sec.classList.add('active');

  const navItem = document.querySelector(`[data-section="${section}"]`);
  if (navItem) navItem.classList.add('active');

  const titles = {
    'dashboard': 'Dashboard', 'pdv': 'PDV · Ponto de Venda',
    'imei': 'IMEI · Entrada Direta', 'note-entry': 'Entrada de Nota',
    'movements': 'Transferências', 'stock': 'Posição de Estoque',
    'nfe-emit': 'Emitir NF-e', 'nfe-list': 'NF-e Emitidas',
    'nfe-config': 'Config Fiscal', 'finance': 'Financeiro',
    'contas-pagar': 'Contas a Pagar', 'contas-receber': 'Contas a Receber',
    'products': 'Produtos', 'suppliers': 'Fornecedores',
    'customers': 'Clientes', 'sellers': 'Vendedores', 'stores': 'Lojas',
    'sales': 'Vendas', 'report-product': 'Fat. por Produto',
    'report-store': 'Fat. por Loja',
    'pedidos': 'Pedidos', 'pedidos-aprov': 'Aprovação Financeiro',
    'caixa': 'Caixa', 'fluxo-caixa': 'Fluxo de Caixa',
    'inventario': 'Inventário', 'compras': 'Compras',
    'saida': 'Saída de Material', 'defeito': 'Produtos com Defeito',
    'report-seller': 'Faturamento por Vendedor', 'report-receivable': 'Saldo a Receber por Cliente',
    'report-entries': 'Relatório de Entradas',
  };
  $('topbarTitle').textContent = titles[section] || section;
  state.currentSection = section;

  const loaders = {
    'dashboard': loadDashboard,
    'pdv': loadPdv,
    'imei': loadImeis,
    'note-entry': loadNoteEntries,
    'movements': loadMovements,
    'stock': loadStock,
    'nfe-list': loadNfeList,
    'nfe-emit': initNfeEmit,
    'nfe-config': () => loadNfeCfgForm(),
    'finance': loadFinance,
    'contas-pagar': loadCp,
    'contas-receber': loadCr,
    'products': loadProducts,
    'suppliers': loadSuppliers,
    'customers': loadCustomers,
    'sellers': loadSellers,
    'stores': loadStores,
    'sales': loadSales,
    'report-product': loadReportProduct,
    'report-store': loadReportStore,
    'pedidos': loadPedidos,
    'pedidos-aprov': loadPedidosAprov,
    'caixa': loadCaixa,
    'fluxo-caixa': loadFluxoCaixa,
    'inventario': loadInv,
    'compras': loadCompras,
    'saida': () => {},
    'defeito': loadDefeito,
    'report-seller': loadReportSeller,
    'report-receivable': loadReportReceivable,
    'report-entries': loadReportEntries,
  };
  if (loaders[section]) loaders[section]();
}

function toggleSidebar() {
  $('sidebar').classList.toggle('collapsed');
}

function onGlobalStoreChange() {
  const loaders = {
    'dashboard': loadDashboard,
    'stock': loadStock,
    'imei': loadImeis,
    'note-entry': loadNoteEntries,
    'sales': loadSales,
  };
  if (loaders[state.currentSection]) loaders[state.currentSection]();
}

// ==================== DASHBOARD ====================

async function loadDashboard() {
  try {
    const d = await api('GET', '/api/dashboard');
    $('dashCards').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(34,197,94,.15);color:#22c55e">&#128200;</div>
        <div class="kpi-info"><div class="kpi-value">${d.today_sales}</div><div class="kpi-label">Vendas Hoje</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(37,99,235,.15);color:#2563eb">&#128176;</div>
        <div class="kpi-info"><div class="kpi-value">${fmt(d.today_revenue)}</div><div class="kpi-label">Receita Hoje</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(246,197,0,.15);color:#f6c500">&#128241;</div>
        <div class="kpi-info"><div class="kpi-value">${d.total_stock}</div><div class="kpi-label">Estoque Disponível</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(239,68,68,.15);color:#ef4444">&#128196;</div>
        <div class="kpi-info"><div class="kpi-value">${fmt(d.contas_pagar_pendente)}</div><div class="kpi-label">A Pagar (pendente)</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(168,85,247,.15);color:#a855f7">&#128179;</div>
        <div class="kpi-info"><div class="kpi-value">${fmt(d.contas_receber_pendente)}</div><div class="kpi-label">A Receber (pendente)</div></div>
      </div>
    `;

    $('dashStoreTable').innerHTML = makeTable(
      ['Loja', 'Estoque', 'Vendas Hoje'],
      (d.store_totals || []).map(s => [s.store_name, s.stock, s.today_sales])
    );

    $('dashRecentSales').innerHTML = makeTable(
      ['Produto', 'IMEI', 'Valor', 'Pagamento'],
      (d.recent_sales || []).map(s => [s.product_name, s.imei, fmt(s.price), payLabel[s.payment_method] || s.payment_method])
    );
  } catch (e) {
    showToast('Erro dashboard: ' + e.message, 'error');
  }
}

// ==================== PDV ====================

async function loadPdv() {
  populateSelect($('saleStore'), state.stores, 'id', 'name', 'Selecione a loja...');
  populateSelect($('saleProduct'), state.products.filter(p => p.active), 'id', 'name', 'Selecione o produto...');
  populateSelect($('saleCustomer'), state.customers, 'id', 'name', 'Consumidor Final');
  onSaleStoreChange();
  await loadPdvHistory();
}

function onSaleStoreChange() {
  const storeId = Number($('saleStore').value);
  const storeSellers = storeId ? state.sellers.filter(s => s.store_id === storeId) : state.sellers;
  populateSelect($('saleSeller'), storeSellers, 'id', 'name', 'Selecione...');
  updatePdvSummary();
}

function priceFor(product, storeId) {
  if (product && product.prices && storeId && product.prices[storeId] > 0) return product.prices[storeId];
  return product ? product.price : 0;
}

function onSaleProductChange() {
  const product = state.products.find(p => p.id === Number($('saleProduct').value));
  const storeId = Number($('saleStore').value);
  if (product && !$('salePrice').value) $('salePrice').value = priceFor(product, storeId);
  updatePdvSummary();
}

async function lookupImei() {
  const imei = $('saleImei').value.trim();
  const storeId = Number($('saleStore').value);
  if (!imei || !storeId) return updatePdvSummary();
  try {
    const units = await api('GET', `/api/imeis?store_id=${storeId}&status=AVAILABLE`);
    const unit = units.find(u => u.imei === imei);
    if (unit) {
      $('saleProduct').value = unit.product_id;
      const product = state.products.find(p => p.id === unit.product_id);
      if (product && !$('salePrice').value) $('salePrice').value = priceFor(product, storeId);
    } else if (imei.length > 5) {
      showToast('IMEI não encontrado nesta loja', 'error');
    }
  } catch { }
  updatePdvSummary();
}

function updatePdvSummary() {
  const imei = $('saleImei')?.value?.trim();
  const price = Number($('salePrice')?.value || 0);
  const product = state.products.find(p => p.id === Number($('saleProduct')?.value));
  const store = state.stores.find(s => s.id === Number($('saleStore')?.value));
  const seller = state.sellers.find(s => s.id === Number($('saleSeller')?.value));
  const payment = $('salePayment')?.value;

  if (!imei && !price) {
    $('pdvEmpty').classList.remove('hidden');
    $('pdvInfo').classList.add('hidden');
    return;
  }
  $('pdvEmpty').classList.add('hidden');
  $('pdvInfo').classList.remove('hidden');
  $('sumProduct').textContent = product ? product.name : '—';
  $('sumImei').textContent = imei || '—';
  $('sumStore').textContent = store ? store.name : '—';
  $('sumSeller').textContent = seller ? seller.name : '—';
  $('sumPayment').textContent = payLabel[payment] || payment || '—';
  $('sumPrice').textContent = fmt(price);
}

async function confirmSale() {
  const imei = $('saleImei').value.trim();
  const product_id = $('saleProduct').value;
  const store_id = $('saleStore').value;
  const seller_id = $('saleSeller').value;
  const customer_id = $('saleCustomer').value;
  const price = $('salePrice').value;
  const payment_method = $('salePayment').value;
  const notes = $('saleNotes').value;

  if (!imei) return showToast('Informe o IMEI', 'error');
  if (!store_id) return showToast('Selecione a loja', 'error');
  if (!price) return showToast('Informe o preço', 'error');

  try {
    await api('POST', '/api/sell', { imei, product_id, store_id, seller_id, customer_id, price: Number(price), payment_method, notes });
    showToast('Venda registrada com sucesso!');
    $('saleImei').value = '';
    $('salePrice').value = '';
    $('saleNotes').value = '';
    updatePdvSummary();
    loadPdvHistory();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function loadPdvHistory() {
  try {
    const storeId = $('saleStore')?.value;
    const url = storeId ? `/api/sales?store_id=${storeId}` : '/api/sales';
    const sales = await api('GET', url);
    const recent = sales.slice(-8).reverse();
    $('pdvSaleHistory').innerHTML = makeTable(
      ['Produto', 'IMEI', 'Valor', 'Pagamento', 'Data'],
      recent.map(s => [s.product_name, s.imei, fmt(s.price), payLabel[s.payment_method] || s.payment_method, fmtDate(s.created_at)])
    );
  } catch { }
}

// ==================== IMEI ====================

function showImeiForm() { $('imeiFormWrap').classList.remove('hidden'); }
function hideImeiForm() { $('imeiFormWrap').classList.add('hidden'); }

async function submitImei() {
  const store_id = $('imeiStore').value;
  const product_id = $('imeiProduct').value;
  const imeis = $('imeiList').value.trim().split('\n').map(x => x.trim()).filter(Boolean);
  const color = $('imeiColor').value;
  const storage = $('imeiStorage').value;
  const unit_cost = $('imeiCost').value;

  if (!store_id) return showToast('Selecione a loja', 'error');
  if (!product_id) return showToast('Selecione o produto', 'error');
  if (!imeis.length) return showToast('Informe pelo menos 1 IMEI', 'error');

  try {
    const r = await api('POST', '/api/imeis', { imeis, store_id: Number(store_id), product_id: Number(product_id), color, storage, unit_cost: Number(unit_cost || 0) });
    showToast(`${r.added} IMEI(s) registrado(s)${r.duplicates ? `. ${r.duplicates} duplicado(s) ignorado(s)` : ''}`);
    $('imeiList').value = '';
    hideImeiForm();
    loadImeis();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function loadImeis() {
  const storeId = $('imeiFilterStore')?.value || $('globalStore')?.value || '';
  const status = $('imeiFilterStatus')?.value || '';
  const search = $('imeiSearch')?.value?.trim() || '';
  let url = '/api/imeis?';
  if (storeId) url += `store_id=${storeId}&`;
  if (status) url += `status=${status}&`;
  try {
    let units = await api('GET', url);
    if (search) units = units.filter(u => u.imei.includes(search));
    const store = id => (state.stores.find(s => s.id === id) || {}).name || id;
    const prod = id => (state.products.find(p => p.id === id) || {}).name || id;
    $('imeiTable').innerHTML = makeTable(
      ['IMEI', 'Produto', 'Loja', 'Cor', 'Status', 'Data'],
      units.map(u => [
        u.imei, prod(u.product_id), store(u.store_id), u.color || '—',
        u.status === 'AVAILABLE' ? '<span class="badge badge-green">Disponível</span>' : '<span class="badge badge-red">Vendido</span>',
        fmtDate(u.created_at),
      ])
    );
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

// ==================== NOTE ENTRY ====================

function showNoteEntryForm() {
  populateSelect($('neStore'), state.stores, 'id', 'name', 'Selecione...');
  populateSelect($('neSupplier'), state.suppliers, 'id', 'name', 'Selecione...');
  state.noteItems = [];
  $('noteItems').innerHTML = '';
  addNoteItem();
  $('noteEntryFormWrap').classList.remove('hidden');
}

function hideNoteEntryForm() { $('noteEntryFormWrap').classList.add('hidden'); }

function addNoteItem() {
  const idx = state.noteItems.length;
  state.noteItems.push({ product_id: '', imeis: '', color: '', storage: '', unit_cost: 0 });
  const div = document.createElement('div');
  div.className = 'note-item-row card';
  div.id = 'note-item-' + idx;
  div.style.cssText = 'margin-bottom:.5rem;padding:1rem;border:1px solid var(--border)';
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">
      <strong>Item ${idx + 1}</strong>
      <button class="btn btnGhost btn-sm" onclick="removeNoteItem(${idx})">Remover</button>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label>Produto</label>
        <select onchange="state.noteItems[${idx}].product_id=this.value">
          <option value="">Selecione...</option>
          ${state.products.filter(p => p.active).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Cor</label>
        <input type="text" placeholder="Ex: Preto" onchange="state.noteItems[${idx}].color=this.value" />
      </div>
      <div class="form-group">
        <label>Armazenamento</label>
        <input type="text" placeholder="Ex: 128GB" onchange="state.noteItems[${idx}].storage=this.value" />
      </div>
      <div class="form-group">
        <label>Custo unit. (R$)</label>
        <input type="number" step="0.01" min="0" onchange="state.noteItems[${idx}].unit_cost=Number(this.value)" />
      </div>
      <div class="form-group full-span">
        <label>IMEIs (um por linha)</label>
        <textarea rows="4" placeholder="Um IMEI por linha..." onchange="state.noteItems[${idx}].imeis=this.value"></textarea>
      </div>
    </div>
  `;
  $('noteItems').appendChild(div);
}

function removeNoteItem(idx) {
  const el = $('note-item-' + idx);
  if (el) el.remove();
  state.noteItems[idx] = null;
}

async function parseNfeXml() {
  const file = $('neXml').files[0];
  if (!file) return;
  const xml = await file.text();
  try {
    const data = await api('POST', '/api/nfe/parse', { xml });
    if (data.nota_number) $('neNumber').value = data.nota_number;
    if (data.supplier_name) showToast(`Fornecedor: ${data.supplier_name}`);
    if (data.items && data.items.length) {
      state.noteItems = [];
      $('noteItems').innerHTML = '';
      for (const item of data.items) {
        addNoteItem();
        const idx = state.noteItems.length - 1;
        state.noteItems[idx] = { ...state.noteItems[idx], unit_cost: item.unit_price };
        const row = document.getElementById('note-item-' + idx);
        if (row) {
          const nameEl = row.querySelector('select');
          const prod = state.products.find(p => p.name.toLowerCase().includes(item.product_name.toLowerCase().substring(0, 6)));
          if (prod && nameEl) { nameEl.value = prod.id; state.noteItems[idx].product_id = prod.id; }
          const costEl = row.querySelectorAll('input[type="number"]')[0];
          if (costEl) costEl.value = item.unit_price;
        }
      }
      showToast(`${data.items.length} item(ns) importado(s) do XML`);
    }
  } catch (e) {
    showToast('Erro ao ler XML: ' + e.message, 'error');
  }
}

async function submitNoteEntry() {
  const store_id = $('neStore').value;
  const supplier_id = $('neSupplier').value;
  const nota_number = $('neNumber').value;
  const total_value = $('neTotal').value;

  if (!store_id) return showToast('Selecione a loja', 'error');

  const items = state.noteItems.filter(Boolean).filter(i => i.product_id);
  if (!items.length) return showToast('Adicione pelo menos 1 item', 'error');

  const validItems = items.map(i => ({
    product_id: i.product_id,
    imeis: i.imeis,
    color: i.color,
    storage: i.storage,
    unit_cost: i.unit_cost,
  }));

  try {
    const r = await api('POST', '/api/note-entry', {
      store_id: Number(store_id),
      supplier_id: supplier_id ? Number(supplier_id) : null,
      nota_number,
      total_value: Number(total_value || 0),
      items: validItems,
    });
    showToast(`Entrada registrada! ${r.imeis_added} IMEI(s) adicionado(s) ao estoque.`);
    hideNoteEntryForm();
    loadNoteEntries();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function loadNoteEntries() {
  const storeId = $('globalStore')?.value || '';
  const url = '/api/note-entries' + (storeId ? `?store_id=${storeId}` : '');
  try {
    const entries = await api('GET', url);
    const store = id => (state.stores.find(s => s.id === id) || {}).name || id;
    const sup = id => (state.suppliers.find(s => s.id === id) || {}).name || '—';
    $('noteEntryTable').innerHTML = makeTable(
      ['NF', 'Loja', 'Fornecedor', 'Total', 'IMEIs', 'Data'],
      entries.reverse().map(e => [
        e.nota_number || `#${e.id}`, store(e.store_id), sup(e.supplier_id),
        fmt(e.total_value), (e.items || []).reduce((a, i) => a + (i.qty || 0), 0),
        fmtDate(e.created_at),
      ])
    );
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

// ==================== MOVEMENTS ====================

async function submitMove() {
  const imei = $('movImei').value.trim();
  const from_store_id = $('movFrom').value;
  const to_store_id = $('movTo').value;
  const notes = $('movNotes').value;
  if (!imei || !from_store_id || !to_store_id) return showToast('Preencha todos os campos', 'error');
  if (from_store_id === to_store_id) return showToast('Origem e destino iguais', 'error');
  try {
    await api('POST', '/api/service-move', { imei, from_store_id: Number(from_store_id), to_store_id: Number(to_store_id), notes });
    showToast('IMEI transferido com sucesso!');
    $('movImei').value = ''; $('movNotes').value = '';
    loadMovements();
  } catch (e) { showToast(e.message, 'error'); }
}

async function submitReturn() {
  const imei = $('retImei').value.trim();
  const store_id = $('retStore').value;
  const notes = $('retNotes').value;
  if (!imei || !store_id) return showToast('Preencha todos os campos', 'error');
  try {
    await api('POST', '/api/service-return', { imei, store_id: Number(store_id), notes });
    showToast('IMEI devolvido ao estoque!');
    $('retImei').value = ''; $('retNotes').value = '';
    loadMovements();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadMovements() {
  try {
    const moves = await api('GET', '/api/movements');
    const store = id => (state.stores.find(s => s.id === id) || {}).name || '—';
    $('movTable').innerHTML = makeTable(
      ['IMEI', 'Tipo', 'Origem', 'Destino', 'Obs', 'Data'],
      moves.reverse().map(m => [
        m.imei,
        m.type === 'TRANSFER' ? '<span class="badge badge-blue">Transferência</span>' : '<span class="badge badge-yellow">Devolução</span>',
        m.from_store_id ? store(m.from_store_id) : '—',
        m.to_store_id ? store(m.to_store_id) : '—',
        m.notes || '—', fmtDate(m.created_at),
      ])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==================== STOCK ====================

async function loadStock() {
  const storeId = $('stockFilterStore')?.value || $('globalStore')?.value || '';
  const url = '/api/stock' + (storeId ? `?store_id=${storeId}` : '');
  try {
    const stock = await api('GET', url);
    $('stockTable').innerHTML = makeTable(
      ['Produto', 'Disponível', 'Vendido', 'Total'],
      stock.filter(s => s.total > 0).map(s => [
        s.product_name,
        `<strong style="color:var(--green)">${s.quantity}</strong>`,
        s.sold || 0,
        s.total || s.quantity,
      ])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==================== NF-e EMIT ====================

function initNfeEmit() {
  populateSelect($('nfeStore'), state.stores, 'id', 'name', 'Selecione...');
  state.nfeItems = [];
  $('nfeItems').innerHTML = '';
  addNfeItem();
  calcNfeTotal();
}

function addNfeItem() {
  const idx = state.nfeItems.length;
  state.nfeItems.push({ product_id: '', qty: 1, unit_price: 0, ncm: '8517120000', cfop: '5102' });
  const div = document.createElement('div');
  div.id = 'nfe-item-' + idx;
  div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:.5rem;align-items:end;margin-bottom:.5rem';
  div.innerHTML = `
    <div class="form-group" style="margin:0">
      <label>Produto</label>
      <select onchange="onNfeProductChange(${idx},this)">
        <option value="">Selecione...</option>
        ${state.products.filter(p => p.active).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="margin:0">
      <label>Qtd</label>
      <input type="number" min="1" value="1" oninput="state.nfeItems[${idx}].qty=Number(this.value);calcNfeTotal()" />
    </div>
    <div class="form-group" style="margin:0">
      <label>Valor Unit.</label>
      <input type="number" step="0.01" min="0" id="nfe-item-price-${idx}" oninput="state.nfeItems[${idx}].unit_price=Number(this.value);calcNfeTotal()" />
    </div>
    <div class="form-group" style="margin:0">
      <label>NCM</label>
      <input type="text" value="8517120000" maxlength="10" oninput="state.nfeItems[${idx}].ncm=this.value" />
    </div>
    <button class="btn btnGhost btn-sm" style="margin-bottom:0" onclick="removeNfeItem(${idx})">x</button>
  `;
  $('nfeItems').appendChild(div);
}

function onNfeProductChange(idx, sel) {
  const prod = state.products.find(p => p.id === Number(sel.value));
  if (prod) {
    state.nfeItems[idx] = { ...state.nfeItems[idx], product_id: prod.id, product_name: prod.name, unit_price: prod.price, ncm: prod.ncm || '8517120000', cfop: prod.cfop || '5102', barcode: prod.barcode, unit: prod.unit || 'UN' };
    const priceEl = $('nfe-item-price-' + idx);
    if (priceEl) priceEl.value = prod.price;
  }
  calcNfeTotal();
}

function removeNfeItem(idx) {
  const el = $('nfe-item-' + idx);
  if (el) el.remove();
  state.nfeItems[idx] = null;
  calcNfeTotal();
}

function calcNfeTotal() {
  const total = state.nfeItems.filter(Boolean).reduce((a, i) => a + (i.qty || 1) * (i.unit_price || 0), 0);
  const el = $('nfeTotal');
  if (el) el.value = total.toFixed(2);
}

async function emitNfe() {
  const store_id = $('nfeStore').value;
  if (!store_id) return showToast('Selecione a loja', 'error');

  const items = state.nfeItems.filter(Boolean).filter(i => i.product_id);
  if (!items.length) return showToast('Adicione pelo menos 1 item', 'error');

  const total_value = Number($('nfeTotal').value);
  const customer = {
    cpf: $('nfeCpf').value.replace(/\D/g, ''),
    name: $('nfeName').value,
    email: $('nfeEmail').value,
  };

  const result = $('nfeResult');
  result.innerHTML = '<div style="color:var(--text-muted)">Emitindo NF-e...</div>';
  result.classList.remove('hidden');

  try {
    const r = await api('POST', '/api/nfe/emit', {
      store_id: Number(store_id),
      ambiente: $('nfeAmbiente').value,
      items,
      customer: customer.cpf ? customer : undefined,
      payment_method: $('nfePayment').value,
      total_value,
    });
    const nfe = r.nfe;
    const statusColor = { 'PROCESSING': 'var(--accent)', 'autorizado': '#22c55e', 'ERROR': '#ef4444', 'DRAFT': 'var(--text-muted)' };
    result.innerHTML = `
      <div style="color:${statusColor[nfe.status] || 'var(--text)'}">
        <strong>NF-e #${nfe.numero} · Status: ${nfe.status.toUpperCase()}</strong><br/>
        ${nfe.chave ? `<small>Chave: ${nfe.chave}</small><br/>` : ''}
        ${nfe.error ? `<small style="color:#ef4444">${nfe.error}</small>` : ''}
        ${nfe.pdf_url ? `<a href="${nfe.pdf_url}" target="_blank" class="btn btnPrimary btn-sm" style="margin-top:.5rem">Ver DANFE</a>` : ''}
      </div>
    `;
    showToast(nfe.status === 'ERROR' ? 'Erro na emissão' : 'NF-e enviada!', nfe.status === 'ERROR' ? 'error' : 'success');
  } catch (e) {
    result.innerHTML = `<div style="color:#ef4444">${e.message}</div>`;
    showToast(e.message, 'error');
  }
}

// ==================== NF-e LIST ====================

async function loadNfeList() {
  const storeId = $('nfeListStore')?.value || '';
  const url = '/api/nfe/emitidas' + (storeId ? `?store_id=${storeId}` : '');
  try {
    const nfes = await api('GET', url);
    const store = id => (state.stores.find(s => s.id === id) || {}).name || id;
    const statusBadge = s => {
      const m = { 'autorizado': 'badge-green', 'PROCESSING': 'badge-blue', 'ERROR': 'badge-red', 'DRAFT': 'badge-yellow' };
      return `<span class="badge ${m[s] || 'badge-yellow'}">${s}</span>`;
    };
    $('nfeListTable').innerHTML = makeTable(
      ['Nº', 'Série', 'Loja', 'Valor', 'Pagamento', 'Status', 'DANFE', 'Data'],
      nfes.reverse().map(n => [
        n.numero, n.serie, store(n.store_id), fmt(n.total_value),
        payLabel[n.payment_method] || n.payment_method,
        statusBadge(n.status),
        n.pdf_url ? `<a href="${n.pdf_url}" target="_blank">Ver</a>` : '—',
        fmtDate(n.created_at),
      ])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==================== NF-e CONFIG ====================

async function loadNfeCfgForm() {
  populateSelect($('cfgStore'), state.stores, 'id', 'name', 'Selecione...');
  const storeId = $('cfgStore')?.value;
  if (!storeId) return;
  try {
    const cfg = await api('GET', `/api/nfe/config?store_id=${storeId}`);
    if (cfg) {
      ['cnpj', 'razao', 'fantasia', 'ie', 'crt', 'logradouro', 'numero', 'bairro', 'municipio', 'codMun', 'uf', 'cep', 'fone', 'serie', 'numInicial', 'ambiente', 'focusToken'].forEach(k => {
        const el = $('cfg' + k.charAt(0).toUpperCase() + k.slice(1));
        const dbKey = k === 'razao' ? 'razao_social' : k === 'fantasia' ? 'nome_fantasia' : k === 'codMun' ? 'codigo_municipio' : k === 'numInicial' ? 'numero_inicial' : k === 'focusToken' ? 'focus_token' : k;
        if (el && cfg[dbKey] !== undefined) el.value = cfg[dbKey];
      });
    }
  } catch { }
}

async function saveNfeCfg() {
  const store_id = $('cfgStore').value;
  if (!store_id) return showToast('Selecione a loja', 'error');
  const payload = {
    store_id: Number(store_id),
    cnpj: $('cfgCnpj').value,
    razao_social: $('cfgRazao').value,
    nome_fantasia: $('cfgFantasia').value,
    ie: $('cfgIe').value,
    crt: $('cfgCrt').value,
    logradouro: $('cfgLogradouro').value,
    numero: $('cfgNumero').value,
    bairro: $('cfgBairro').value,
    municipio: $('cfgMunicipio').value,
    codigo_municipio: $('cfgCodMun').value,
    uf: $('cfgUf').value,
    cep: $('cfgCep').value,
    fone: $('cfgFone').value,
    serie: $('cfgSerie').value || '1',
    numero_inicial: Number($('cfgNumInicial').value || 1),
    ambiente: $('cfgAmbiente').value,
    focus_token: $('cfgFocusToken').value,
  };
  try {
    await api('POST', '/api/nfe/config', payload);
    showToast('Configuração fiscal salva!');
  } catch (e) { showToast(e.message, 'error'); }
}

// ==================== FINANCE ====================

function showFinanceForm() {
  populateSelect($('finStore'), state.stores, 'id', 'name', 'Selecione...');
  $('finDate').value = new Date().toISOString().split('T')[0];
  renderFinanceCategoryOptions();
  $('financeFormWrap').classList.remove('hidden');
}

function hideFinanceForm() { $('financeFormWrap').classList.add('hidden'); }

function renderFinanceCategoryOptions() {
  const type = $('finType')?.value;
  const cats = state.finance_categories.filter(c => !type || c.type === type);
  populateSelect($('finCategory'), cats, 'id', 'name', 'Selecione...');
}

async function submitFinance() {
  const type = $('finType').value;
  const category_id = $('finCategory').value;
  const store_id = $('finStore').value;
  const value = $('finValue').value;
  const description = $('finDesc').value;
  const date = $('finDate').value;
  if (!value || !description) return showToast('Preencha valor e descrição', 'error');
  try {
    await api('POST', '/api/finance', { type, category_id: Number(category_id), store_id: Number(store_id), value: Number(value), description, date });
    showToast('Lançamento salvo!');
    hideFinanceForm();
    loadFinance();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadFinance() {
  const type = $('finFilterType')?.value || '';
  const start = $('finFilterStart')?.value || '';
  const end = $('finFilterEnd')?.value || '';
  const storeId = $('globalStore')?.value || '';
  let url = '/api/finance?';
  if (type) url += `type=${type}&`;
  if (start) url += `start=${start}&`;
  if (end) url += `end=${end}&`;
  if (storeId) url += `store_id=${storeId}&`;

  try {
    const entries = await api('GET', url);
    const income = entries.filter(e => e.type === 'INCOME').reduce((a, e) => a + e.value, 0);
    const expense = entries.filter(e => e.type === 'EXPENSE').reduce((a, e) => a + e.value, 0);
    $('financeCards').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(34,197,94,.15);color:#22c55e">&#8679;</div>
        <div class="kpi-info"><div class="kpi-value">${fmt(income)}</div><div class="kpi-label">Receitas</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(239,68,68,.15);color:#ef4444">&#8681;</div>
        <div class="kpi-info"><div class="kpi-value">${fmt(expense)}</div><div class="kpi-label">Despesas</div></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background:rgba(37,99,235,.15);color:#2563eb">=</div>
        <div class="kpi-info"><div class="kpi-value">${fmt(income - expense)}</div><div class="kpi-label">Saldo</div></div>
      </div>
    `;
    const store = id => (state.stores.find(s => s.id === id) || {}).name || '—';
    $('financeTable').innerHTML = makeTable(
      ['Data', 'Tipo', 'Descrição', 'Loja', 'Valor'],
      entries.reverse().map(e => [
        fmtDate(e.date),
        e.type === 'INCOME' ? '<span class="badge badge-green">Receita</span>' : '<span class="badge badge-red">Despesa</span>',
        e.description, store(e.store_id), fmt(e.value),
      ])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==================== CONTAS A PAGAR ====================

function showCpForm() {
  populateSelect($('cpStore'), state.stores, 'id', 'name', 'Selecione...');
  populateSelect($('cpSupplier'), state.suppliers, 'id', 'name', 'Nenhum');
  $('cpFormWrap').classList.remove('hidden');
}
function hideCpForm() { $('cpFormWrap').classList.add('hidden'); }

async function submitCp() {
  const description = $('cpDesc').value;
  const value = $('cpValue').value;
  const store_id = $('cpStore').value;
  const due_date = $('cpDue').value;
  const supplier_id = $('cpSupplier').value;
  if (!description || !value) return showToast('Preencha descrição e valor', 'error');
  try {
    await api('POST', '/api/contas-pagar', { description, value: Number(value), store_id: Number(store_id), due_date, supplier_id: supplier_id ? Number(supplier_id) : null });
    showToast('Conta a pagar salva!');
    hideCpForm();
    loadCp();
  } catch (e) { showToast(e.message, 'error'); }
}

async function markCpPaid(id) {
  try {
    await api('PATCH', `/api/contas-pagar/${id}`, { status: 'PAID' });
    showToast('Marcada como paga!');
    loadCp();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadCp() {
  const status = $('cpFilterStatus')?.value || '';
  const url = '/api/contas-pagar' + (status ? `?status=${status}` : '');
  try {
    const items = await api('GET', url);
    const store = id => (state.stores.find(s => s.id === id) || {}).name || '—';
    const today = new Date().toISOString().split('T')[0];
    $('cpTable').innerHTML = makeTable(
      ['Descrição', 'Loja', 'Vencimento', 'Valor', 'Status', 'Ação'],
      items.reverse().map(i => {
        const overdue = i.status === 'PENDING' && i.due_date && i.due_date < today;
        return [
          i.description, store(i.store_id),
          `<span style="color:${overdue ? '#ef4444' : 'inherit'}">${fmtDate(i.due_date)}</span>`,
          fmt(i.value),
          i.status === 'PAID' ? '<span class="badge badge-green">Pago</span>' : `<span class="badge ${overdue ? 'badge-red' : 'badge-yellow'}">Pendente</span>`,
          i.status === 'PENDING' ? `<button class="btn btnSuccess btn-sm" onclick="markCpPaid(${i.id})">Pagar</button>` : '—',
        ];
      })
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==================== CONTAS A RECEBER ====================

function showCrForm() {
  populateSelect($('crStore'), state.stores, 'id', 'name', 'Selecione...');
  populateSelect($('crCustomer'), state.customers, 'id', 'name', 'Nenhum');
  $('crFormWrap').classList.remove('hidden');
}
function hideCrForm() { $('crFormWrap').classList.add('hidden'); }

async function submitCr() {
  const description = $('crDesc').value;
  const value = $('crValue').value;
  const store_id = $('crStore').value;
  const due_date = $('crDue').value;
  const customer_id = $('crCustomer').value;
  if (!description || !value) return showToast('Preencha descrição e valor', 'error');
  try {
    await api('POST', '/api/contas-receber', { description, value: Number(value), store_id: Number(store_id), due_date, customer_id: customer_id ? Number(customer_id) : null });
    showToast('Conta a receber salva!');
    hideCrForm();
    loadCr();
  } catch (e) { showToast(e.message, 'error'); }
}

async function markCrReceived(id) {
  try {
    await api('PATCH', `/api/contas-receber/${id}`, { status: 'RECEIVED' });
    showToast('Marcada como recebida!');
    loadCr();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadCr() {
  const status = $('crFilterStatus')?.value || '';
  const url = '/api/contas-receber' + (status ? `?status=${status}` : '');
  try {
    const items = await api('GET', url);
    const store = id => (state.stores.find(s => s.id === id) || {}).name || '—';
    const today = new Date().toISOString().split('T')[0];
    $('crTable').innerHTML = makeTable(
      ['Descrição', 'Loja', 'Vencimento', 'Valor', 'Status', 'Ação'],
      items.reverse().map(i => {
        const overdue = i.status === 'PENDING' && i.due_date && i.due_date < today;
        return [
          i.description, store(i.store_id),
          `<span style="color:${overdue ? '#ef4444' : 'inherit'}">${fmtDate(i.due_date)}</span>`,
          fmt(i.value),
          i.status === 'RECEIVED' ? '<span class="badge badge-green">Recebido</span>' : `<span class="badge ${overdue ? 'badge-red' : 'badge-yellow'}">Pendente</span>`,
          i.status === 'PENDING' ? `<button class="btn btnPrimary btn-sm" onclick="markCrReceived(${i.id})">Receber</button>` : '—',
        ];
      })
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==================== PRODUCTS ====================

const PRODUCT_FIELDS = {
  productCodigo: 'codigo', productName: 'name', productBarcode: 'barcode', productDun: 'codigo_dun',
  productUnit: 'unit', productGrupo: 'grupo', productSubgrupo: 'subgrupo', productCategory: 'category',
  productNcm: 'ncm', productCfop: 'cfop', productTipoCusto: 'tipo_custo', productCostPrice: 'cost_price',
  productPrecoMedio: 'preco_medio', productPrice: 'price', productVendaSugerido: 'venda_sugerido',
  productEstoqueMin: 'estoque_min', productEstoqueMax: 'estoque_max', productPesoLiq: 'peso_liquido',
  productPesoBruto: 'peso_bruto', productMovEstoque: 'movimenta_estoque', productEstNegativo: 'estoque_negativo',
  productObs: 'observacoes',
};
const PRODUCT_NUM = ['cost_price', 'preco_medio', 'price', 'venda_sugerido', 'estoque_min', 'estoque_max', 'peso_liquido', 'peso_bruto'];

function showProductForm(product) {
  $('productId').value = product ? product.id : '';
  $('productFormTitle').textContent = product ? 'Editar Produto' : 'Novo Produto';
  Object.entries(PRODUCT_FIELDS).forEach(([id, key]) => {
    const el = $(id); if (el) el.value = product ? (product[key] ?? '') : '';
  });
  if (!product) { $('productNcm').value = '8517120000'; $('productCfop').value = '5102'; $('productUnit').value = 'UN'; }
  $('productFormWrap').classList.remove('hidden');
}

function hideProductForm() { $('productFormWrap').classList.add('hidden'); }

async function submitProduct() {
  const id = $('productId').value;
  const payload = { active: 1 };
  Object.entries(PRODUCT_FIELDS).forEach(([elId, key]) => {
    let v = ($(elId) || {}).value || '';
    if (PRODUCT_NUM.includes(key)) v = Number(v || 0);
    payload[key] = v;
  });
  if (!payload.name || !payload.price) return showToast('Nome e preço são obrigatórios', 'error');
  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/products/${id}` : '/api/products';
    const updated = await api(method, url, payload);
    if (id) {
      const idx = state.products.findIndex(p => p.id === updated.id);
      if (idx >= 0) state.products[idx] = updated; else state.products.push(updated);
    } else {
      state.products.push(updated);
    }
    showToast('Produto salvo!');
    hideProductForm();
    loadProducts();
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteProduct(id) {
  if (!confirm('Desativar este produto?')) return;
  try {
    await api('DELETE', `/api/products/${id}`);
    const idx = state.products.findIndex(p => p.id === id);
    if (idx >= 0) state.products[idx].active = 0;
    showToast('Produto desativado');
    loadProducts();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadProducts() {
  try {
    const products = await api('GET', '/api/products');
    state.products = products;
    $('productTable').innerHTML = makeTable(
      ['Nome', 'Preço Venda', 'Custo', 'NCM', 'CFOP', 'Categoria', 'Status', 'Ações'],
      products.map(p => [
        p.name, fmt(p.price), fmt(p.cost_price),
        p.ncm || '—', p.cfop || '—', p.category || '—',
        p.active ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-red">Inativo</span>',
        `<button class="btn btnGhost btn-sm" onclick='showProductForm(${JSON.stringify(p)})'>Editar</button>
         ${p.active ? `<button class="btn btnGhost btn-sm" onclick="deleteProduct(${p.id})">Desativar</button>` : ''}`,
      ])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==================== SUPPLIERS ====================

const SUPPLIER_FIELDS = {
  supplierName: 'name', supplierRazao: 'razao_social', supplierTipo: 'tipo', supplierCnpj: 'cnpj',
  supplierIE: 'inscricao_estadual', supplierIM: 'inscricao_municipal', supplierEmail: 'email',
  supplierFone: 'fone', supplierCelular: 'celular', supplierCep: 'cep', supplierEndereco: 'endereco',
  supplierNumero: 'numero', supplierBairro: 'bairro', supplierCidade: 'cidade', supplierUf: 'uf',
};

function showSupplierForm(supplier) {
  $('supplierId').value = supplier ? supplier.id : '';
  $('supplierFormTitle').textContent = supplier ? 'Editar Fornecedor' : 'Novo Fornecedor';
  Object.entries(SUPPLIER_FIELDS).forEach(([id, key]) => {
    const el = $(id); if (el) el.value = supplier ? (supplier[key] || '') : '';
  });
  $('supplierFormWrap').classList.remove('hidden');
}

function hideSupplierForm() { $('supplierFormWrap').classList.add('hidden'); }

async function submitSupplier() {
  const id = $('supplierId').value;
  const payload = {};
  Object.entries(SUPPLIER_FIELDS).forEach(([elId, key]) => { payload[key] = ($(elId) || {}).value || ''; });
  if (!payload.name) return showToast('Informe o nome', 'error');
  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/suppliers/${id}` : '/api/suppliers';
    const updated = await api(method, url, payload);
    if (id) {
      const idx = state.suppliers.findIndex(s => s.id === updated.id);
      if (idx >= 0) state.suppliers[idx] = updated; else state.suppliers.push(updated);
    } else {
      state.suppliers.push(updated);
    }
    showToast('Fornecedor salvo!');
    hideSupplierForm();
    loadSuppliers();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadSuppliers() {
  try {
    const suppliers = await api('GET', '/api/suppliers');
    state.suppliers = suppliers;
    $('supplierTable').innerHTML = makeTable(
      ['Nome', 'CNPJ', 'E-mail', 'Telefone', 'Cidade', 'UF', 'Ações'],
      suppliers.filter(s => s.active).map(s => [
        s.name, s.cnpj || '—', s.email || '—', s.fone || '—', s.cidade || '—', s.uf || '—',
        `<button class="btn btnGhost btn-sm" onclick='showSupplierForm(${JSON.stringify(s)})'>Editar</button>`,
      ])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==================== CUSTOMERS ====================

const CUSTOMER_FIELDS = {
  customerName: 'name', customerTipoPessoa: 'tipo_pessoa', customerCpf: 'cpf',
  customerRazao: 'razao_social', customerEmail: 'email', customerFone: 'fone',
  customerCelular: 'celular', customerIE: 'inscricao_estadual', customerIM: 'inscricao_municipal',
  customerRamo: 'ramo_atividade', customerCep: 'cep', customerEndereco: 'endereco',
  customerNumero: 'numero', customerBairro: 'bairro', customerCidade: 'cidade', customerUf: 'uf',
};

function showCustomerForm(customer) {
  $('customerId').value = customer ? customer.id : '';
  $('customerFormTitle').textContent = customer ? 'Editar Cliente' : 'Novo Cliente';
  Object.entries(CUSTOMER_FIELDS).forEach(([id, key]) => {
    const el = $(id); if (el) el.value = customer ? (customer[key] || '') : '';
  });
  $('customerFormWrap').classList.remove('hidden');
}

function hideCustomerForm() { $('customerFormWrap').classList.add('hidden'); }

async function submitCustomer() {
  const id = $('customerId').value;
  const payload = {};
  Object.entries(CUSTOMER_FIELDS).forEach(([elId, key]) => { payload[key] = ($(elId) || {}).value || ''; });
  if (!payload.name) return showToast('Informe o nome', 'error');
  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/customers/${id}` : '/api/customers';
    const updated = await api(method, url, payload);
    if (id) {
      const idx = state.customers.findIndex(c => c.id === updated.id);
      if (idx >= 0) state.customers[idx] = updated; else state.customers.push(updated);
    } else {
      state.customers.push(updated);
    }
    showToast('Cliente salvo!');
    hideCustomerForm();
    loadCustomers();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadCustomers() {
  try {
    const customers = await api('GET', '/api/customers');
    state.customers = customers;
    $('customerTable').innerHTML = makeTable(
      ['Nome', 'CPF/CNPJ', 'Telefone', 'E-mail', 'Cidade', 'Ações'],
      customers.map(c => [
        c.name, c.cpf || '—', c.fone || '—', c.email || '—', c.cidade || '—',
        `<button class="btn btnGhost btn-sm" onclick='showCustomerForm(${JSON.stringify(c)})'>Editar</button>`,
      ])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==================== SELLERS ====================

function showSellerForm() { $('sellerFormWrap').classList.remove('hidden'); }
function hideSellerForm() { $('sellerFormWrap').classList.add('hidden'); }

async function submitSeller() {
  const name = $('sellerName').value;
  const store_id = $('sellerStoreId').value;
  if (!name) return showToast('Informe o nome', 'error');
  try {
    const s = await api('POST', '/api/sellers', { name, store_id: Number(store_id) });
    state.sellers.push(s);
    showToast('Vendedor salvo!');
    hideSellerForm();
    loadSellers();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadSellers() {
  try {
    const sellers = await api('GET', '/api/sellers');
    const store = id => (state.stores.find(s => s.id === id) || {}).name || '—';
    $('sellerTable').innerHTML = makeTable(
      ['Nome', 'Loja'],
      sellers.map(s => [s.name, store(s.store_id)])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==================== STORES ====================

function showStoreForm(store) {
  $('storeFormId').value = store ? store.id : '';
  $('storeFormTitle').textContent = store ? 'Editar Loja' : 'Nova Loja';
  if (store) {
    $('storeFormName').value = store.name;
    $('storeFormCidade').value = store.cidade || '';
    $('storeFormUf').value = store.uf || '';
    $('storeFormFone').value = store.fone || '';
  } else {
    ['storeFormName', 'storeFormCidade', 'storeFormUf', 'storeFormFone'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  }
  $('storeFormWrap').classList.remove('hidden');
}

function hideStoreForm() { $('storeFormWrap').classList.add('hidden'); }

async function submitStore() {
  const id = $('storeFormId').value;
  const payload = {
    name: $('storeFormName').value,
    cidade: $('storeFormCidade').value,
    uf: $('storeFormUf').value || 'PE',
    fone: $('storeFormFone').value,
    active: 1,
  };
  if (!payload.name) return showToast('Informe o nome', 'error');
  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/stores/${id}` : '/api/stores';
    const updated = await api(method, url, payload);
    if (id) {
      const idx = state.stores.findIndex(s => s.id === updated.id);
      if (idx >= 0) state.stores[idx] = updated; else state.stores.push(updated);
    } else {
      state.stores.push(updated);
    }
    showToast('Loja salva!');
    hideStoreForm();
    loadStores();
    populateAllStoreSelects();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadStores() {
  try {
    const stores = await api('GET', '/api/stores');
    state.stores = stores.filter(s => s.active);
    $('storeTable').innerHTML = makeTable(
      ['Nome', 'Cidade', 'UF', 'Ações'],
      stores.filter(s => s.active).map(s => [
        s.name, s.cidade || '—', s.uf || '—',
        `<button class="btn btnGhost btn-sm" onclick='showStoreForm(${JSON.stringify(s)})'>Editar</button>`,
      ])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==================== SALES ====================

async function loadSales() {
  const storeId = $('salesFilterStore')?.value || '';
  const start = $('salesFilterStart')?.value || '';
  const end = $('salesFilterEnd')?.value || '';
  let url = '/api/sales?';
  if (storeId) url += `store_id=${storeId}&`;
  if (start) url += `start=${start}&`;
  if (end) url += `end=${end}&`;
  try {
    const sales = await api('GET', url);
    const store = id => (state.stores.find(s => s.id === id) || {}).name || id;
    $('salesTable').innerHTML = makeTable(
      ['Data', 'Produto', 'IMEI', 'Loja', 'Vendedor', 'Pagamento', 'Valor'],
      sales.reverse().map(s => [
        fmtDate(s.created_at), s.product_name, s.imei,
        store(s.store_id), s.seller_name || '—',
        payLabel[s.payment_method] || s.payment_method, fmt(s.price),
      ])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==================== REPORTS ====================

async function loadReportProduct() {
  const storeId = $('rpStore')?.value || '';
  const start = $('rpStart')?.value || '';
  const end = $('rpEnd')?.value || '';
  let url = '/api/reports/sales-by-product?';
  if (storeId) url += `store_id=${storeId}&`;
  if (start) url += `start=${start}&`;
  if (end) url += `end=${end}&`;
  try {
    const data = await api('GET', url);
    $('reportProductTable').innerHTML = makeTable(
      ['Produto', 'Qtd', 'Total'],
      data.map(r => [r.product_name, r.qty, fmt(r.total)])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

async function loadReportStore() {
  const start = $('rsStart')?.value || '';
  const end = $('rsEnd')?.value || '';
  let url = '/api/reports/sales-by-store?';
  if (start) url += `start=${start}&`;
  if (end) url += `end=${end}&`;
  try {
    const data = await api('GET', url);
    $('reportStoreTable').innerHTML = makeTable(
      ['Loja', 'Qtd', 'Total'],
      data.map(r => [r.store_name, r.qty, fmt(r.total)])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==================== PEDIDOS ====================

const pedStatusBadge = s => {
  const m = { PENDENTE: 'badge-yellow', APROVADO: 'badge-blue', FATURADO: 'badge-green', CANCELADO: 'badge-red' };
  return `<span class="badge ${m[s] || 'badge-yellow'}">${s}</span>`;
};

function showPedidoForm() {
  populateSelect($('pedStore'), state.stores, 'id', 'name', 'Selecione...');
  populateSelect($('pedCustomer'), state.customers, 'id', 'name', 'Consumidor');
  populateSelect($('pedSeller'), state.sellers, 'id', 'name', 'Selecione...');
  $('pedidoFormWrap').classList.remove('hidden');
}
function hidePedidoForm() { $('pedidoFormWrap').classList.add('hidden'); }

async function submitPedido() {
  const payload = {
    store_id: Number($('pedStore').value),
    customer_id: $('pedCustomer').value ? Number($('pedCustomer').value) : null,
    seller_id: $('pedSeller').value ? Number($('pedSeller').value) : null,
    tipo: $('pedTipo').value,
    tabela_preco: $('pedTabelaPreco').value,
    tipo_operacao: $('pedTipoOperacao').value,
    segmento: $('pedSegmento').value,
    frete: $('pedFrete').value,
    cpf_na_nota: $('pedCpfNota').value,
    indicador_presenca: $('pedIndicadorPresenca').value,
    finalidade: $('pedFinalidade').value,
    items: [{ desc: $('pedItems').value, barcode: $('pedBarcode').value, qtd: Number($('pedQtd').value || 1), desconto: Number($('pedDesconto').value || 0) }],
    total_value: Number($('pedTotal').value || 0),
  };
  if (!payload.store_id) return showToast('Selecione a loja', 'error');
  try {
    await api('POST', '/api/pedidos', payload);
    showToast('Pedido criado!');
    hidePedidoForm();
    loadPedidos();
  } catch (e) { showToast(e.message, 'error'); }
}

async function setPedidoStatus(id, status) {
  try {
    await api('PATCH', `/api/pedidos/${id}`, { status });
    showToast('Pedido ' + status.toLowerCase());
    loadPedidos();
    loadPedidosAprov();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadPedidos() {
  const storeId = $('globalStore')?.value || '';
  const url = '/api/pedidos' + (storeId ? `?store_id=${storeId}` : '');
  try {
    const rows = await api('GET', url);
    const store = id => (state.stores.find(s => s.id === id) || {}).name || id;
    $('pedidoTable').innerHTML = makeTable(
      ['#', 'Loja', 'Tipo', 'Total', 'Status', 'Ações'],
      rows.reverse().map(p => [
        p.id, store(p.store_id), p.tipo, fmt(p.total_value), pedStatusBadge(p.status),
        (p.status === 'PENDENTE' ? `<button class="btn btnPrimary btn-sm" onclick="setPedidoStatus(${p.id},'APROVADO')">Aprovar</button>` : '') +
        (p.status === 'APROVADO' ? `<button class="btn btnSuccess btn-sm" onclick="setPedidoStatus(${p.id},'FATURADO')">Faturar</button>` : '') +
        (p.status !== 'CANCELADO' && p.status !== 'FATURADO' ? ` <button class="btn btnGhost btn-sm" onclick="setPedidoStatus(${p.id},'CANCELADO')">Cancelar</button>` : ''),
      ])
    );
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadPedidosAprov() {
  try {
    const rows = await api('GET', '/api/pedidos?status=PENDENTE');
    const store = id => (state.stores.find(s => s.id === id) || {}).name || id;
    $('pedidoAprovTable').innerHTML = makeTable(
      ['#', 'Loja', 'Tipo', 'Total', 'Ações'],
      rows.reverse().map(p => [
        p.id, store(p.store_id), p.tipo, fmt(p.total_value),
        `<button class="btn btnSuccess btn-sm" onclick="setPedidoStatus(${p.id},'APROVADO')">Aprovar</button>
         <button class="btn btnGhost btn-sm" onclick="setPedidoStatus(${p.id},'CANCELADO')">Reprovar</button>`,
      ])
    );
  } catch (e) { showToast(e.message, 'error'); }
}

// ==================== CAIXA ====================

function caixaPayload() {
  return { store_id: Number($('caixaStore').value), amount: Number($('caixaValor').value || 0), motivo: $('caixaMotivo').value };
}
async function caixaAbrir() {
  try { await api('POST', '/api/cash/open', caixaPayload()); showToast('Caixa aberto'); loadCaixa(); }
  catch (e) { showToast(e.message, 'error'); }
}
async function caixaFechar() {
  try { await api('POST', '/api/cash/close', caixaPayload()); showToast('Caixa fechado'); loadCaixa(); }
  catch (e) { showToast(e.message, 'error'); }
}
async function caixaSangria() {
  try { await api('POST', '/api/caixa/sangria', caixaPayload()); showToast('Sangria registrada'); loadCaixa(); }
  catch (e) { showToast(e.message, 'error'); }
}
async function caixaSuprimento() {
  try { await api('POST', '/api/caixa/suprimento', caixaPayload()); showToast('Suprimento registrado'); loadCaixa(); }
  catch (e) { showToast(e.message, 'error'); }
}
async function loadCaixa() {
  populateSelect($('caixaStore'), state.stores, 'id', 'name', 'Selecione...');
  const storeId = $('caixaStore')?.value || '';
  const url = '/api/caixa' + (storeId ? `?store_id=${storeId}` : '');
  try {
    const regs = await api('GET', url);
    $('caixaTable').innerHTML = makeTable(
      ['#', 'Abertura', 'Valor Abertura', 'Fechamento', 'Valor Fech.', 'Status'],
      regs.reverse().map(c => [
        c.id, fmtDate(c.opened_at), fmt(c.opening_amount), c.closed_at ? fmtDate(c.closed_at) : '—',
        c.closing_amount != null ? fmt(c.closing_amount) : '—',
        c.status === 'OPEN' ? '<span class="badge badge-green">Aberto</span>' : '<span class="badge badge-red">Fechado</span>',
      ])
    );
  } catch (e) { showToast(e.message, 'error'); }
}

// ==================== FLUXO DE CAIXA ====================

async function loadFluxoCaixa() {
  populateSelect($('fcStore'), state.stores, 'id', 'name', 'Todas as lojas');
  const storeId = $('fcStore')?.value || '';
  const start = $('fcStart')?.value || '';
  const end = $('fcEnd')?.value || '';
  let url = '/api/fluxo-caixa?';
  if (storeId) url += `store_id=${storeId}&`;
  if (start) url += `start=${start}&`;
  if (end) url += `end=${end}&`;
  try {
    const days = await api('GET', url);
    $('fluxoCaixaTable').innerHTML = makeTable(
      ['Data', 'Entradas', 'Saídas', 'Saldo do dia', 'Saldo acumulado'],
      days.map(d => [
        fmtDate(d.date), fmt(d.income), fmt(d.expense),
        `<strong style="color:${d.saldo_dia >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(d.saldo_dia)}</strong>`,
        fmt(d.saldo_acumulado),
      ])
    );
  } catch (e) { showToast(e.message, 'error'); }
}

// ==================== INVENTÁRIO ====================

function showInvForm() {
  populateSelect($('invStore'), state.stores, 'id', 'name', 'Selecione...');
  populateSelect($('invProduct'), state.products.filter(p => p.active), 'id', 'name', 'Selecione...');
  $('invFormWrap').classList.remove('hidden');
}
function hideInvForm() { $('invFormWrap').classList.add('hidden'); }

async function submitInv() {
  const payload = {
    store_id: Number($('invStore').value),
    product_id: Number($('invProduct').value),
    contagem: Number($('invContagem').value || 0),
    observacao: $('invObs').value,
  };
  if (!payload.store_id || !payload.product_id) return showToast('Selecione loja e produto', 'error');
  try {
    const inv = await api('POST', '/api/inventario', payload);
    showToast(`Contagem registrada. Divergência: ${inv.divergencia}`);
    hideInvForm();
    loadInv();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadInv() {
  try {
    const rows = await api('GET', '/api/inventario');
    const store = id => (state.stores.find(s => s.id === id) || {}).name || id;
    const prod = id => (state.products.find(p => p.id === id) || {}).name || id;
    $('invTable').innerHTML = makeTable(
      ['Data', 'Loja', 'Produto', 'Sistema', 'Contagem', 'Divergência'],
      rows.reverse().map(i => [
        fmtDate(i.created_at), store(i.store_id), prod(i.product_id), i.sistema, i.contagem,
        `<strong style="color:${i.divergencia === 0 ? 'var(--green)' : 'var(--red)'}">${i.divergencia}</strong>`,
      ])
    );
  } catch (e) { showToast(e.message, 'error'); }
}

// ==================== COMPRAS ====================

function showCompraForm() {
  populateSelect($('compSupplier'), state.suppliers, 'id', 'name', 'Selecione...');
  populateSelect($('compStore'), state.stores, 'id', 'name', 'Selecione...');
  $('compraFormWrap').classList.remove('hidden');
}
function hideCompraForm() { $('compraFormWrap').classList.add('hidden'); }

async function submitCompra() {
  const payload = {
    supplier_id: $('compSupplier').value ? Number($('compSupplier').value) : null,
    store_id: Number($('compStore').value),
    description: $('compDesc').value,
    value: Number($('compValor').value || 0),
  };
  if (!payload.description) return showToast('Informe a descrição', 'error');
  try {
    await api('POST', '/api/compras', payload);
    showToast('Compra registrada!');
    hideCompraForm();
    loadCompras();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadCompras() {
  try {
    const rows = await api('GET', '/api/compras');
    const store = id => (state.stores.find(s => s.id === id) || {}).name || '—';
    const sup = id => (state.suppliers.find(s => s.id === id) || {}).name || '—';
    $('compraTable').innerHTML = makeTable(
      ['#', 'Fornecedor', 'Loja', 'Descrição', 'Valor', 'Status'],
      rows.reverse().map(c => [
        c.id, sup(c.supplier_id), store(c.store_id), c.description || '—', fmt(c.value),
        `<span class="badge badge-yellow">${c.status}</span>`,
      ])
    );
  } catch (e) { showToast(e.message, 'error'); }
}

// ==================== SAÍDA / DEFEITO ====================

async function submitSaida() {
  const imei = $('saidaImei').value.trim();
  const tipo = $('saidaTipo').value;
  const motivo = $('saidaMotivo').value;
  if (!imei) return showToast('Informe o IMEI', 'error');
  try {
    await api('POST', '/api/saida-material', { imei, tipo, motivo });
    showToast(tipo === 'DEFEITO' ? 'Marcado como defeito' : 'Saída registrada');
    $('saidaImei').value = ''; $('saidaMotivo').value = '';
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadDefeito() {
  try {
    const rows = await api('GET', '/api/produtos-defeito');
    const store = id => (state.stores.find(s => s.id === id) || {}).name || id;
    const prod = id => (state.products.find(p => p.id === id) || {}).name || id;
    $('defeitoTable').innerHTML = makeTable(
      ['IMEI', 'Produto', 'Loja', 'Motivo', 'Data'],
      rows.reverse().map(u => [u.imei, prod(u.product_id), store(u.store_id), u.saida_motivo || '—', fmtDate(u.saida_at)])
    );
  } catch (e) { showToast(e.message, 'error'); }
}

// ==================== RELATÓRIOS EXTRAS ====================

async function loadReportSeller() {
  const storeId = $('rsellerStore')?.value || '';
  const start = $('rsellerStart')?.value || '';
  const end = $('rsellerEnd')?.value || '';
  let url = '/api/reports/sales-by-seller?';
  if (storeId) url += `store_id=${storeId}&`;
  if (start) url += `start=${start}&`;
  if (end) url += `end=${end}&`;
  try {
    const data = await api('GET', url);
    $('reportSellerTable').innerHTML = makeTable(
      ['Vendedor', 'Qtd', 'Total'],
      data.map(r => [r.seller_name, r.qty, fmt(r.total)])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

async function loadReportReceivable() {
  try {
    const data = await api('GET', '/api/reports/receivable-by-customer');
    $('reportReceivableTable').innerHTML = makeTable(
      ['Cliente', 'CPF/CNPJ', 'Contas', 'Total a Receber'],
      data.map(r => [r.customer_name, r.cpf || '—', r.count, fmt(r.total)])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

async function loadReportEntries() {
  const storeId = $('rentStore')?.value || '';
  const start = $('rentStart')?.value || '';
  const end = $('rentEnd')?.value || '';
  let url = '/api/reports/note-entries?';
  if (storeId) url += `store_id=${storeId}&`;
  if (start) url += `start=${start}&`;
  if (end) url += `end=${end}&`;
  try {
    const data = await api('GET', url);
    const store = id => (state.stores.find(s => s.id === id) || {}).name || id;
    $('reportEntriesTable').innerHTML = makeTable(
      ['NF', 'Loja', 'Qtd Aparelhos', 'Valor', 'Data'],
      data.reverse().map(e => [e.nota_number || `#${e.id}`, store(e.store_id), e.qty, fmt(e.total_value), fmtDate(e.created_at)])
    );
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ==================== CADASTROS GENÉRICOS (espelho RAJ) ====================

const CAD = {
  bancos: { title: 'Banco', fields: [
    { k: 'codigo', l: 'Código', t: 'text' },
    { k: 'name', l: 'Nome do Banco', t: 'text' },
  ] },
  contas_correntes: { title: 'Conta Corrente', fields: [
    { k: 'name', l: 'Nome', t: 'text' },
    { k: 'store_id', l: 'Loja', t: 'store' },
    { k: 'tipo', l: 'Tipo', t: 'select', o: ['CONTA CORRENTE', 'POUPANÇA', 'INTERNA'] },
    { k: 'banco', l: 'Banco', t: 'text' },
    { k: 'agencia', l: 'Agência', t: 'text' },
    { k: 'conta', l: 'Conta', t: 'text' },
    { k: 'saldo_inicial', l: 'Saldo inicial (R$)', t: 'number' },
    { k: 'limite', l: 'Limite da conta (R$)', t: 'number' },
  ] },
  bandeiras_cartao: { title: 'Bandeira de Cartão', fields: [
    { k: 'name', l: 'Bandeira', t: 'text' },
    { k: 'taxa_credito', l: 'Taxa Crédito (%)', t: 'number' },
    { k: 'taxa_debito', l: 'Taxa Débito (%)', t: 'number' },
  ] },
  formas_pagamento: { title: 'Forma de Pagamento', fields: [
    { k: 'name', l: 'Descrição', t: 'text' },
    { k: 'tipo', l: 'Tipo', t: 'select', o: ['DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'CREDIARIO', 'BOLETO'] },
  ] },
  grupos_produto: { title: 'Grupo de Produto', fields: [
    { k: 'name', l: 'Grupo', t: 'text' },
  ] },
  subgrupos_produto: { title: 'SubGrupo de Produto', fields: [
    { k: 'name', l: 'SubGrupo', t: 'text' },
    { k: 'grupo', l: 'Grupo', t: 'text' },
  ] },
  unidades_medida: { title: 'Unidade de Medida', fields: [
    { k: 'sigla', l: 'Sigla', t: 'text' },
    { k: 'name', l: 'Descrição', t: 'text' },
  ] },
  tipos_operacao: { title: 'Tipo de Operação', fields: [
    { k: 'name', l: 'Descrição', t: 'text' },
    { k: 'cfop', l: 'CFOP padrão', t: 'text' },
  ] },
  series_nota: { title: 'Série de Nota', fields: [
    { k: 'store_id', l: 'Empresa / Loja', t: 'store' },
    { k: 'serie', l: 'Série Oficial', t: 'text' },
    { k: 'ultima_nota', l: 'Última Nota', t: 'number' },
    { k: 'modelo', l: 'Modelo', t: 'select', o: ['55', '65'] },
    { k: 'movimento', l: 'Movimento', t: 'select', o: ['ENTRADA', 'SAÍDA'] },
  ] },
  cfops: { title: 'CFOP', fields: [
    { k: 'codigo', l: 'CFOP', t: 'text' },
    { k: 'name', l: 'Descrição', t: 'text' },
    { k: 'natureza', l: 'Descrição Natureza', t: 'text' },
    { k: 'tipo_operacao', l: 'Tipo Operação', t: 'text' },
    { k: 'retira_estoque', l: 'Retira do Estoque?', t: 'select', o: ['Sim', 'Não'] },
    { k: 'gera_nota_entrada', l: 'Gera Nota Entrada?', t: 'select', o: ['Sim', 'Não'] },
    { k: 'cfop_devolucao', l: 'CFOP Devolução', t: 'text' },
    { k: 'ativo', l: 'Ativo', t: 'select', o: ['Sim', 'Não'] },
  ] },
  regionais: { title: 'Regional', fields: [
    { k: 'name', l: 'Regional', t: 'text' },
  ] },
  metas_lojas: { title: 'Meta de Loja', fields: [
    { k: 'store_id', l: 'Loja', t: 'store' },
    { k: 'mes', l: 'Mês (AAAA-MM)', t: 'text' },
    { k: 'meta_valor', l: 'Meta (R$)', t: 'number' },
  ] },
  motivos_cancelamento: { title: 'Motivo de Cancelamento', fields: [{ k: 'name', l: 'Motivo', t: 'text' }] },
  motivos_bonificacao: { title: 'Motivo de Bonificação', fields: [{ k: 'name', l: 'Motivo', t: 'text' }] },
  motivos_devolucao: { title: 'Motivo de Devolução', fields: [{ k: 'name', l: 'Motivo', t: 'text' }] },
  motivos_sangria: { title: 'Motivo de Sangria', fields: [{ k: 'name', l: 'Motivo', t: 'text' }] },
  armazens: { title: 'Armazém', fields: [
    { k: 'name', l: 'Nome', t: 'text' },
    { k: 'store_id', l: 'Loja', t: 'store' },
  ] },
  canais_produto: { title: 'Canal de Produto', fields: [{ k: 'name', l: 'Canal', t: 'text' }] },
  tipos_produto: { title: 'Tipo de Produto', fields: [{ k: 'name', l: 'Tipo', t: 'text' }] },
  cashback: { title: 'Cashback', fields: [
    { k: 'name', l: 'Regra', t: 'text' },
    { k: 'percentual', l: 'Percentual (%)', t: 'number' },
    { k: 'validade_dias', l: 'Validade (dias)', t: 'number' },
  ] },
  cupons: { title: 'Cupom', fields: [
    { k: 'codigo', l: 'Código', t: 'text' },
    { k: 'tipo', l: 'Tipo', t: 'select', o: ['PERCENTUAL', 'VALOR'] },
    { k: 'valor', l: 'Valor / %', t: 'number' },
    { k: 'validade', l: 'Validade (AAAA-MM-DD)', t: 'text' },
  ] },
  promocoes: { title: 'Promoção', fields: [
    { k: 'name', l: 'Descrição', t: 'text' },
    { k: 'desconto', l: 'Desconto (%)', t: 'number' },
    { k: 'inicio', l: 'Início (AAAA-MM-DD)', t: 'text' },
    { k: 'fim', l: 'Fim (AAAA-MM-DD)', t: 'text' },
  ] },
  tipos_oneracao: { title: 'Tipo de Onerosidade (RTC)', fields: [
    { k: 'codigo', l: 'Código', t: 'text' },
    { k: 'name', l: 'Descrição', t: 'text' },
  ] },
  tipos_contribuinte: { title: 'Tipo Contribuinte IBS / CBS', fields: [
    { k: 'codigo', l: 'Código', t: 'text' },
    { k: 'name', l: 'Descrição', t: 'text' },
  ] },
  anexos_ncm: { title: 'Anexo Fiscal NCM', fields: [
    { k: 'ncm', l: 'NCM', t: 'text' },
    { k: 'name', l: 'Descrição', t: 'text' },
    { k: 'aliquota', l: 'Alíquota (%)', t: 'number' },
  ] },
  contratos: { title: 'Contrato Financeiro', fields: [
    { k: 'name', l: 'Descrição', t: 'text' },
    { k: 'customer_id', l: 'Cliente', t: 'text' },
    { k: 'valor', l: 'Valor (R$)', t: 'number' },
    { k: 'vencimento', l: 'Vencimento (AAAA-MM-DD)', t: 'text' },
  ] },
  equipamentos_impressao: { title: 'Equipamento de Impressão', fields: [
    { k: 'name', l: 'Nome', t: 'text' },
    { k: 'tipo', l: 'Tipo', t: 'select', o: ['TERMICA', 'MATRICIAL', 'A4', 'CUPOM'] },
    { k: 'store_id', l: 'Loja', t: 'store' },
  ] },
  locais_impressao: { title: 'Local de Impressão', fields: [
    { k: 'name', l: 'Local', t: 'text' },
    { k: 'store_id', l: 'Loja', t: 'store' },
  ] },
  taxas_pix: { title: 'Taxa Pix', fields: [
    { k: 'name', l: 'Descrição', t: 'text' },
    { k: 'percentual', l: 'Taxa (%)', t: 'number' },
    { k: 'store_id', l: 'Loja', t: 'store' },
  ] },
  tabelas_preco: { title: 'Tabela de Preço', fields: [
    { k: 'name', l: 'Nome', t: 'text' },
    { k: 'store_id', l: 'Loja', t: 'store' },
  ] },
  segmentos: { title: 'Segmento', fields: [{ k: 'name', l: 'Segmento', t: 'text' }] },
  grupos_tributarios: { title: 'Config Fiscal Saída (Grupo Tributário)', fields: [
    { k: 'descricao', l: 'Descrição do Grupo', t: 'text' },
    { k: 'store_id', l: 'Loja', t: 'store' },
    { k: 'cfop', l: 'CFOP', t: 'text' },
    { k: 'operacao', l: 'Operação', t: 'text' },
    { k: 'modelo_nota', l: 'Modelo Nota', t: 'select', o: ['55', '65'] },
    { k: 'origem', l: 'Origem', t: 'text' },
    { k: 'tipo_contribuinte', l: 'Tipo de Contribuinte', t: 'text' },
    { k: 'destino_cliente', l: 'Destino Cliente', t: 'text' },
    { k: 'estado', l: 'Estado', t: 'text' },
    { k: 'ncm', l: 'NCM', t: 'text' },
    { k: 'st_icms', l: 'Situação Trib. ICMS', t: 'text' },
    { k: 'csosn', l: 'CSOSN (Simples)', t: 'text' },
    { k: 'st_pis', l: 'Situação Trib. PIS', t: 'text' },
    { k: 'st_cofins', l: 'Situação Trib. COFINS', t: 'text' },
    { k: 'st_ipi', l: 'Situação Trib. IPI', t: 'text' },
    { k: 'aliquota_pis', l: 'Alíquota PIS (%)', t: 'number' },
    { k: 'aliquota_cofins', l: 'Alíquota COFINS (%)', t: 'number' },
    { k: 'mod_bc_icms', l: 'Mod. BC ICMS', t: 'text' },
  ] },
  reforma_tributaria: { title: 'Configurador Reforma Tributária (IBS/CBS)', fields: [
    { k: 'operacao', l: 'Operação', t: 'text' },
    { k: 'store_id', l: 'Empresa / Loja', t: 'store' },
    { k: 'cfop', l: 'CFOP', t: 'text' },
    { k: 'ncm', l: 'NCM / Produto', t: 'text' },
    { k: 'grupo_ncm_rtc', l: 'Grupo NCM RTC', t: 'text' },
    { k: 'origem', l: 'Origem', t: 'text' },
    { k: 'tipo_contrib_ibscbs', l: 'Tipo Contrib. IBS/CBS', t: 'text' },
    { k: 'estado', l: 'Estado', t: 'text' },
    { k: 'ano_fiscal', l: 'Ano Fiscal', t: 'text' },
    { k: 'crt', l: 'CRT', t: 'text' },
    { k: 'cst', l: 'CST', t: 'text' },
    { k: 'classificacao', l: 'Classificação Tributária', t: 'text' },
    { k: 'aliquota_ibs', l: 'Alíquota IBS (%)', t: 'number' },
    { k: 'aliquota_cbs', l: 'Alíquota CBS (%)', t: 'number' },
    { k: 'reducao', l: 'Redução de Alíquota (%)', t: 'number' },
  ] },
  perfis: { title: 'Perfil Web', fields: [
    { k: 'name', l: 'Nome do Perfil', t: 'text' },
    { k: 'regional', l: 'Regional', t: 'text' },
  ] },
  tipos_usuario: { title: 'Tipo de Usuário', fields: [
    { k: 'name', l: 'Nome', t: 'text' },
    { k: 'regional', l: 'Regional', t: 'text' },
    { k: 'remuneracao', l: 'Tipo de Remuneração', t: 'text' },
  ] },
  certificados: { title: 'Certificado Digital A1', fields: [
    { k: 'store_id', l: 'Loja / Regional', t: 'store' },
    { k: 'descricao', l: 'Descrição', t: 'text' },
    { k: 'validade', l: 'Validade (AAAA-MM-DD)', t: 'text' },
  ] },
};

function storeName(id) { return (state.stores.find(s => s.id === Number(id)) || {}).name || id; }

async function openCadastro(name) {
  const cfg = CAD[name];
  if (!cfg) return;
  state.cadName = name;
  $('cadTitle').textContent = cfg.title;
  $('cadListTitle').textContent = cfg.title + ' — Registros';
  cadHideForm();
  await cadLoad();
}

function cadFieldHtml(f, val) {
  const v = val === undefined || val === null ? '' : val;
  if (f.t === 'select') {
    return `<div class="form-group"><label>${f.l}</label><select id="cad_${f.k}">
      <option value="">Selecione...</option>
      ${f.o.map(o => `<option value="${o}" ${String(v) === o ? 'selected' : ''}>${o}</option>`).join('')}
    </select></div>`;
  }
  if (f.t === 'store') {
    return `<div class="form-group"><label>${f.l}</label><select id="cad_${f.k}">
      <option value="">Selecione...</option>
      ${state.stores.map(s => `<option value="${s.id}" ${Number(v) === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
    </select></div>`;
  }
  const type = f.t === 'number' ? 'number' : 'text';
  const step = f.t === 'number' ? 'step="0.01"' : '';
  return `<div class="form-group"><label>${f.l}</label><input type="${type}" ${step} id="cad_${f.k}" value="${v}" /></div>`;
}

function cadShowForm(item) {
  const cfg = CAD[state.cadName];
  $('cadId').value = item ? item.id : '';
  $('cadFormTitle').textContent = (item ? 'Editar ' : 'Novo ') + cfg.title;
  $('cadFormFields').innerHTML = cfg.fields.map(f => cadFieldHtml(f, item ? item[f.k] : '')).join('');
  $('cadFormWrap').classList.remove('hidden');
}

function cadHideForm() { $('cadFormWrap').classList.add('hidden'); }

async function cadSubmit() {
  const cfg = CAD[state.cadName];
  const id = $('cadId').value;
  const payload = {};
  for (const f of cfg.fields) {
    const el = $('cad_' + f.k);
    if (!el) continue;
    let v = el.value;
    if (f.t === 'number') v = Number(v || 0);
    if (f.t === 'store') v = v ? Number(v) : null;
    payload[f.k] = v;
  }
  if (cfg.fields[0] && !payload[cfg.fields[0].k] && cfg.fields[0].t !== 'store') {
    return showToast('Preencha ' + cfg.fields[0].l, 'error');
  }
  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/coll/${state.cadName}/${id}` : `/api/coll/${state.cadName}`;
    await api(method, url, payload);
    showToast(cfg.title + ' salvo!');
    cadHideForm();
    cadLoad();
  } catch (e) { showToast(e.message, 'error'); }
}

async function cadLoad() {
  const cfg = CAD[state.cadName];
  try {
    const rows = await api('GET', `/api/coll/${state.cadName}`);
    state.cadList = rows;
    const headers = cfg.fields.map(f => f.l).concat(['Ações']);
    $('cadTable').innerHTML = makeTable(headers, rows.map(r => {
      const cells = cfg.fields.map(f => {
        let v = r[f.k];
        if (f.t === 'store') v = v ? storeName(v) : '—';
        return v === undefined || v === null || v === '' ? '—' : v;
      });
      cells.push(`<button class="btn btnGhost btn-sm" onclick="cadEdit(${r.id})">Editar</button>
        <button class="btn btnGhost btn-sm" onclick="cadDelete(${r.id})">Excluir</button>`);
      return cells;
    }));
  } catch (e) { showToast(e.message, 'error'); }
}

function cadEdit(id) {
  const item = (state.cadList || []).find(x => x.id === id);
  if (item) cadShowForm(item);
}

async function cadDelete(id) {
  if (!confirm('Excluir este registro?')) return;
  try {
    await api('DELETE', `/api/coll/${state.cadName}/${id}`);
    showToast('Excluído');
    cadLoad();
  } catch (e) { showToast(e.message, 'error'); }
}

// ==================== BOOT ====================

if (state.token && state.user) {
  initApp();
} else {
  $('loginScreen').classList.remove('hidden');
}
