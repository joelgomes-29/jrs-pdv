// ==================== JRS PDV MOBILE (PWA) ====================

const S = {
  token: localStorage.getItem('jrs_m_token'),
  user: JSON.parse(localStorage.getItem('jrs_m_user') || 'null'),
  stores: [], products: [], sellers: [],
  stock: [], imeiUnits: [],
  pay: 'DINHEIRO',
  current: null, // unidade IMEI localizada
};

const $ = id => document.getElementById(id);
const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (S.token) opts.headers.Authorization = 'Bearer ' + S.token;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

function toast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), 3000);
}

function show(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(view).classList.add('active');
}

// ==================== AUTH ====================

async function doLogin() {
  const username = $('loginUser').value.trim();
  const password = $('loginPass').value;
  if (!username || !password) return;
  try {
    const d = await api('POST', '/api/login', { username, password });
    S.token = d.token; S.user = d.user;
    localStorage.setItem('jrs_m_token', d.token);
    localStorage.setItem('jrs_m_user', JSON.stringify(d.user));
    $('loginErr').textContent = '';
    initApp();
  } catch (e) {
    $('loginErr').textContent = e.message;
  }
}

function doLogout() {
  localStorage.removeItem('jrs_m_token');
  localStorage.removeItem('jrs_m_user');
  location.reload();
}

$('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

// ==================== INIT ====================

async function initApp() {
  show('vApp');
  try {
    const boot = await api('GET', '/api/bootstrap');
    S.stores = boot.stores || [];
    S.products = boot.products || [];
    S.sellers = boot.sellers || [];
  } catch (e) { toast('Erro ao carregar: ' + e.message, 'error'); return; }

  const sel = $('storeSel');
  sel.innerHTML = S.stores.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  onStoreChange();
}

function onStoreChange() {
  const storeId = Number($('storeSel').value);
  const sellers = S.sellers.filter(s => s.store_id === storeId);
  $('seller').innerHTML = '<option value="">Selecione...</option>' + sellers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  loadStock();
  resetSale();
}

// ==================== TABS ====================

function switchTab(btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  $(btn.dataset.tab).classList.add('active');
  if (btn.dataset.tab === 'scEstoque') loadStock();
  if (btn.dataset.tab === 'scVendas') loadMySales();
}

// ==================== VENDA ====================

function resetSale() {
  $('imei').value = '';
  $('price').value = '';
  $('prodCard').classList.add('hidden');
  $('imeiHint').classList.remove('hidden');
  S.current = null;
  updateTotal();
}

let imeiTimer;
function onImeiInput() {
  clearTimeout(imeiTimer);
  imeiTimer = setTimeout(lookupImei, 350);
}

async function lookupImei() {
  const imei = $('imei').value.trim();
  const storeId = Number($('storeSel').value);
  if (imei.length < 5 || !storeId) { S.current = null; return; }
  try {
    const units = await api('GET', `/api/imeis?store_id=${storeId}&status=AVAILABLE`);
    const unit = units.find(u => u.imei === imei);
    if (unit) {
      const prod = S.products.find(p => p.id === unit.product_id);
      S.current = { unit, prod };
      $('prodName').textContent = prod ? prod.name : 'Produto';
      $('prodColor').textContent = unit.color || '';
      $('prodStorage').textContent = unit.storage || '';
      $('prodPrice').textContent = fmt(prod ? prod.price : 0);
      if (!$('price').value && prod) $('price').value = prod.price;
      $('prodCard').classList.remove('hidden');
      $('imeiHint').classList.add('hidden');
      updateTotal();
    } else {
      S.current = null;
      $('prodCard').classList.add('hidden');
      $('imeiHint').classList.remove('hidden');
      $('imeiHint').textContent = 'IMEI não encontrado disponível nesta loja.';
    }
  } catch (e) { toast(e.message, 'error'); }
}

function scanImei() {
  // Em app nativo isso abriria a câmera/leitor. No PWA, foco no campo.
  $('imei').focus();
  toast('Use o teclado ou um leitor bluetooth para o IMEI');
}

function selectPay(btn) {
  document.querySelectorAll('.pay-opt').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  S.pay = btn.dataset.pay;
}

function updateTotal() {
  $('total').textContent = fmt(Number($('price').value || 0));
}

function startSale() {
  if (!S.current) return toast('Localize um IMEI válido primeiro', 'error');
  const price = Number($('price').value || 0);
  if (price <= 0) return toast('Informe o preço de venda', 'error');
  if (S.pay === 'PIX') openPixModal(price);
  else openConfirmModal(price);
}

// ==================== PAGAMENTO ====================

function closeModal() { $('payModal').classList.add('hidden'); $('payBody').innerHTML = ''; }

function openConfirmModal(price) {
  const labels = { DINHEIRO: 'Dinheiro', CARTAO_CREDITO: 'Cartão de Crédito', CARTAO_DEBITO: 'Cartão de Débito' };
  $('payBody').innerHTML = `
    <div class="pay-title">${labels[S.pay] || S.pay}</div>
    <div class="pay-amount">${fmt(price)}</div>
    ${S.pay !== 'DINHEIRO' ? '<p class="pay-spinner">Passe o cartão na maquininha e confirme abaixo.</p>' : ''}
    <div class="modal-actions">
      <button class="btn btn-success btn-lg" onclick="finishSale()">Confirmar Pagamento</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
    </div>`;
  $('payModal').classList.remove('hidden');
}

async function openPixModal(price) {
  $('payBody').innerHTML = `
    <div class="pay-title">Pagamento PIX</div>
    <div class="pay-amount">${fmt(price)}</div>
    <div class="pay-spinner">Gerando cobrança PIX...</div>`;
  $('payModal').classList.remove('hidden');

  try {
    const intent = await api('POST', '/api/pay/intent', {
      store_id: Number($('storeSel').value),
      amount: price,
      payment_method: 'PIX',
    });
    S.payIntent = intent;
    const code = intent.brcode || '';
    $('payBody').innerHTML = `
      <div class="pay-title">Pague com PIX</div>
      <div class="pay-amount">${fmt(price)}</div>
      ${code ? `<div class="pix-code" id="pixCode">${code}</div>
      <button class="btn btn-ghost btn-block" onclick="copyPix()">Copiar código PIX</button>` :
      `<p class="pay-spinner">Configure a chave PIX em Config no painel para gerar o código.</p>`}
      <div class="modal-actions" style="margin-top:1rem">
        <button class="btn btn-success btn-lg" onclick="finishSale()">Confirmar Recebimento</button>
        <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      </div>`;
    // poll status (webhook Stone marcaria como pago)
    pollPix(intent.id);
  } catch (e) {
    $('payBody').innerHTML = `
      <div class="pay-title">PIX indisponível</div>
      <p class="pay-spinner">${e.message}</p>
      <div class="modal-actions">
        <button class="btn btn-success btn-lg" onclick="finishSale()">Confirmar Recebimento manual</button>
        <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      </div>`;
  }
}

function copyPix() {
  const code = $('pixCode')?.textContent || '';
  if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => toast('Código PIX copiado'));
}

