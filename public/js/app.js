
const state = { token: localStorage.getItem('jrs_token'), user: JSON.parse(localStorage.getItem('jrs_user') || 'null'), data: {}, sse: null };

const api = {
  async get(url) {
    const res = await fetch(url, { headers: state.token ? { Authorization: `Bearer ${state.token}` } : {} });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro');
    return data;
  },
  async post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro');
    return data;
  }
};

const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function toast(msg, ok = true) {
  const host = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = `toast-item ${ok ? 'ok' : 'err'}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
function formJson(form) { const fd = new FormData(form); const obj = {}; for (const [k, v] of fd.entries()) obj[k] = v; return obj; }
function fillSelect(el, items, label = 'name', value = 'id', blank = false, blankText = 'Selecione') {
  const html = []; if (blank) html.push(`<option value="">${blankText}</option>`); items.forEach(i => html.push(`<option value="${i[value]}">${i[label]}</option>`)); el.innerHTML = html.join('');
}
function showApp() {
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
  document.getElementById('userInfo').textContent = `${state.user.name} (${state.user.role})`;
  const sideName = document.getElementById('sideUserName');
  const sideRole = document.getElementById('sideUserRole');
  if (sideName) sideName.textContent = state.user.name;
  if (sideRole) sideRole.textContent = state.user.role === 'ADMIN' ? 'ADMINISTRADOR' : 'OPERADOR';
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = state.user.role === 'ADMIN' ? '' : 'none');
}
function showLogin() {
  document.getElementById('appView').classList.add('hidden');
  document.getElementById('loginView').classList.remove('hidden');
}
async function login(ev) {
  ev.preventDefault();
  try {
    const data = await api.post('/api/login', formJson(ev.target));
    state.token = data.token; state.user = data.user;
    localStorage.setItem('jrs_token', data.token);
    localStorage.setItem('jrs_user', JSON.stringify(data.user));
    showApp(); startSSE(); await refreshAll(false);
  } catch (err) { toast(err.message, false); }
}
function logout() {
  localStorage.removeItem('jrs_token'); localStorage.removeItem('jrs_user');
  if (state.sse) state.sse.close();
  state.token = null; state.user = null; showLogin();
}
function setViewMeta(tab) {
  const titles = {
    dashboard:['Dashboard Gerencial','Resumo operacional das lojas REALME.'],
    caixa:['Caixa','Abertura, fechamento e histórico por loja.'],
    entrada:['Entrada de Nota XML','Importação de XML, fornecedor, nota e entrada com IMEIs.'],
    clientes:['Clientes','Cadastro central de clientes e base vinda do app Android futuro.'],
    assistencia:['Assistência / Reembalo','Saídas técnicas e retorno ao estoque.'],
    transferencia:['Transferência entre Lojas','Movimentação interna com rastreio por IMEI.'],
    estoque:['Estoque / IMEIs','Consulta detalhada por loja, produto, status e código de barras.'],
    financeiro:['Financeiro','Receitas, despesas e acompanhamento operacional por loja.'],
    funcionarios:['Funcionários','Cadastro de funcionários e vínculo por loja.'],
    cadastros:['Cadastros','Usuários e vendedores do sistema.'],
    notas:['Notas','Entradas e saídas registradas no sistema.']
  };
  const meta = titles[tab] || ['JRS PDV','Painel operacional'];
  document.getElementById('viewTitle').textContent = meta[0];
  document.getElementById('viewSubtitle').textContent = meta[1];
}
function bindTabs() {
  document.querySelectorAll('.tab, .tablink').forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    const tab = btn.dataset.tab;
    if (!tab) return;

    document.querySelectorAll('.tab, .tablink').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.remove('active');
      panel.style.display = 'none';
    });

    document.querySelectorAll(`[data-tab="${tab}"]`).forEach(x => x.classList.add('active'));
    const activePanel = document.getElementById(tab);
    if (activePanel) {
      activePanel.classList.add('active');
      activePanel.style.display = 'block';
    }

    setViewMeta(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
}
function renderCards(c) {
  const items = [
    { label:'Estoque disponível', value: String(c.available_units || 0), icon:'◫' , delta:'+11.0%'},
    { label:'Em assistência', value: String(c.assistance_units || 0), icon:'🛠', delta:'-1.2%', bad:true},
    { label:'Clientes cadastrados', value: String(state.data.bootstrap?.customers_count || 0), icon:'👥', delta:'+8.2%'},
    { label:'Funcionários', value: String(state.data.bootstrap?.employees_count || 0), icon:'👤', delta:'+5.0%'}
  ];
  document.getElementById('cards').innerHTML = items.map(item => `
    <div class="card kpi">
      <div class="left">
        <div class="icon">${item.icon}</div>
        <div>
          <div class="label">${item.label}</div>
          <div class="value">${item.value}</div>
        </div>
      </div>
      <div class="delta ${item.bad ? 'bad' : ''}">${item.delta}</div>
    </div>`).join('');
}
function renderStockSummary(rows) {
  const ids = getSelectedStoreIds();
  const filtered = ids.includes('ALL') ? rows : rows.filter(r => ids.includes(String((state.data.bootstrap.stores.find(s => s.name === r.store_name)||{}).id)));
  document.querySelector('#stockSummaryTable tbody').innerHTML = filtered.map(r => `<tr><td>${r.store_name}</td><td>${r.product_name}</td><td>${money(r.price)}</td><td>${r.available_qty || 0}</td><td>${r.assistance_qty || 0}</td><td>${r.repack_qty || 0}</td><td>${r.sold_qty || 0}</td></tr>`).join('');
}
function renderNotes(notes) {
  document.querySelector('#notesEntryTable tbody').innerHTML = notes.entries.map(r => `<tr><td>${r.created_at}</td><td>${r.store_name}</td><td>${r.note_number || ''}</td><td>${r.product_name}</td><td>${r.quantity}</td><td>${money(r.total_value)}</td></tr>`).join('');
  document.querySelector('#notesExitTable tbody').innerHTML = notes.exits.map(r => `<tr><td>${r.created_at}</td><td>${r.store_name}</td><td>${r.note_number || ''}</td><td>${r.product_name}</td><td>${r.quantity}</td><td>${r.reason || ''}</td></tr>`).join('');
}
function renderCash(rows) { document.querySelector('#cashTable tbody').innerHTML = rows.map(r => `<tr><td>${r.store_name}</td><td>${r.opened_by}</td><td>${r.opened_at}</td><td>${money(r.opening_amount)}</td><td>${r.closed_by || ''}</td><td>${r.closed_at || ''}</td><td>${r.closing_amount ? money(r.closing_amount) : ''}</td><td>${r.status}</td></tr>`).join(''); }
function renderUsers(rows) { const body = document.querySelector('#usersTable tbody'); if(body) body.innerHTML = rows.map(r => `<tr><td>${r.name}</td><td>${r.username}</td><td>${r.role}</td><td>${r.active ? 'Sim' : 'Não'}</td></tr>`).join(''); }
function renderSellerList(rows) { const body = document.querySelector('#sellerTable tbody'); if(body) body.innerHTML = rows.map(r => `<tr><td>${r.store_name}</td><td>${r.name}</td><td>${r.active ? 'Sim' : 'Não'}</td></tr>`).join(''); }
function renderRankings(rankings) {
  document.querySelector('#rankSellerTable tbody').innerHTML = rankings.sellers.map(r => `<tr><td>${r.seller_name}</td><td>${r.total_sales}</td><td>${money(r.total_value)}</td></tr>`).join('');
  document.querySelector('#rankProductTable tbody').innerHTML = rankings.products.map(r => `<tr><td>${r.product_name}</td><td>${r.qty}</td><td>${money(r.total_value)}</td></tr>`).join('');
}
function findProductById(id) { return state.data.bootstrap.products.find(p => String(p.id) === String(id)); }
function findProductByBarcode(code) { return state.data.bootstrap.products.find(p => String(p.barcode || '') === String((code || '').trim())); }
async function hydrateSellers() {
  const storeId = document.getElementById('saleStore').value;
  const sellers = state.data.bootstrap.sellers.filter(x => String(x.store_id) === String(storeId));
  fillSelect(document.getElementById('saleSeller'), sellers, 'name', 'name');
}
function updateSalePrice() { const p = findProductById(document.getElementById('saleProduct').value); if (p) document.getElementById('salePrice').value = p.price; }
async function updateAvailableImeis(mode) {
  const map = {
        dashboard:['dashboard','resumo'],
        caixa:['caixa','fechamento','abertura'],
        entrada:['entrada','nota','nf','xml'],
        clientes:['cliente','clientes','cadastro cliente'],
        assistencia:['assistencia','reembalo','assistência'],
        transferencia:['transferencia','transferência'],
        estoque:['estoque','imei'],
        financeiro:['financeiro','despesa','receita'],
        funcionarios:['funcionario','funcionário','equipe','vendedor'],
        cadastros:['cadastro','usuario','usuário'],
        notas:['notas']
      };
  renderCards(bootstrap.cards); renderStockSummary(bootstrap.stockSummary); renderSales(storeFilterList(customers)); renderMoves(storeFilterList(moves)); renderService(storeFilterList(serviceMoves));
  renderFinance({entries: storeFilterList(finance.entries), summary: finance.summary}); renderNotes({entries: storeFilterList(notes.entries), exits: storeFilterList(notes.exits)}); renderImeis(storeFilterList(imeis)); renderTransfers(transfers.filter(t => getSelectedStoreIds().includes('ALL') || getSelectedStoreIds().includes(String(t.from_store_id)) || getSelectedStoreIds().includes(String(t.to_store_id)))); renderCash(storeFilterList(cash)); renderUsers(users); renderCustomers(storeFilterList(customers)); renderEmployees(storeFilterList(employees));
  renderSellerList(bootstrap.sellers); renderRankings(bootstrap.rankings); hydrateSelects();
  if (withToast) toast('Painel atualizado.');
}
function startSSE() {
  if (state.sse) state.sse.close();
  state.sse = new EventSource('/api/events');
  state.sse.onmessage = async (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type !== 'connected') {
        await refreshAll(false);
        toast(`Atualização recebida: ${msg.type}`);
      }
    } catch {}
  };
  state.sse.onopen = () => { document.getElementById('liveBadge').textContent = 'Tempo real'; };
  state.sse.onerror = () => { document.getElementById('liveBadge').textContent = 'Reconectando'; };
}
function bind() {
  bindTabs();
  document.getElementById('loginForm').addEventListener('submit', login);
  document.getElementById('logoutBtn').addEventListener('click', logout);

  document.getElementById('saleStore').addEventListener('change', async () => { await hydrateSellers(); await updateAvailableImeis('sale'); });
  document.getElementById('saleProduct').addEventListener('change', async () => { updateSalePrice(); await updateAvailableImeis('sale'); });
  document.getElementById('serviceStore').addEventListener('change', () => updateAvailableImeis('service'));
  document.getElementById('serviceProduct').addEventListener('change', () => updateAvailableImeis('service'));
  document.getElementById('transferFromStore').addEventListener('change', () => updateAvailableImeis('transfer'));
  document.getElementById('transferProduct').addEventListener('change', () => updateAvailableImeis('transfer'));

  document.getElementById('entryBarcode').addEventListener('change', () => applyBarcode('entry', 'entryBarcode'));
  document.getElementById('saleBarcode').addEventListener('change', () => applyBarcode('sale', 'saleBarcode'));
  document.getElementById('reloadImeis').addEventListener('click', loadImeisByFilters);
  document.getElementById('imeiFilterStore').addEventListener('change', loadImeisByFilters);
  document.getElementById('imeiFilterProduct').addEventListener('change', loadImeisByFilters);
  document.getElementById('imeiFilterStatus').addEventListener('change', loadImeisByFilters);

  document.getElementById('cashOpenForm').addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/cash/open', { store_id: Number(d.store_id), opening_amount: Number(d.opening_amount || 0) }); e.target.reset(); } catch (err) { toast(err.message, false); } });
  document.getElementById('cashCloseForm').addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/cash/close', { store_id: Number(d.store_id), closing_amount: Number(d.closing_amount || 0) }); e.target.reset(); } catch (err) { toast(err.message, false); } });
  document.getElementById('entryForm').addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); const imeis = (d.imeis || '').split('\n').map(x => x.trim()).filter(Boolean); try { await api.post('/api/note-entry', { store_id: Number(d.store_id), supplier_name: d.supplier_name, note_number: d.note_number, product_id: Number(d.product_id), imeis, notes: d.notes }); e.target.reset(); } catch (err) { toast(err.message, false); } });
  document.getElementById('saleForm').addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/sell', { store_id: Number(d.store_id), product_id: Number(d.product_id), imei: d.imei, seller_name: d.seller_name, customer_name: d.customer_name, payment_method: d.payment_method, sale_price: Number(d.sale_price) }); e.target.reset(); } catch (err) { toast(err.message, false); } });
  document.getElementById('serviceOutForm').addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/service-move', { store_id: Number(d.store_id), product_id: Number(d.product_id), imei: d.imei, move_type: d.move_type, destination_name: d.destination_name, notes: d.notes }); e.target.reset(); } catch (err) { toast(err.message, false); } });
  document.getElementById('serviceReturnForm').addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/service-return', d); e.target.reset(); } catch (err) { toast(err.message, false); } });
  document.getElementById('transferForm').addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/transfer', { from_store_id: Number(d.from_store_id), to_store_id: Number(d.to_store_id), product_id: Number(d.product_id), imei: d.imei, notes: d.notes }); e.target.reset(); } catch (err) { toast(err.message, false); } });
  document.getElementById('expenseForm').addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/finance-expense', { store_id: d.store_id ? Number(d.store_id) : null, category: d.category, description: d.description, amount: Number(d.amount), due_date: d.due_date, status: d.status }); e.target.reset(); } catch (err) { toast(err.message, false); } });
  document.getElementById('incomeForm').addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/finance-income', { store_id: d.store_id ? Number(d.store_id) : null, category: d.category, description: d.description, amount: Number(d.amount), due_date: d.due_date, status: d.status }); e.target.reset(); } catch (err) { toast(err.message, false); } });


  const globalStoreFilter = document.getElementById('globalStoreFilter');
  if (globalStoreFilter) globalStoreFilter.addEventListener('change', async () => {
    const vals = Array.from(globalStoreFilter.selectedOptions).map(o=>o.value);
    if (vals.includes('ALL')) Array.from(globalStoreFilter.options).forEach(o => o.selected = (o.value === 'ALL'));
    else {
      const allOpt = document.querySelector('#globalStoreFilter option[value="ALL"]');
      if (allOpt) allOpt.selected = false;
    }
    await refreshAll(false);
  });

  const customerForm = document.getElementById('customerForm');
  if (customerForm) customerForm.addEventListener('submit', async e => {
    e.preventDefault();
    const d = formJson(e.target);
    try { await api.post('/api/customers', { name:d.name, cpf:d.cpf, phone:d.phone, store_id:Number(d.store_id), origin_app:false }); e.target.reset(); } catch (err) { toast(err.message, false); }
  });

  const employeeForm = document.getElementById('employeeForm');
  if (employeeForm) employeeForm.addEventListener('submit', async e => {
    e.preventDefault();
    const d = formJson(e.target);
    try { await api.post('/api/employees', { name:d.name, role_name:d.role_name, store_id:Number(d.store_id) }); e.target.reset(); } catch (err) { toast(err.message, false); }
  });

  const userForm = document.getElementById('userForm');
  if (userForm) userForm.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/users', d); e.target.reset(); } catch (err) { toast(err.message, false); } });
  const sellerForm = document.getElementById('sellerForm');
  if (sellerForm) sellerForm.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/sellers', { store_id: Number(d.store_id), name: d.name }); e.target.reset(); } catch (err) { toast(err.message, false); } });

  const xmlForm = document.getElementById('xmlParseForm');
  if (xmlForm) xmlForm.addEventListener('submit', async e => {
    e.preventDefault();
    const d = formJson(e.target);
    try {
      const parsed = await api.post('/api/nfe/parse', { xml: d.xml });
      renderXmlPreview(parsed);
      toast('XML lido com sucesso.');
    } catch (err) {
      toast(err.message, false);
    }
  });

  const applyXmlBtn = document.getElementById('applyXmlToEntry');
  if (applyXmlBtn) applyXmlBtn.addEventListener('click', applyXmlToEntryForm);

}
async function boot() {
  bind();
  if (state.token && state.user) {
    showApp(); startSSE();
    try { await refreshAll(false); } catch (_) { logout(); }
  } else showLogin();
}
boot();

document.addEventListener('DOMContentLoaded', () => {
  const gs = document.getElementById('globalSearch');
  if (gs) {
    gs.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const q = gs.value.toLowerCase().trim();
      const map = {
        dashboard:['dashboard','resumo'],
        caixa:['caixa','fechamento','abertura'],
        entrada:['entrada','nota','nf','xml'],
        clientes:['cliente','clientes','cadastro cliente'],
        assistencia:['assistencia','reembalo','assistência'],
        transferencia:['transferencia','transferência'],
        estoque:['estoque','imei'],
        financeiro:['financeiro','despesa','receita'],
        funcionarios:['funcionario','funcionário','equipe','vendedor'],
        cadastros:['cadastro','usuario','usuário'],
        notas:['notas']
      };
      const found = Object.entries(map).find(([k, arr]) => arr.some(v => q.includes(v)));
      if (found) {
        document.querySelectorAll(`[data-tab="${found[0]}"]`)[0]?.click();
      }
    });
  }
});


document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.style.display = panel.id === 'dashboard' ? 'block' : 'none';
  });
  setViewMeta('dashboard');
});


state.xmlParsed = null;

function renderXmlPreview(data){
  state.xmlParsed = data;
  const box = document.getElementById('xmlPreview');
  if (!box) return;
  box.classList.remove('hidden');
  document.getElementById('xmlSupplier').textContent = data.supplier_name || '-';
  document.getElementById('xmlNoteNumber').textContent = data.note_number || '-';
  document.getElementById('xmlIssueDate').textContent = data.issue_date || '-';
  document.querySelector('#xmlItemsTable tbody').innerHTML = (data.items || []).map(item => `
    <tr>
      <td>${item.code || ''}</td>
      <td>${item.barcode || ''}</td>
      <td>${item.name || ''}</td>
      <td>${item.quantity || 0}</td>
      <td>${money(item.unit_price || 0)}</td>
      <td>${money(item.total || 0)}</td>
    </tr>`).join('');
}

function applyXmlToEntryForm(){
  if (!state.xmlParsed) return;
  const form = document.getElementById('entryForm');
  if (!form) return;
  form.querySelector('input[name="supplier_name"]').value = state.xmlParsed.supplier_name || '';
  form.querySelector('input[name="note_number"]').value = state.xmlParsed.note_number || '';
  const first = (state.xmlParsed.items || [])[0];
  if (first) {
    const barcodeField = document.getElementById('entryBarcode');
    if (barcodeField && first.barcode) {
      barcodeField.value = first.barcode;
      barcodeField.dispatchEvent(new Event('change'));
    } else {
      const p = state.data.bootstrap.products.find(prod => String(prod.name).trim().toLowerCase() === String(first.name || '').trim().toLowerCase());
      if (p) document.getElementById('entryProduct').value = p.id;
    }
  }
  toast('Dados do XML aplicados no formulário.');
}
