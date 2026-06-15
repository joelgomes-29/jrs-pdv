
const state = {
  token: localStorage.getItem('jrs_token'),
  user: JSON.parse(localStorage.getItem('jrs_user') || 'null'),
  data: {},
  sse: null,
  charts: {},
  xmlParsed: null,
  allSales: [],
  allFinance: [],
  allCustomers: [],
  allImeis: [],
};

/* ─── API ─────────────────────────────────────────────────── */
const api = {
  async get(url) {
    const res = await fetch(url, { headers: state.token ? { Authorization: `Bearer ${state.token}` } : {} });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro');
    return data;
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro');
    return data;
  },
};

/* ─── UTILS ───────────────────────────────────────────────── */
const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = v => (v || '').slice(0, 16).replace('T', ' ');

function toast(msg, ok = true) {
  const host = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = `toast-item ${ok ? 'ok' : 'err'}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function formJson(form) {
  const fd = new FormData(form);
  const obj = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

function fillSelect(el, items, label = 'name', value = 'id', blank = false, blankText = 'Selecione') {
  if (!el) return;
  const html = [];
  if (blank) html.push(`<option value="">${blankText}</option>`);
  items.forEach(i => html.push(`<option value="${i[value]}">${i[label]}</option>`));
  el.innerHTML = html.join('');
}

function getSelectedStoreIds() {
  const sel = document.getElementById('globalStoreFilter');
  if (!sel) return ['ALL'];
  const vals = Array.from(sel.selectedOptions).map(o => o.value);
  return vals.length === 0 || vals.includes('ALL') ? ['ALL'] : vals;
}

function storeFilterList(list = []) {
  const ids = getSelectedStoreIds();
  if (ids.includes('ALL')) return list;
  return list.filter(x => ids.includes(String(x.store_id)));
}

function exportCSV(filename, headers, rows) {
  const lines = [headers.join(';'), ...rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ─── AUTH ────────────────────────────────────────────────── */
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

/* ─── TABS ────────────────────────────────────────────────── */
const TAB_META = {
  dashboard:    ['Dashboard Gerencial', 'Resumo operacional das lojas REALME.'],
  vendas:       ['Vendas / PDV', 'Registre vendas e consulte o histórico completo.'],
  caixa:        ['Caixa', 'Abertura, fechamento e histórico por loja.'],
  entrada:      ['Entrada de Nota', 'Importação de XML, fornecedor e entrada com IMEIs.'],
  clientes:     ['Clientes', 'Cadastro central de clientes da base REALME.'],
  assistencia:  ['Assistência / Reembalo', 'Saídas técnicas e retorno ao estoque.'],
  transferencia:['Transferência entre Lojas', 'Movimentação interna com rastreio por IMEI.'],
  estoque:      ['Estoque / IMEIs', 'Consulta detalhada por loja, produto e status.'],
  financeiro:   ['Financeiro', 'Receitas, despesas e acompanhamento por loja.'],
  relatorios:   ['Relatórios', 'DRE, Fluxo de Caixa e relatório de vendas por período.'],
  funcionarios: ['Funcionários', 'Cadastro de funcionários e vínculo por loja.'],
  notas:        ['Notas', 'Entradas e saídas registradas no sistema.'],
  cadastros:    ['Cadastros', 'Usuários e vendedores do sistema.'],
};

function setViewMeta(tab) {
  const meta = TAB_META[tab] || ['JRS PDV', 'Painel operacional'];
  document.getElementById('viewTitle').textContent = meta[0];
  document.getElementById('viewSubtitle').textContent = meta[1];
}

function bindTabs() {
  document.querySelectorAll('.tablink').forEach(btn => btn.addEventListener('click', e => {
    e.preventDefault();
    const tab = btn.dataset.tab;
    if (!tab) return;
    document.querySelectorAll('.tablink').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    document.querySelectorAll(`[data-tab="${tab}"]`).forEach(x => x.classList.add('active'));
    const panel = document.getElementById(tab);
    if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
    setViewMeta(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
}

/* ─── RENDER FUNCTIONS ────────────────────────────────────── */
function renderCards(c) {
  const totalVendas = (state.allSales || []).reduce((a, s) => a + Number(s.sale_price || 0), 0);
  const qtdVendas = (state.allSales || []).length;
  const ticketMedio = qtdVendas ? totalVendas / qtdVendas : 0;
  const items = [
    { label: 'Estoque disponível',    value: String(c.available_units || 0),  icon: 'fa-boxes-stacked',   color: 'blue' },
    { label: 'Total de vendas (R$)',  value: money(totalVendas),               icon: 'fa-sack-dollar',     color: 'green' },
    { label: 'Ticket médio',          value: money(ticketMedio),               icon: 'fa-chart-line',      color: 'purple' },
    { label: 'Em assistência',        value: String(c.assistance_units || 0),  icon: 'fa-screwdriver-wrench', color: 'orange' },
  ];
  document.getElementById('cards').innerHTML = items.map(item => `
    <div class="card kpi kpi-${item.color}">
      <div class="left">
        <div class="icon"><i class="fa-solid ${item.icon}"></i></div>
        <div>
          <div class="label">${item.label}</div>
          <div class="value">${item.value}</div>
        </div>
      </div>
    </div>`).join('');
}

function renderFinanceCards(summary) {
  if (!summary) return;
  const items = [
    { label: 'Total Receitas',  value: money(summary.total_income),   color: 'green' },
    { label: 'Total Despesas',  value: money(summary.total_expense),  color: 'red' },
    { label: 'Resultado',       value: money(summary.result),         color: summary.result >= 0 ? 'green' : 'red' },
    { label: 'Caixas Abertos',  value: String(summary.open_cash || 0), color: 'blue' },
  ];
  const el = document.getElementById('financeCards');
  if (el) el.innerHTML = items.map(i => `<div class="card kpi kpi-${i.color}"><div class="left"><div><div class="label">${i.label}</div><div class="value">${i.value}</div></div></div></div>`).join('');
}

function renderStockSummary(rows) {
  const ids = getSelectedStoreIds();
  const stores = state.data.bootstrap?.stores || [];
  const filtered = ids.includes('ALL') ? rows : rows.filter(r => {
    const s = stores.find(x => x.name === r.store_name);
    return s && ids.includes(String(s.id));
  });
  document.querySelector('#stockSummaryTable tbody').innerHTML = filtered.map(r => `
    <tr><td>${r.store_name}</td><td>${r.product_name}</td><td>${money(r.price)}</td>
    <td><span class="badge green">${r.available_qty || 0}</span></td>
    <td><span class="badge orange">${r.assistance_qty || 0}</span></td>
    <td><span class="badge gray">${r.repack_qty || 0}</span></td>
    <td><span class="badge blue">${r.sold_qty || 0}</span></td></tr>`).join('');
}

function renderRankings(rankings) {
  document.querySelector('#rankSellerTable tbody').innerHTML = (rankings.sellers || []).map((r, i) =>
    `<tr><td>${i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}${r.seller_name}</td><td>${r.total_sales}</td><td>${money(r.total_value)}</td></tr>`).join('');
  document.querySelector('#rankProductTable tbody').innerHTML = (rankings.products || []).map(r =>
    `<tr><td>${r.product_name}</td><td>${r.qty}</td><td>${money(r.total_value)}</td></tr>`).join('');
}

function renderCustomers(list) {
  const q = (document.getElementById('clienteSearch')?.value || '').toLowerCase();
  const filtered = q ? list.filter(r => `${r.name} ${r.cpf} ${r.phone}`.toLowerCase().includes(q)) : list;
  const tbody = document.querySelector('#salesTable tbody');
  if (tbody) tbody.innerHTML = filtered.slice(0, 20).map(r =>
    `<tr><td>${fmt(r.created_at)}</td><td>${r.store_name}</td><td>${r.name}</td><td>${r.cpf || ''}</td><td>${r.phone || ''}</td><td>${r.origin_app ? 'App' : 'Dashboard'}</td></tr>`).join('');
  const cBody = document.querySelector('#customersTable tbody');
  if (cBody) cBody.innerHTML = filtered.map(r =>
    `<tr><td>${fmt(r.created_at)}</td><td>${r.store_name}</td><td>${r.name}</td><td>${r.cpf || ''}</td><td>${r.phone || ''}</td><td>${r.origin_app ? 'App' : 'Dashboard'}</td></tr>`).join('');
}

function renderMoves(list) {
  const movLabels = { ENTRY_NOTE:'Entrada NF', SALE:'Venda', TRANSFER_OUT:'Transf. Saída', TRANSFER_IN:'Transf. Entrada', ASSISTANCE:'Assistência', REPACK:'Reembalo', RETURN_TO_STOCK:'Retorno' };
  document.querySelector('#movesTable tbody').innerHTML = list.slice(0, 20).map(r =>
    `<tr><td>${fmt(r.created_at)}</td><td>${r.store_name}</td><td>${r.product_name}</td><td>${r.imei}</td><td>${movLabels[r.movement_type] || r.movement_type}</td><td>${r.notes || ''}</td></tr>`).join('');
}

function renderService(list) {
  document.querySelector('#serviceTable tbody').innerHTML = list.map(r =>
    `<tr><td>${fmt(r.created_at)}</td><td>${r.store_name}</td><td>${r.product_name}</td><td>${r.imei}</td><td>${r.move_type === 'ASSISTANCE' ? 'Assistência' : 'Reembalo'}</td><td><span class="badge ${r.status === 'OPEN' ? 'orange' : 'green'}">${r.status === 'OPEN' ? 'Aberto' : 'Retornado'}</span></td><td>${r.destination_name || ''}</td><td>${r.notes || ''}</td></tr>`).join('');
}

function renderTransfers(list) {
  document.querySelector('#transferTable tbody').innerHTML = list.map(r =>
    `<tr><td>${fmt(r.created_at)}</td><td>${r.from_store_name}</td><td>${r.to_store_name}</td><td>${r.product_name}</td><td>${r.imei}</td><td>${r.requested_by}</td><td>${r.notes || ''}</td></tr>`).join('');
}

function renderCash(rows) {
  document.querySelector('#cashTable tbody').innerHTML = rows.map(r =>
    `<tr><td>${r.store_name}</td><td>${r.opened_by}</td><td>${fmt(r.opened_at)}</td><td>${money(r.opening_amount)}</td><td>${r.closed_by || ''}</td><td>${fmt(r.closed_at)}</td><td>${r.closing_amount ? money(r.closing_amount) : ''}</td><td><span class="badge ${r.status === 'OPEN' ? 'green' : 'gray'}">${r.status === 'OPEN' ? 'Aberto' : 'Fechado'}</span></td></tr>`).join('');
}

function renderFinance(data) {
  renderFinanceCards(data.summary);
  document.querySelector('#financeTable tbody').innerHTML = (data.entries || []).map(r =>
    `<tr><td>${fmt(r.created_at)}</td><td>${r.store_name || ''}</td><td><span class="badge ${r.entry_type === 'INCOME' ? 'green' : 'red'}">${r.entry_type === 'INCOME' ? 'Receita' : 'Despesa'}</span></td><td>${r.category}</td><td>${r.description}</td><td>${r.due_date || ''}</td><td><span class="badge ${r.status === 'PAID' ? 'green' : 'orange'}">${r.status === 'PAID' ? 'Pago' : 'Em aberto'}</span></td><td>${money(r.amount)}</td></tr>`).join('');
}

function renderNotes(notes) {
  document.querySelector('#notesEntryTable tbody').innerHTML = (notes.entries || []).map(r =>
    `<tr><td>${fmt(r.created_at)}</td><td>${r.store_name}</td><td>${r.note_number || ''}</td><td>${r.product_name}</td><td>${r.quantity}</td><td>${money(r.total_value)}</td></tr>`).join('');
  document.querySelector('#notesExitTable tbody').innerHTML = (notes.exits || []).map(r =>
    `<tr><td>${fmt(r.created_at)}</td><td>${r.store_name}</td><td>${r.note_number || ''}</td><td>${r.product_name}</td><td>${r.quantity}</td><td>${r.reason || ''}</td></tr>`).join('');
}

function renderImeis(list) {
  const statusLabel = { AVAILABLE: 'Disponível', ASSISTANCE: 'Assistência', REPACK: 'Reembalo', SOLD: 'Vendido' };
  const statusColor = { AVAILABLE: 'green', ASSISTANCE: 'orange', REPACK: 'gray', SOLD: 'blue' };
  document.querySelector('#imeiTable tbody').innerHTML = list.map(r =>
    `<tr><td>${r.store_name}</td><td>${r.product_name}</td><td>${r.imei}</td><td><span class="badge ${statusColor[r.status] || 'gray'}">${statusLabel[r.status] || r.status}</span></td><td>${r.last_document || ''}</td><td>${r.location_note || ''}</td><td>${fmt(r.updated_at)}</td></tr>`).join('');
}

function renderUsers(rows) {
  const body = document.querySelector('#usersTable tbody');
  if (body) body.innerHTML = rows.map(r => `<tr><td>${r.name}</td><td>${r.username}</td><td>${r.role}</td><td>${r.active ? 'Sim' : 'Não'}</td></tr>`).join('');
}

function renderSellerList(rows) {
  const body = document.querySelector('#sellerTable tbody');
  if (body) body.innerHTML = rows.map(r => `<tr><td>${r.store_name}</td><td>${r.name}</td><td>${r.active ? 'Sim' : 'Não'}</td></tr>`).join('');
}

function renderEmployees(list) {
  const body = document.querySelector('#employeesTable tbody');
  if (body) body.innerHTML = list.map(r => `<tr><td>${r.store_name}</td><td>${r.name}</td><td>${r.role_name || ''}</td><td>${r.active ? 'Ativo' : 'Inativo'}</td><td>${fmt(r.created_at)}</td></tr>`).join('');
}

function renderVendas(list) {
  document.querySelector('#vendasTable tbody').innerHTML = list.map(r =>
    `<tr><td>${fmt(r.created_at)}</td><td>${r.store_name}</td><td>${r.product_name}</td><td>${r.imei}</td><td>${r.seller_name}</td><td>${r.customer_name || ''}</td><td>${r.payment_method}</td><td>${money(r.sale_price)}</td></tr>`).join('');
}

/* ─── CHARTS ──────────────────────────────────────────────── */
function renderCharts() {
  const sales = state.allSales || [];
  const finance = state.allFinance || [];

  // Chart Vendas — últimos 7 dias
  const days = [];
  const daySales = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push(key.slice(5)); // MM-DD
    daySales.push(sales.filter(s => (s.created_at || '').slice(0, 10) === key).reduce((a, s) => a + Number(s.sale_price || 0), 0));
  }

  const cvCanvas = document.getElementById('chartVendas');
  if (cvCanvas) {
    if (state.charts.vendas) state.charts.vendas.destroy();
    state.charts.vendas = new Chart(cvCanvas, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [{ label: 'Vendas (R$)', data: daySales, backgroundColor: '#3b82f6', borderRadius: 6 }],
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => money(v) } } } },
    });
  }

  // Chart Financeiro — receita x despesa
  const totalIncome = finance.filter(x => x.entry_type === 'INCOME').reduce((a, b) => a + Number(b.amount || 0), 0);
  const totalExpense = finance.filter(x => x.entry_type === 'EXPENSE').reduce((a, b) => a + Number(b.amount || 0), 0);
  const cfCanvas = document.getElementById('chartFinanceiro');
  if (cfCanvas) {
    if (state.charts.financeiro) state.charts.financeiro.destroy();
    state.charts.financeiro = new Chart(cfCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Receitas', 'Despesas'],
        datasets: [{ data: [totalIncome, totalExpense], backgroundColor: ['#22c55e', '#ef4444'], borderWidth: 0 }],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => money(ctx.raw) } } } },
    });
  }
}

/* ─── RELATÓRIOS ──────────────────────────────────────────── */
function gerarRelatorioVendas() {
  const inicio = document.getElementById('relDataInicio').value;
  const fim = document.getElementById('relDataFim').value;
  const lojaId = document.getElementById('relLoja').value;
  let list = state.allSales || [];
  if (inicio) list = list.filter(s => (s.created_at || '') >= inicio);
  if (fim)    list = list.filter(s => (s.created_at || '') <= fim + ' 23:59:59');
  if (lojaId) list = list.filter(s => String(s.store_id) === lojaId);

  const total = list.reduce((a, s) => a + Number(s.sale_price || 0), 0);
  const ticket = list.length ? total / list.length : 0;
  const cards = [
    { label: 'Total vendas', value: String(list.length), color: 'blue' },
    { label: 'Faturamento', value: money(total), color: 'green' },
    { label: 'Ticket médio', value: money(ticket), color: 'purple' },
    { label: 'Pagto mais usado', value: modoPagtoMaisUsado(list), color: 'orange' },
  ];
  document.getElementById('relVendasCards').innerHTML = cards.map(c =>
    `<div class="card kpi kpi-${c.color}"><div class="left"><div><div class="label">${c.label}</div><div class="value">${c.value}</div></div></div></div>`).join('');
  document.querySelector('#relVendasTable tbody').innerHTML = list.map(r =>
    `<tr><td>${fmt(r.created_at)}</td><td>${r.store_name}</td><td>${r.product_name}</td><td>${r.imei}</td><td>${r.seller_name}</td><td>${r.customer_name || ''}</td><td>${r.payment_method}</td><td>${money(r.sale_price)}</td></tr>`).join('');
}

function modoPagtoMaisUsado(list) {
  if (!list.length) return '-';
  const cnt = {};
  list.forEach(s => { cnt[s.payment_method] = (cnt[s.payment_method] || 0) + 1; });
  return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
}

function gerarDRE() {
  const mes = Number(document.getElementById('dreMes').value);
  const ano = Number(document.getElementById('dreAno').value);
  const finance = state.allFinance || [];
  const filtrado = finance.filter(f => {
    const d = new Date(f.created_at || '');
    return d.getMonth() === mes && d.getFullYear() === ano;
  });
  const receitas = filtrado.filter(f => f.entry_type === 'INCOME');
  const despesas = filtrado.filter(f => f.entry_type === 'EXPENSE');
  const totalR = receitas.reduce((a, b) => a + Number(b.amount || 0), 0);
  const totalD = despesas.reduce((a, b) => a + Number(b.amount || 0), 0);
  const resultado = totalR - totalD;

  // Agrupar por categoria
  const recCat = groupByCategory(receitas);
  const desCat = groupByCategory(despesas);

  document.getElementById('dreResult').innerHTML = `
    <div class="dre-section green">
      <div class="dre-title">RECEITAS</div>
      ${Object.entries(recCat).map(([cat, val]) => `<div class="dre-row"><span>${cat}</span><span>${money(val)}</span></div>`).join('')}
      <div class="dre-total">Total Receitas: ${money(totalR)}</div>
    </div>
    <div class="dre-section red">
      <div class="dre-title">DESPESAS</div>
      ${Object.entries(desCat).map(([cat, val]) => `<div class="dre-row"><span>${cat}</span><span>${money(val)}</span></div>`).join('')}
      <div class="dre-total">Total Despesas: ${money(totalD)}</div>
    </div>
    <div class="dre-resultado ${resultado >= 0 ? 'positive' : 'negative'}">
      RESULTADO: ${money(resultado)}
    </div>`;
}

function gerarFluxoCaixa() {
  const mes = Number(document.getElementById('fluxoMes').value);
  const ano = Number(document.getElementById('fluxoAno').value);
  const finance = state.allFinance || [];

  // Dias do mês
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const labels = [];
  const recDia = [];
  const desDia = [];

  for (let d = 1; d <= diasNoMes; d++) {
    const key = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    labels.push(String(d));
    const dia = finance.filter(f => (f.created_at || '').slice(0, 10) === key);
    recDia.push(dia.filter(f => f.entry_type === 'INCOME').reduce((a, b) => a + Number(b.amount || 0), 0));
    desDia.push(dia.filter(f => f.entry_type === 'EXPENSE').reduce((a, b) => a + Number(b.amount || 0), 0));
  }

  const canvas = document.getElementById('chartFluxo');
  if (canvas) {
    if (state.charts.fluxo) state.charts.fluxo.destroy();
    state.charts.fluxo = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Receitas', data: recDia, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.3 },
          { label: 'Despesas', data: desDia, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.3 },
        ],
      },
      options: { responsive: true, scales: { y: { ticks: { callback: v => money(v) } } } },
    });
  }

  const totalR = recDia.reduce((a, b) => a + b, 0);
  const totalD = desDia.reduce((a, b) => a + b, 0);
  document.getElementById('fluxoResult').innerHTML = `
    <div class="dre-row"><span>Total Receitas</span><span class="green">${money(totalR)}</span></div>
    <div class="dre-row"><span>Total Despesas</span><span class="red">${money(totalD)}</span></div>
    <div class="dre-resultado ${totalR - totalD >= 0 ? 'positive' : 'negative'}">Saldo: ${money(totalR - totalD)}</div>`;
}

function groupByCategory(list) {
  const r = {};
  list.forEach(f => { r[f.category] = (r[f.category] || 0) + Number(f.amount || 0); });
  return r;
}

function initAnoSelects() {
  const ano = new Date().getFullYear();
  const anos = [ano - 1, ano, ano + 1].map(a => `<option value="${a}" ${a === ano ? 'selected' : ''}>${a}</option>`).join('');
  ['dreAno', 'fluxoAno'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = anos; });
  const mes = new Date().getMonth();
  ['dreMes', 'fluxoMes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = mes; });
}

/* ─── SELECTS / HYDRATE ───────────────────────────────────── */
function hydrateSelects() {
  const { stores = [], products = [] } = state.data.bootstrap || {};
  const selIds = ['cashOpenStore','cashCloseStore','entryStore','saleStore','serviceStore','transferFromStore','transferToStore','customerStore','expenseStore','incomeStore','sellerStore','employeeStore','imeiFilterStore','relLoja'];
  selIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const blank = ['relLoja','imeiFilterStore'].includes(id);
    fillSelect(el, stores, 'name', 'id', blank, blank ? 'Todas as lojas' : 'Selecione');
  });
  const prodIds = ['entryProduct','saleProduct','serviceProduct','transferProduct','imeiFilterProduct'];
  prodIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    fillSelect(el, products, 'name', 'id', true, 'Selecione produto');
  });

  const gsf = document.getElementById('globalStoreFilter');
  if (gsf && gsf.children.length === 0) {
    gsf.innerHTML = `<option value="ALL" selected>Todas as lojas</option>` + stores.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  }
}

async function hydrateSellers() {
  const storeId = document.getElementById('saleStore')?.value;
  const sellers = (state.data.bootstrap?.sellers || []).filter(x => String(x.store_id) === String(storeId));
  fillSelect(document.getElementById('saleSeller'), sellers, 'name', 'name', true, 'Selecione vendedor');
}

function updateSalePrice() {
  const prodId = document.getElementById('saleProduct')?.value;
  const p = (state.data.bootstrap?.products || []).find(x => String(x.id) === String(prodId));
  if (p && document.getElementById('salePrice')) document.getElementById('salePrice').value = p.price;
}

async function updateAvailableImeis(mode) {
  const imeis = state.allImeis || [];
  const map = { sale: ['saleStore','saleProduct','saleImei'], service: ['serviceStore','serviceProduct','serviceImei'], transfer: ['transferFromStore','transferProduct','transferImei'] };
  const [storeEl, prodEl, imeiEl] = (map[mode] || []).map(id => document.getElementById(id));
  if (!storeEl || !prodEl || !imeiEl) return;
  const storeId = storeEl.value;
  const prodId = prodEl.value;
  const filtered = imeis.filter(x => x.status === 'AVAILABLE' && (!storeId || String(x.store_id) === String(storeId)) && (!prodId || String(x.product_id) === String(prodId)));
  imeiEl.innerHTML = `<option value="">Selecione IMEI</option>` + filtered.map(x => `<option value="${x.imei}">${x.imei}</option>`).join('');
}

function applyBarcode(mode, barcodeId) {
  const code = document.getElementById(barcodeId)?.value;
  if (!code) return;
  const p = (state.data.bootstrap?.products || []).find(x => String(x.barcode || '') === String(code.trim()));
  if (!p) { toast('Produto não encontrado para este barcode.', false); return; }
  const prodEl = document.getElementById(mode === 'entry' ? 'entryProduct' : 'saleProduct');
  if (prodEl) { prodEl.value = p.id; prodEl.dispatchEvent(new Event('change')); }
  if (mode === 'sale') updateSalePrice();
}

/* ─── LOAD ────────────────────────────────────────────────── */
async function loadImeisByFilters() {
  const store_id = document.getElementById('imeiFilterStore')?.value;
  const product_id = document.getElementById('imeiFilterProduct')?.value;
  const status = document.getElementById('imeiFilterStatus')?.value;
  const barcode = document.getElementById('imeiFilterBarcode')?.value;
  const params = new URLSearchParams();
  if (store_id) params.append('store_id', store_id);
  if (product_id) params.append('product_id', product_id);
  if (status) params.append('status', status);
  if (barcode) params.append('barcode', barcode);
  try {
    const list = await api.get(`/api/imeis?${params}`);
    state.allImeis = list;
    renderImeis(list);
  } catch (err) { toast(err.message, false); }
}

async function refreshAll(withToast = true) {
  try {
    const [bootstrap, moves, serviceMoves, transfers, cash, finance, customers, employees, imeis, sales] = await Promise.all([
      api.get('/api/bootstrap'),
      api.get('/api/movements'),
      api.get('/api/service-moves'),
      api.get('/api/transfers'),
      api.get('/api/cash'),
      api.get('/api/finance'),
      api.get('/api/customers'),
      api.get('/api/employees'),
      api.get('/api/imeis'),
      api.get('/api/sales'),
    ]);

    state.data.bootstrap = bootstrap;
    state.allSales     = sales;
    state.allFinance   = finance.entries || [];
    state.allCustomers = customers;
    state.allImeis     = imeis;

    const storeFilteredCustomers = storeFilterList(customers);
    const storeFilteredMoves     = storeFilterList(moves);
    const storeFilteredService   = storeFilterList(serviceMoves);
    const storeFilteredFinance   = storeFilterList(finance.entries || []);
    const storeFilteredNotes     = { entries: storeFilterList((await api.get('/api/notes')).entries), exits: storeFilterList((await api.get('/api/notes')).exits) };
    const storeFilteredCash      = storeFilterList(cash);
    const storeFilteredEmployees = storeFilterList(employees);
    const storeFilteredImeis     = storeFilterList(imeis);
    const storeFilteredTransfers = transfers.filter(t => getSelectedStoreIds().includes('ALL') || getSelectedStoreIds().includes(String(t.from_store_id)) || getSelectedStoreIds().includes(String(t.to_store_id)));

    const users = await api.get('/api/users').catch(() => []);

    renderCards(bootstrap.cards);
    renderStockSummary(bootstrap.stockSummary);
    renderRankings(bootstrap.rankings);
    renderCustomers(storeFilteredCustomers);
    renderMoves(storeFilteredMoves);
    renderService(storeFilteredService);
    renderFinance({ entries: storeFilteredFinance, summary: finance.summary });
    renderNotes(storeFilteredNotes);
    renderCash(storeFilteredCash);
    renderEmployees(storeFilteredEmployees);
    renderImeis(storeFilteredImeis);
    renderTransfers(storeFilteredTransfers);
    renderVendas(storeFilterList(sales));
    renderUsers(users);
    renderSellerList(bootstrap.sellers || []);
    hydrateSelects();
    renderCharts();

    if (withToast) toast('Painel atualizado.');
  } catch (err) {
    console.error(err);
    if (err.message === 'Não autenticado.') logout();
  }
}

/* ─── SSE ─────────────────────────────────────────────────── */
function startSSE() {
  if (state.sse) state.sse.close();
  state.sse = new EventSource('/api/events');
  state.sse.onmessage = async ev => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type !== 'connected') { await refreshAll(false); toast(`Atualização: ${msg.type}`); }
    } catch {}
  };
  state.sse.onopen = () => { const b = document.getElementById('liveBadge'); if (b) b.innerHTML = '<span class="dot"></span> Tempo real'; };
  state.sse.onerror = () => { const b = document.getElementById('liveBadge'); if (b) b.textContent = '⚠ Reconectando'; };
}

/* ─── RENDER XML ──────────────────────────────────────────── */
function renderXmlPreview(data) {
  state.xmlParsed = data;
  const box = document.getElementById('xmlPreview');
  if (!box) return;
  box.classList.remove('hidden');
  document.getElementById('xmlSupplier').textContent = data.supplier_name || '-';
  document.getElementById('xmlNoteNumber').textContent = data.note_number || '-';
  document.getElementById('xmlIssueDate').textContent = data.issue_date || '-';
  document.querySelector('#xmlItemsTable tbody').innerHTML = (data.items || []).map(item =>
    `<tr><td>${item.code || ''}</td><td>${item.barcode || ''}</td><td>${item.name || ''}</td><td>${item.quantity || 0}</td><td>${money(item.unit_price)}</td><td>${money(item.total)}</td></tr>`).join('');
}

function applyXmlToEntryForm() {
  if (!state.xmlParsed) return;
  const form = document.getElementById('entryForm');
  if (!form) return;
  form.querySelector('input[name="supplier_name"]').value = state.xmlParsed.supplier_name || '';
  form.querySelector('input[name="note_number"]').value = state.xmlParsed.note_number || '';
  const first = (state.xmlParsed.items || [])[0];
  if (first) {
    const barcodeField = document.getElementById('entryBarcode');
    if (barcodeField && first.barcode) { barcodeField.value = first.barcode; barcodeField.dispatchEvent(new Event('change')); }
    else {
      const p = (state.data.bootstrap?.products || []).find(prod => prod.name?.toLowerCase() === first.name?.toLowerCase());
      if (p) document.getElementById('entryProduct').value = p.id;
    }
  }
  toast('Dados do XML aplicados no formulário.');
}

/* ─── BIND ────────────────────────────────────────────────── */
function bind() {
  bindTabs();

  document.getElementById('loginForm').addEventListener('submit', login);
  document.getElementById('logoutBtn').addEventListener('click', logout);

  // Filtro global de loja
  document.getElementById('globalStoreFilter')?.addEventListener('change', async () => {
    const vals = Array.from(document.getElementById('globalStoreFilter').selectedOptions).map(o => o.value);
    if (vals.includes('ALL')) Array.from(document.getElementById('globalStoreFilter').options).forEach(o => o.selected = o.value === 'ALL');
    await refreshAll(false);
  });

  // Busca global
  document.getElementById('globalSearch')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.toLowerCase().trim();
    const map = { dashboard:['dashboard','resumo'], vendas:['venda','pdv','vend'], caixa:['caixa'], entrada:['entrada','nota','xml','nf'], clientes:['cliente'], assistencia:['assistencia','reembalo'], transferencia:['transferencia'], estoque:['estoque','imei'], financeiro:['financeiro','despesa','receita'], relatorios:['relatorio','dre','fluxo'], funcionarios:['funcionario','vendedor'], notas:['nota'], cadastros:['cadastro','usuario'] };
    const found = Object.entries(map).find(([, arr]) => arr.some(v => q.includes(v)));
    if (found) document.querySelector(`[data-tab="${found[0]}"]`)?.click();
  });

  // Vendas
  document.getElementById('saleStore')?.addEventListener('change', async () => { await hydrateSellers(); await updateAvailableImeis('sale'); });
  document.getElementById('saleProduct')?.addEventListener('change', async () => { updateSalePrice(); await updateAvailableImeis('sale'); });
  document.getElementById('saleBarcode')?.addEventListener('change', () => applyBarcode('sale', 'saleBarcode'));
  document.getElementById('filtrarVendasBtn')?.addEventListener('click', () => {
    const inicio = document.getElementById('vendaDataInicio').value;
    const fim = document.getElementById('vendaDataFim').value;
    let list = storeFilterList(state.allSales);
    if (inicio) list = list.filter(s => (s.created_at || '') >= inicio);
    if (fim)    list = list.filter(s => (s.created_at || '') <= fim + ' 23:59:59');
    renderVendas(list);
  });
  document.getElementById('exportVendasBtn')?.addEventListener('click', () => {
    exportCSV('vendas.csv', ['Data','Loja','Produto','IMEI','Vendedor','Cliente','Pagamento','Valor'],
      state.allSales.map(r => [fmt(r.created_at), r.store_name, r.product_name, r.imei, r.seller_name, r.customer_name || '', r.payment_method, r.sale_price]));
  });

  // Service / Transfer
  document.getElementById('serviceStore')?.addEventListener('change', () => updateAvailableImeis('service'));
  document.getElementById('serviceProduct')?.addEventListener('change', () => updateAvailableImeis('service'));
  document.getElementById('transferFromStore')?.addEventListener('change', () => updateAvailableImeis('transfer'));
  document.getElementById('transferProduct')?.addEventListener('change', () => updateAvailableImeis('transfer'));

  // Estoque
  document.getElementById('reloadImeis')?.addEventListener('click', loadImeisByFilters);
  document.getElementById('imeiFilterStore')?.addEventListener('change', loadImeisByFilters);
  document.getElementById('imeiFilterProduct')?.addEventListener('change', loadImeisByFilters);
  document.getElementById('imeiFilterStatus')?.addEventListener('change', loadImeisByFilters);
  document.getElementById('exportEstoqueBtn')?.addEventListener('click', () => {
    exportCSV('estoque.csv', ['Loja','Produto','IMEI','Status','Documento','Obs','Atualizado'],
      state.allImeis.map(r => [r.store_name, r.product_name, r.imei, r.status, r.last_document || '', r.location_note || '', fmt(r.updated_at)]));
  });

  // Barcode entrada
  document.getElementById('entryBarcode')?.addEventListener('change', () => applyBarcode('entry', 'entryBarcode'));

  // Clientes busca
  document.getElementById('clienteSearch')?.addEventListener('input', () => renderCustomers(storeFilterList(state.allCustomers)));
  document.getElementById('exportClientesBtn')?.addEventListener('click', () => {
    exportCSV('clientes.csv', ['Data','Loja','Nome','CPF','Telefone','Origem'],
      state.allCustomers.map(r => [fmt(r.created_at), r.store_name, r.name, r.cpf || '', r.phone || '', r.origin_app ? 'App' : 'Dashboard']));
  });

  // Financeiro export
  document.getElementById('exportFinanceBtn')?.addEventListener('click', () => {
    exportCSV('financeiro.csv', ['Data','Loja','Tipo','Categoria','Descricao','Vencimento','Status','Valor'],
      state.allFinance.map(r => [fmt(r.created_at), r.store_name || '', r.entry_type, r.category, r.description, r.due_date || '', r.status, r.amount]));
  });

  // Relatórios
  document.getElementById('gerarRelVendas')?.addEventListener('click', gerarRelatorioVendas);
  document.getElementById('exportRelVendasBtn')?.addEventListener('click', () => {
    const inicio = document.getElementById('relDataInicio').value;
    const fim = document.getElementById('relDataFim').value;
    let list = state.allSales || [];
    if (inicio) list = list.filter(s => (s.created_at || '') >= inicio);
    if (fim)    list = list.filter(s => (s.created_at || '') <= fim + ' 23:59:59');
    exportCSV('relatorio_vendas.csv', ['Data','Loja','Produto','IMEI','Vendedor','Cliente','Pagamento','Valor'],
      list.map(r => [fmt(r.created_at), r.store_name, r.product_name, r.imei, r.seller_name, r.customer_name || '', r.payment_method, r.sale_price]));
  });
  document.getElementById('gerarDRE')?.addEventListener('click', gerarDRE);
  document.getElementById('gerarFluxo')?.addEventListener('click', gerarFluxoCaixa);

  // Rel loja filter hydrate (done in hydrateSelects)

  // FORMS
  document.getElementById('cashOpenForm')?.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/cash/open', { store_id: Number(d.store_id), opening_amount: Number(d.opening_amount || 0) }); e.target.reset(); toast('Caixa aberto.'); } catch (err) { toast(err.message, false); } });
  document.getElementById('cashCloseForm')?.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/cash/close', { store_id: Number(d.store_id), closing_amount: Number(d.closing_amount || 0) }); e.target.reset(); toast('Caixa fechado.'); } catch (err) { toast(err.message, false); } });
  document.getElementById('entryForm')?.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); const imeis = (d.imeis || '').split('\n').map(x => x.trim()).filter(Boolean); try { await api.post('/api/note-entry', { store_id: Number(d.store_id), supplier_name: d.supplier_name, note_number: d.note_number, product_id: Number(d.product_id), imeis, notes: d.notes }); e.target.reset(); toast(`${imeis.length} IMEIs registrados.`); } catch (err) { toast(err.message, false); } });
  document.getElementById('saleForm')?.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/sell', { store_id: Number(d.store_id), product_id: Number(d.product_id), imei: d.imei, seller_name: d.seller_name, customer_name: d.customer_name, payment_method: d.payment_method, sale_price: Number(d.sale_price) }); e.target.reset(); toast('Venda registrada!'); } catch (err) { toast(err.message, false); } });
  document.getElementById('serviceOutForm')?.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/service-move', { store_id: Number(d.store_id), product_id: Number(d.product_id), imei: d.imei, move_type: d.move_type, destination_name: d.destination_name, notes: d.notes }); e.target.reset(); toast('Saída registrada.'); } catch (err) { toast(err.message, false); } });
  document.getElementById('serviceReturnForm')?.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/service-return', d); e.target.reset(); toast('IMEI devolvido ao estoque.'); } catch (err) { toast(err.message, false); } });
  document.getElementById('transferForm')?.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/transfer', { from_store_id: Number(d.from_store_id), to_store_id: Number(d.to_store_id), product_id: Number(d.product_id), imei: d.imei, notes: d.notes }); e.target.reset(); toast('Transferência realizada.'); } catch (err) { toast(err.message, false); } });
  document.getElementById('expenseForm')?.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/finance-expense', { store_id: d.store_id ? Number(d.store_id) : null, category: d.category, description: d.description, amount: Number(d.amount), due_date: d.due_date, status: d.status }); e.target.reset(); toast('Despesa registrada.'); } catch (err) { toast(err.message, false); } });
  document.getElementById('incomeForm')?.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/finance-income', { store_id: d.store_id ? Number(d.store_id) : null, category: d.category, description: d.description, amount: Number(d.amount), due_date: d.due_date, status: d.status }); e.target.reset(); toast('Receita registrada.'); } catch (err) { toast(err.message, false); } });
  document.getElementById('customerForm')?.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/customers', { name: d.name, cpf: d.cpf, phone: d.phone, store_id: Number(d.store_id), origin_app: false }); e.target.reset(); toast('Cliente cadastrado.'); } catch (err) { toast(err.message, false); } });
  document.getElementById('employeeForm')?.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/employees', { name: d.name, role_name: d.role_name, store_id: Number(d.store_id) }); e.target.reset(); toast('Funcionário cadastrado.'); } catch (err) { toast(err.message, false); } });
  document.getElementById('userForm')?.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/users', d); e.target.reset(); toast('Usuário criado.'); } catch (err) { toast(err.message, false); } });
  document.getElementById('sellerForm')?.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { await api.post('/api/sellers', { store_id: Number(d.store_id), name: d.name }); e.target.reset(); toast('Vendedor criado.'); } catch (err) { toast(err.message, false); } });
  document.getElementById('xmlParseForm')?.addEventListener('submit', async e => { e.preventDefault(); const d = formJson(e.target); try { const parsed = await api.post('/api/nfe/parse', { xml: d.xml }); renderXmlPreview(parsed); toast('XML lido com sucesso.'); } catch (err) { toast(err.message, false); } });
  document.getElementById('applyXmlToEntry')?.addEventListener('click', applyXmlToEntryForm);
}

/* ─── BOOT ────────────────────────────────────────────────── */
async function boot() {
  document.querySelectorAll('.tab-panel').forEach(p => { p.style.display = p.id === 'dashboard' ? 'block' : 'none'; });
  setViewMeta('dashboard');
  initAnoSelects();
  bind();
  if (state.token && state.user) {
    showApp(); startSSE();
    try { await refreshAll(false); } catch (_) { logout(); }
  } else {
    showLogin();
  }
}

boot();