let pixPoll;
function pollPix(id) {
  clearInterval(pixPoll);
  pixPoll = setInterval(async () => {
    try {
      const st = await api('GET', `/api/pay/status/${id}`);
      if (st.status === 'PAID') {
        clearInterval(pixPoll);
        finishSale();
      }
    } catch { }
  }, 4000);
}

async function finishSale() {
  clearInterval(pixPoll);
  const price = Number($('price').value || 0);
  try {
    await api('POST', '/api/sell', {
      imei: S.current.unit.imei,
      product_id: S.current.unit.product_id,
      store_id: Number($('storeSel').value),
      seller_id: $('seller').value ? Number($('seller').value) : null,
      price,
      payment_method: S.pay,
    });
    if (S.payIntent) { api('POST', `/api/pay/confirm/${S.payIntent.id}`, {}).catch(() => {}); S.payIntent = null; }
    closeModal();
    toast('Venda concluída! ' + fmt(price));
    resetSale();
    loadStock();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ==================== ESTOQUE ====================

async function loadStock() {
  const storeId = Number($('storeSel').value);
  try {
    S.stock = await api('GET', `/api/stock?store_id=${storeId}`);
    renderStock();
  } catch (e) { toast(e.message, 'error'); }
}

function renderStock() {
  const q = ($('stockSearch')?.value || '').toLowerCase();
  const list = S.stock.filter(s => s.product_name.toLowerCase().includes(q));
  $('stockList').innerHTML = list.map(s => `
    <div class="stock-item">
      <div><div class="name">${s.product_name}</div><div class="sub">Disponível nesta loja</div></div>
      <span class="qty-badge ${s.quantity === 0 ? 'zero' : ''}">${s.quantity}</span>
    </div>`).join('') || '<p class="hint">Nenhum produto.</p>';
}

// ==================== MINHAS VENDAS ====================

async function loadMySales() {
  const storeId = Number($('storeSel').value);
  try {
    const sales = await api('GET', `/api/sales?store_id=${storeId}`);
    const recent = sales.slice(-20).reverse();
    $('salesList').innerHTML = recent.map(s => `
      <div class="sale-item">
        <div><div class="name">${s.product_name}</div><div class="sub">IMEI ${s.imei} · ${s.created_at?.substring(0,16).replace('T',' ')}</div></div>
        <span class="sale-val">${fmt(s.price)}</span>
      </div>`).join('') || '<p class="hint">Nenhuma venda ainda.</p>';
  } catch (e) { toast(e.message, 'error'); }
}

// ==================== BOOT ====================

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/app/sw.js').catch(() => {});
}

if (S.token && S.user) {
  initApp();
} else {
  show('vLogin');
}
