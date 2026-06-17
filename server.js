require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'JRS_CHAVE_SUPER_FORTE_2026s';
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const sseClients = [];

function loadDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function nextId(arr) {
  return arr.length ? Math.max(...arr.map(x => x.id || 0)) + 1 : 1;
}

function now() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function broadcast(event, data) {
  const msg = `data: ${JSON.stringify({ event, data })}\n\n`;
  sseClients.forEach(res => res.write(msg));
}

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'Token ausente' });
  try {
    req.user = jwt.verify(h.replace('Bearer ', ''), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

// ======================== AUTH ========================

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = loadDb();
  const user = db.users.find(u => u.username === username && u.password === password && u.active);
  if (!user) return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

// ======================== BOOTSTRAP ========================

app.get('/api/bootstrap', auth, (req, res) => {
  const db = loadDb();
  res.json({
    stores: db.stores.filter(s => s.active),
    products: db.products.filter(p => p.active),
    sellers: db.sellers.filter(s => s.active),
    customers: db.customers || [],
    suppliers: db.suppliers || [],
    finance_categories: db.finance_categories || [],
    employees: db.employees || [],
  });
});

// ======================== STORES ========================

app.get('/api/stores', auth, (req, res) => {
  const db = loadDb();
  res.json(db.stores);
});

app.post('/api/stores', auth, (req, res) => {
  const db = loadDb();
  const store = { id: nextId(db.stores), active: 1, ...req.body };
  db.stores.push(store);
  saveDb(db);
  res.json(store);
});

app.put('/api/stores/:id', auth, (req, res) => {
  const db = loadDb();
  const idx = db.stores.findIndex(s => s.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Loja não encontrada' });
  db.stores[idx] = { ...db.stores[idx], ...req.body };
  saveDb(db);
  res.json(db.stores[idx]);
});

// ======================== PRODUCTS ========================

app.get('/api/products', auth, (req, res) => {
  const db = loadDb();
  res.json(db.products);
});

app.post('/api/products', auth, (req, res) => {
  const db = loadDb();
  const product = { id: nextId(db.products), active: 1, ...req.body };
  db.products.push(product);
  saveDb(db);
  broadcast('products_updated', {});
  res.json(product);
});

app.put('/api/products/:id', auth, (req, res) => {
  const db = loadDb();
  const idx = db.products.findIndex(p => p.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado' });
  db.products[idx] = { ...db.products[idx], ...req.body };
  saveDb(db);
  broadcast('products_updated', {});
  res.json(db.products[idx]);
});

app.delete('/api/products/:id', auth, (req, res) => {
  const db = loadDb();
  const idx = db.products.findIndex(p => p.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Produto não encontrado' });
  db.products[idx].active = 0;
  saveDb(db);
  res.json({ ok: true });
});

// ======================== SUPPLIERS ========================

app.get('/api/suppliers', auth, (req, res) => {
  const db = loadDb();
  res.json(db.suppliers || []);
});

app.post('/api/suppliers', auth, (req, res) => {
  const db = loadDb();
  if (!db.suppliers) db.suppliers = [];
  const supplier = { id: nextId(db.suppliers), active: 1, created_at: now(), ...req.body };
  db.suppliers.push(supplier);
  saveDb(db);
  res.json(supplier);
});

app.put('/api/suppliers/:id', auth, (req, res) => {
  const db = loadDb();
  const idx = (db.suppliers || []).findIndex(s => s.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Fornecedor não encontrado' });
  db.suppliers[idx] = { ...db.suppliers[idx], ...req.body };
  saveDb(db);
  res.json(db.suppliers[idx]);
});

app.delete('/api/suppliers/:id', auth, (req, res) => {
  const db = loadDb();
  const idx = (db.suppliers || []).findIndex(s => s.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Fornecedor não encontrado' });
  db.suppliers[idx].active = 0;
  saveDb(db);
  res.json({ ok: true });
});

// ======================== SELLERS ========================

app.get('/api/sellers', auth, (req, res) => {
  const db = loadDb();
  res.json(db.sellers.filter(s => s.active));
});

app.post('/api/sellers', auth, (req, res) => {
  const db = loadDb();
  const seller = { id: nextId(db.sellers), active: 1, ...req.body };
  db.sellers.push(seller);
  saveDb(db);
  res.json(seller);
});

app.put('/api/sellers/:id', auth, (req, res) => {
  const db = loadDb();
  const idx = db.sellers.findIndex(s => s.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Vendedor não encontrado' });
  db.sellers[idx] = { ...db.sellers[idx], ...req.body };
  saveDb(db);
  res.json(db.sellers[idx]);
});

// ======================== CUSTOMERS ========================

app.get('/api/customers', auth, (req, res) => {
  const db = loadDb();
  res.json(db.customers || []);
});

app.post('/api/customers', auth, (req, res) => {
  const db = loadDb();
  if (!db.customers) db.customers = [];
  const customer = { id: nextId(db.customers), created_at: now(), ...req.body };
  db.customers.push(customer);
  saveDb(db);
  res.json(customer);
});

app.put('/api/customers/:id', auth, (req, res) => {
  const db = loadDb();
  const idx = (db.customers || []).findIndex(c => c.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Cliente não encontrado' });
  db.customers[idx] = { ...db.customers[idx], ...req.body };
  saveDb(db);
  res.json(db.customers[idx]);
});

// ======================== IMEI ========================

app.get('/api/imeis', auth, (req, res) => {
  const db = loadDb();
  const { store_id, product_id, status } = req.query;
  let units = db.imei_units || [];
  if (store_id) units = units.filter(u => u.store_id === Number(store_id));
  if (product_id) units = units.filter(u => u.product_id === Number(product_id));
  if (status) units = units.filter(u => u.status === status);
  res.json(units);
});

app.post('/api/imeis', auth, (req, res) => {
  const db = loadDb();
  if (!db.imei_units) db.imei_units = [];

  const { imeis, store_id, product_id, note_entry_id, color, storage, unit_cost } = req.body;
  const imeiList = Array.isArray(imeis) ? imeis : [imeis];
  const added = [];
  const duplicates = [];

  for (const imei of imeiList) {
    const trimmed = String(imei).trim();
    if (!trimmed) continue;
    if (db.imei_units.find(u => u.imei === trimmed)) {
      duplicates.push(trimmed);
      continue;
    }
    const unit = {
      id: nextId(db.imei_units),
      imei: trimmed,
      store_id: Number(store_id),
      product_id: Number(product_id),
      note_entry_id: note_entry_id || null,
      color: color || '',
      storage: storage || '',
      unit_cost: Number(unit_cost || 0),
      status: 'AVAILABLE',
      created_at: now(),
    };
    db.imei_units.push(unit);
    added.push(unit);
  }

  saveDb(db);
  broadcast('stock_updated', { store_id, product_id });
  res.json({ added: added.length, duplicates: duplicates.length, units: added });
});

app.get('/api/stock', auth, (req, res) => {
  const db = loadDb();
  const { store_id } = req.query;
  const units = db.imei_units || [];
  const result = {};
  for (const p of db.products) {
    let storeUnits = units.filter(u => u.product_id === p.id && u.status === 'AVAILABLE');
    if (store_id) storeUnits = storeUnits.filter(u => u.store_id === Number(store_id));
    result[p.id] = {
      product_id: p.id,
      product_name: p.name,
      quantity: storeUnits.length,
      by_store: {},
    };
    for (const u of storeUnits) {
      if (!result[p.id].by_store[u.store_id]) result[p.id].by_store[u.store_id] = 0;
      result[p.id].by_store[u.store_id]++;
    }
  }
  res.json(Object.values(result));
});

// ======================== SALES (PDV) ========================

app.post('/api/sell', auth, (req, res) => {
  const { imei, product_id, store_id, seller_id, customer_id, price, payment_method, installments, down_payment, notes } = req.body;
  if (!imei || !product_id || !store_id || !price) {
    return res.status(400).json({ error: 'Campos obrigatórios: imei, product_id, store_id, price' });
  }

  const db = loadDb();
  const unit = (db.imei_units || []).find(u => u.imei === imei && u.store_id === Number(store_id) && u.status === 'AVAILABLE');
  if (!unit) return res.status(400).json({ error: 'IMEI não encontrado ou indisponível nesta loja' });

  const product = db.products.find(p => p.id === Number(product_id));
  const seller = db.sellers.find(s => s.id === Number(seller_id));

  unit.status = 'SOLD';
  unit.sold_at = now();
  unit.sold_price = Number(price);

  const sale = {
    id: nextId(db.sales),
    imei,
    product_id: Number(product_id),
    product_name: product ? product.name : '',
    store_id: Number(store_id),
    seller_id: seller_id ? Number(seller_id) : null,
    seller_name: seller ? seller.name : '',
    customer_id: customer_id ? Number(customer_id) : null,
    price: Number(price),
    payment_method: payment_method || 'DINHEIRO',
    installments: installments ? Number(installments) : 1,
    down_payment: down_payment ? Number(down_payment) : 0,
    notes: notes || '',
    status: 'COMPLETED',
    created_at: now(),
  };
  db.sales.push(sale);

  if (!db.finance_entries) db.finance_entries = [];
  db.finance_entries.push({
    id: nextId(db.finance_entries),
    type: 'INCOME',
    category_id: 1,
    description: `Venda ${product ? product.name : ''} IMEI ${imei}`,
    value: Number(price),
    store_id: Number(store_id),
    sale_id: sale.id,
    date: now().substring(0, 10),
    created_at: now(),
  });

  saveDb(db);
  broadcast('sale_completed', { sale });
  res.json({ ok: true, sale });
});

app.get('/api/sales', auth, (req, res) => {
  const db = loadDb();
  const { store_id, start, end } = req.query;
  let sales = db.sales || [];
  if (store_id) sales = sales.filter(s => s.store_id === Number(store_id));
  if (start) sales = sales.filter(s => s.created_at >= start);
  if (end) sales = sales.filter(s => s.created_at <= end + ' 23:59:59');
  res.json(sales);
});

// ======================== NOTE ENTRY (Entrada de Nota) ========================

app.post('/api/note-entry', auth, (req, res) => {
  const { store_id, supplier_id, nota_number, nota_key, items, total_value, notes } = req.body;
  if (!store_id || !items || !items.length) {
    return res.status(400).json({ error: 'Campos obrigatórios: store_id, items' });
  }

  const db = loadDb();
  if (!db.note_entries) db.note_entries = [];
  if (!db.imei_units) db.imei_units = [];

  const entry = {
    id: nextId(db.note_entries),
    store_id: Number(store_id),
    supplier_id: supplier_id ? Number(supplier_id) : null,
    nota_number: nota_number || '',
    nota_key: nota_key || '',
    total_value: Number(total_value || 0),
    notes: notes || '',
    status: 'RECEIVED',
    created_at: now(),
    items: [],
  };

  let totalAdded = 0;
  for (const item of items) {
    const { product_id, imeis, color, storage, unit_cost } = item;
    const imeiList = Array.isArray(imeis) ? imeis : (imeis || '').split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);
    const added = [];
    for (const imei of imeiList) {
      if (!imei) continue;
      if (db.imei_units.find(u => u.imei === imei)) continue;
      const unit = {
        id: nextId(db.imei_units),
        imei,
        store_id: Number(store_id),
        product_id: Number(product_id),
        note_entry_id: entry.id,
        color: color || '',
        storage: storage || '',
        unit_cost: Number(unit_cost || 0),
        status: 'AVAILABLE',
        created_at: now(),
      };
      db.imei_units.push(unit);
      added.push(imei);
      totalAdded++;
    }
    entry.items.push({ product_id: Number(product_id), qty: added.length, imeis: added, color, storage, unit_cost });
  }

  db.note_entries.push(entry);

  if (!db.finance_entries) db.finance_entries = [];
  db.finance_entries.push({
    id: nextId(db.finance_entries),
    type: 'EXPENSE',
    category_id: 9,
    description: `Entrada Nota ${nota_number || entry.id} - ${totalAdded} aparelhos`,
    value: Number(total_value || 0),
    store_id: Number(store_id),
    note_entry_id: entry.id,
    date: now().substring(0, 10),
    created_at: now(),
  });

  if (total_value && Number(total_value) > 0) {
    if (!db.contas_pagar) db.contas_pagar = [];
    db.contas_pagar.push({
      id: nextId(db.contas_pagar),
      description: `NF ${nota_number || entry.id} - Fornecedor`,
      supplier_id: supplier_id ? Number(supplier_id) : null,
      store_id: Number(store_id),
      value: Number(total_value),
      due_date: '',
      status: 'PENDING',
      note_entry_id: entry.id,
      created_at: now(),
    });
  }

  saveDb(db);
  broadcast('stock_updated', { store_id });
  res.json({ ok: true, entry, imeis_added: totalAdded });
});

app.get('/api/note-entries', auth, (req, res) => {
  const db = loadDb();
  const { store_id } = req.query;
  let entries = db.note_entries || [];
  if (store_id) entries = entries.filter(e => e.store_id === Number(store_id));
  res.json(entries);
});

// ======================== NOTE EXIT ========================

app.post('/api/note-exit', auth, (req, res) => {
  const db = loadDb();
  if (!db.note_exits) db.note_exits = [];
  const exit = { id: nextId(db.note_exits), created_at: now(), status: 'PENDING', ...req.body };
  db.note_exits.push(exit);
  saveDb(db);
  res.json(exit);
});

app.get('/api/note-exits', auth, (req, res) => {
  const db = loadDb();
  const { store_id } = req.query;
  let exits = db.note_exits || [];
  if (store_id) exits = exits.filter(e => e.store_id === Number(store_id));
  res.json(exits);
});

// ======================== NFE CONFIG ========================

app.get('/api/nfe/config', auth, (req, res) => {
  const db = loadDb();
  const { store_id } = req.query;
  const configs = db.nfe_config || [];
  if (store_id) return res.json(configs.find(c => c.store_id === Number(store_id)) || null);
  res.json(configs);
});

app.post('/api/nfe/config', auth, (req, res) => {
  const db = loadDb();
  if (!db.nfe_config) db.nfe_config = [];
  const { store_id } = req.body;
  const idx = db.nfe_config.findIndex(c => c.store_id === Number(store_id));
  if (idx >= 0) {
    db.nfe_config[idx] = { ...db.nfe_config[idx], ...req.body, updated_at: now() };
    saveDb(db);
    return res.json(db.nfe_config[idx]);
  }
  const cfg = { id: nextId(db.nfe_config), created_at: now(), ...req.body };
  db.nfe_config.push(cfg);
  saveDb(db);
  res.json(cfg);
});

// ======================== NFE EMIT ========================

app.post('/api/nfe/emit', auth, async (req, res) => {
  const db = loadDb();
  const { store_id, items, customer, payment_method, total_value, ambiente } = req.body;

  const cfg = (db.nfe_config || []).find(c => c.store_id === Number(store_id));
  if (!cfg) return res.status(400).json({ error: 'Configure os dados fiscais da loja antes de emitir NF-e' });

  if (!db.nfe_emitidas) db.nfe_emitidas = [];
  const lastNfe = db.nfe_emitidas.filter(n => n.store_id === Number(store_id));
  const numero = (Number(cfg.numero_inicial) || 1) + lastNfe.length;

  const nfe = {
    id: nextId(db.nfe_emitidas),
    store_id: Number(store_id),
    numero,
    serie: cfg.serie || '1',
    ambiente: ambiente || cfg.ambiente || 'homologacao',
    status: 'PENDING',
    customer: customer || {},
    items: items || [],
    total_value: Number(total_value || 0),
    payment_method: payment_method || 'DINHEIRO',
    created_at: now(),
    protocol: '',
    chave: '',
    xml: '',
    pdf_url: '',
    error: '',
  };

  if (cfg.focus_token) {
    try {
      const https = require('https');
      const baseUrl = nfe.ambiente === 'producao'
        ? 'https://api.focusnfe.com.br'
        : 'https://homologacao.focusnfe.com.br';

      const refNfe = `${store_id}-${Date.now()}`;
      const payload = buildFocusNfePayload(cfg, nfe, refNfe);
      const payloadStr = JSON.stringify(payload);

      const result = await new Promise((resolve, reject) => {
        const urlObj = new URL(`${baseUrl}/v2/nfe?ref=${refNfe}`);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payloadStr),
            'Authorization': 'Basic ' + Buffer.from(cfg.focus_token + ':').toString('base64'),
          },
        };
        const r = https.request(options, resp => {
          let data = '';
          resp.on('data', chunk => data += chunk);
          resp.on('end', () => {
            try { resolve(JSON.parse(data)); } catch { resolve({ status: 'error', message: data }); }
          });
        });
        r.on('error', reject);
        r.write(payloadStr);
        r.end();
      });

      nfe.status = result.status || 'PROCESSING';
      nfe.chave = result.chave_nfe || '';
      nfe.protocol = result.numero_protocolo || '';
      nfe.pdf_url = result.caminho_danfe || '';
      nfe.focus_ref = refNfe;
    } catch (err) {
      nfe.status = 'ERROR';
      nfe.error = err.message;
    }
  } else {
    nfe.status = 'DRAFT';
    nfe.error = 'Configure o token Focus NFe para emissão automática';
  }

  db.nfe_emitidas.push(nfe);
  saveDb(db);
  broadcast('nfe_emitida', { nfe });
  res.json({ ok: true, nfe });
});

app.get('/api/nfe/emitidas', auth, (req, res) => {
  const db = loadDb();
  const { store_id } = req.query;
  let nfes = db.nfe_emitidas || [];
  if (store_id) nfes = nfes.filter(n => n.store_id === Number(store_id));
  res.json(nfes);
});

function buildFocusNfePayload(cfg, nfe, ref) {
  const itens = (nfe.items || []).map((item, i) => ({
    numero_item: i + 1,
    codigo_produto: String(item.product_id || i + 1),
    descricao: item.product_name || item.description || 'Produto',
    codigo_ncm: item.ncm || '8517120000',
    cfop: item.cfop || '5102',
    unidade_comercial: item.unit || 'UN',
    quantidade_comercial: item.qty || 1,
    valor_unitario_comercial: item.unit_price || item.price || 0,
    valor_unitario_tributavel: item.unit_price || item.price || 0,
    unidade_tributavel: item.unit || 'UN',
    quantidade_tributavel: item.qty || 1,
    codigo_barras_comercial: item.barcode || 'SEM GTIN',
    icms_origem: 0,
    icms_modalidade_determinacao_bc: 3,
    icms_aliquota: 0,
    icms_modalidade_base_calculo: 3,
    pis_modalidade: '07',
    cofins_modalidade: '07',
  }));

  return {
    natureza_operacao: 'VENDA DE MERCADORIA',
    forma_pagamento: 0,
    tipo_documento: 1,
    local_destino: 1,
    codigo_municipio_ocorrencia: cfg.codigo_municipio || '2611606',
    formato_impressao_danfe: 1,
    tipo_emissao: 1,
    finalidade_emissao: 1,
    consumidor_final: 1,
    presenca_comprador: 1,
    emitente: {
      cnpj: (cfg.cnpj || '').replace(/\D/g, ''),
      nome: cfg.razao_social || '',
      nome_fantasia: cfg.nome_fantasia || '',
      logradouro: cfg.logradouro || '',
      numero: cfg.numero || 's/n',
      bairro: cfg.bairro || '',
      codigo_municipio: cfg.codigo_municipio || '2611606',
      municipio: cfg.municipio || '',
      uf: cfg.uf || 'PE',
      cep: (cfg.cep || '').replace(/\D/g, ''),
      codigo_pais: '1058',
      pais: 'Brasil',
      telefone: (cfg.fone || '').replace(/\D/g, ''),
      inscricao_estadual: cfg.ie || '',
      regime_tributario: Number(cfg.crt) || 1,
    },
    destinatario: nfe.customer && (nfe.customer.cpf || nfe.customer.cnpj) ? {
      cpf_cnpj: ((nfe.customer.cpf || nfe.customer.cnpj) || '').replace(/\D/g, ''),
      nome: nfe.customer.name || 'CONSUMIDOR',
      email: nfe.customer.email || '',
      logradouro: nfe.customer.logradouro || '',
      numero: nfe.customer.numero || 's/n',
      bairro: nfe.customer.bairro || '',
      codigo_municipio: nfe.customer.codigo_municipio || cfg.codigo_municipio || '2611606',
      municipio: nfe.customer.municipio || '',
      uf: nfe.customer.uf || cfg.uf || 'PE',
      cep: (nfe.customer.cep || '').replace(/\D/g, ''),
      codigo_pais: '1058',
      pais: 'Brasil',
      indicador_ie_destinatario: 9,
    } : undefined,
    itens,
    pagamentos: [{ forma_pagamento: mapPayment(nfe.payment_method), valor: nfe.total_value }],
    serie: nfe.serie,
    numero: nfe.numero,
    data_emissao: new Date().toISOString().replace('Z', '-03:00'),
    data_entrada_saida: new Date().toISOString().replace('Z', '-03:00'),
  };
}

function mapPayment(method) {
  const m = { 'DINHEIRO': '01', 'PIX': '17', 'CARTAO_CREDITO': '03', 'CARTAO_DEBITO': '04', 'CREDIARIO': '99', 'BOLETO': '15' };
  return m[method] || '99';
}

// ======================== FINANCE ========================

app.get('/api/finance', auth, (req, res) => {
  const db = loadDb();
  const { store_id, type, start, end } = req.query;
  let entries = db.finance_entries || [];
  if (store_id) entries = entries.filter(e => e.store_id === Number(store_id));
  if (type) entries = entries.filter(e => e.type === type);
  if (start) entries = entries.filter(e => e.date >= start);
  if (end) entries = entries.filter(e => e.date <= end);
  res.json(entries);
});

app.post('/api/finance', auth, (req, res) => {
  const db = loadDb();
  if (!db.finance_entries) db.finance_entries = [];
  const entry = { id: nextId(db.finance_entries), date: now().substring(0, 10), created_at: now(), ...req.body };
  db.finance_entries.push(entry);
  saveDb(db);
  broadcast('finance_updated', {});
  res.json(entry);
});

app.post('/api/finance-expense', auth, (req, res) => {
  const db = loadDb();
  if (!db.finance_entries) db.finance_entries = [];
  const entry = { id: nextId(db.finance_entries), type: 'EXPENSE', date: now().substring(0, 10), created_at: now(), ...req.body };
  db.finance_entries.push(entry);
  saveDb(db);
  broadcast('finance_updated', {});
  res.json(entry);
});

app.post('/api/finance-income', auth, (req, res) => {
  const db = loadDb();
  if (!db.finance_entries) db.finance_entries = [];
  const entry = { id: nextId(db.finance_entries), type: 'INCOME', date: now().substring(0, 10), created_at: now(), ...req.body };
  db.finance_entries.push(entry);
  saveDb(db);
  broadcast('finance_updated', {});
  res.json(entry);
});

// ======================== CONTAS A PAGAR ========================

app.get('/api/contas-pagar', auth, (req, res) => {
  const db = loadDb();
  const { store_id, status } = req.query;
  let items = db.contas_pagar || [];
  if (store_id) items = items.filter(i => i.store_id === Number(store_id));
  if (status) items = items.filter(i => i.status === status);
  res.json(items);
});

app.post('/api/contas-pagar', auth, (req, res) => {
  const db = loadDb();
  if (!db.contas_pagar) db.contas_pagar = [];
  const item = { id: nextId(db.contas_pagar), status: 'PENDING', created_at: now(), ...req.body };
  db.contas_pagar.push(item);
  saveDb(db);
  res.json(item);
});

app.patch('/api/contas-pagar/:id', auth, (req, res) => {
  const db = loadDb();
  const idx = (db.contas_pagar || []).findIndex(i => i.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Conta não encontrada' });
  db.contas_pagar[idx] = { ...db.contas_pagar[idx], ...req.body };
  if (req.body.status === 'PAID' && !db.contas_pagar[idx].paid_at) {
    db.contas_pagar[idx].paid_at = now();
    if (!db.finance_entries) db.finance_entries = [];
    db.finance_entries.push({
      id: nextId(db.finance_entries),
      type: 'EXPENSE',
      category_id: db.contas_pagar[idx].category_id || 9,
      description: `Pagamento: ${db.contas_pagar[idx].description}`,
      value: db.contas_pagar[idx].value,
      store_id: db.contas_pagar[idx].store_id,
      date: now().substring(0, 10),
      created_at: now(),
    });
  }
  saveDb(db);
  res.json(db.contas_pagar[idx]);
});

// ======================== CONTAS A RECEBER ========================

app.get('/api/contas-receber', auth, (req, res) => {
  const db = loadDb();
  const { store_id, status } = req.query;
  let items = db.contas_receber || [];
  if (store_id) items = items.filter(i => i.store_id === Number(store_id));
  if (status) items = items.filter(i => i.status === status);
  res.json(items);
});

app.post('/api/contas-receber', auth, (req, res) => {
  const db = loadDb();
  if (!db.contas_receber) db.contas_receber = [];
  const item = { id: nextId(db.contas_receber), status: 'PENDING', created_at: now(), ...req.body };
  db.contas_receber.push(item);
  saveDb(db);
  res.json(item);
});

app.patch('/api/contas-receber/:id', auth, (req, res) => {
  const db = loadDb();
  const idx = (db.contas_receber || []).findIndex(i => i.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Conta não encontrada' });
  db.contas_receber[idx] = { ...db.contas_receber[idx], ...req.body };
  if (req.body.status === 'RECEIVED' && !db.contas_receber[idx].received_at) {
    db.contas_receber[idx].received_at = now();
    if (!db.finance_entries) db.finance_entries = [];
    db.finance_entries.push({
      id: nextId(db.finance_entries),
      type: 'INCOME',
      category_id: db.contas_receber[idx].category_id || 1,
      description: `Recebimento: ${db.contas_receber[idx].description}`,
      value: db.contas_receber[idx].value,
      store_id: db.contas_receber[idx].store_id,
      date: now().substring(0, 10),
      created_at: now(),
    });
  }
  saveDb(db);
  res.json(db.contas_receber[idx]);
});

// ======================== FINANCE CATEGORIES ========================

app.get('/api/finance-categories', auth, (req, res) => {
  const db = loadDb();
  res.json(db.finance_categories || []);
});

app.post('/api/finance-categories', auth, (req, res) => {
  const db = loadDb();
  if (!db.finance_categories) db.finance_categories = [];
  const cat = { id: nextId(db.finance_categories), active: 1, ...req.body };
  db.finance_categories.push(cat);
  saveDb(db);
  res.json(cat);
});

// ======================== MOVEMENTS ========================

app.get('/api/movements', auth, (req, res) => {
  const db = loadDb();
  res.json(db.service_moves || []);
});

app.post('/api/service-move', auth, (req, res) => {
  const { imei, from_store_id, to_store_id, notes } = req.body;
  const db = loadDb();
  const unit = (db.imei_units || []).find(u => u.imei === imei && u.store_id === Number(from_store_id) && u.status === 'AVAILABLE');
  if (!unit) return res.status(400).json({ error: 'IMEI não disponível na loja de origem' });
  unit.store_id = Number(to_store_id);
  const move = {
    id: nextId(db.service_moves || []),
    imei, from_store_id: Number(from_store_id), to_store_id: Number(to_store_id),
    notes: notes || '', type: 'TRANSFER', created_at: now(),
  };
  if (!db.service_moves) db.service_moves = [];
  db.service_moves.push(move);
  saveDb(db);
  broadcast('stock_updated', { from_store_id, to_store_id });
  res.json({ ok: true, move });
});

app.post('/api/service-return', auth, (req, res) => {
  const { imei, store_id, notes } = req.body;
  const db = loadDb();
  const unit = (db.imei_units || []).find(u => u.imei === imei);
  if (!unit) return res.status(400).json({ error: 'IMEI não encontrado' });
  unit.status = 'AVAILABLE';
  unit.store_id = Number(store_id);
  unit.sold_at = null;
  if (!db.service_moves) db.service_moves = [];
  const move = { id: nextId(db.service_moves), imei, to_store_id: Number(store_id), notes: notes || '', type: 'RETURN', created_at: now() };
  db.service_moves.push(move);
  saveDb(db);
  broadcast('stock_updated', { store_id });
  res.json({ ok: true, move });
});

app.post('/api/transfer', auth, (req, res) => {
  const { imei, from_store_id, to_store_id, notes } = req.body;
  const db = loadDb();
  const unit = (db.imei_units || []).find(u => u.imei === imei && u.store_id === Number(from_store_id) && u.status === 'AVAILABLE');
  if (!unit) return res.status(400).json({ error: 'IMEI não disponível na loja de origem' });
  unit.store_id = Number(to_store_id);
  if (!db.service_moves) db.service_moves = [];
  const move = { id: nextId(db.service_moves), imei, from_store_id: Number(from_store_id), to_store_id: Number(to_store_id), notes: notes || '', type: 'TRANSFER', created_at: now() };
  db.service_moves.push(move);
  saveDb(db);
  broadcast('stock_updated', { to_store_id });
  res.json({ ok: true, move });
});

// ======================== CASH ========================

app.post('/api/cash/open', auth, (req, res) => {
  const db = loadDb();
  if (!db.cash_registers) db.cash_registers = [];
  const open = db.cash_registers.find(c => c.store_id === Number(req.body.store_id) && c.status === 'OPEN');
  if (open) return res.json(open);
  const cr = {
    id: nextId(db.cash_registers), store_id: Number(req.body.store_id),
    opened_by: req.user.id, opening_amount: Number(req.body.amount || 0),
    closing_amount: null, opened_at: now(), closed_at: null, status: 'OPEN',
  };
  db.cash_registers.push(cr);
  saveDb(db);
  res.json(cr);
});

app.post('/api/cash/close', auth, (req, res) => {
  const db = loadDb();
  const open = (db.cash_registers || []).find(c => c.store_id === Number(req.body.store_id) && c.status === 'OPEN');
  if (!open) return res.status(400).json({ error: 'Caixa não aberto nesta loja' });
  open.closing_amount = Number(req.body.amount || 0);
  open.closed_at = now();
  open.status = 'CLOSED';
  saveDb(db);
  res.json(open);
});

// ======================== USERS / EMPLOYEES ========================

app.get('/api/users', auth, (req, res) => {
  const db = loadDb();
  res.json(db.users.map(u => ({ ...u, password: undefined })));
});

app.post('/api/users', auth, (req, res) => {
  const db = loadDb();
  const user = { id: nextId(db.users), active: 1, role: 'SELLER', ...req.body };
  db.users.push(user);
  saveDb(db);
  res.json({ ...user, password: undefined });
});

app.get('/api/employees', auth, (req, res) => {
  const db = loadDb();
  res.json(db.employees || []);
});

app.post('/api/employees', auth, (req, res) => {
  const db = loadDb();
  if (!db.employees) db.employees = [];
  const emp = { id: nextId(db.employees), active: 1, created_at: now(), ...req.body };
  db.employees.push(emp);
  saveDb(db);
  res.json(emp);
});

// ======================== NOTES (legacy + XML parse) ========================

app.get('/api/notes', auth, (req, res) => {
  const db = loadDb();
  res.json(db.note_entries || []);
});

app.post('/api/nfe/parse', auth, (req, res) => {
  const { xml } = req.body;
  if (!xml) return res.status(400).json({ error: 'XML obrigatório' });
  try {
    const notaMatch = xml.match(/<nNF>(\d+)<\/nNF>/);
    const chaveMatch = xml.match(/Id="NFe(\d+)"/);
    const fornMatch = xml.match(/<emit>[\s\S]*?<xNome>(.*?)<\/xNome>/);
    const cnpjMatch = xml.match(/<emit>[\s\S]*?<CNPJ>(\d+)<\/CNPJ>/);
    const items = [];
    const detRegex = /<det[^>]*>([\s\S]*?)<\/det>/g;
    let m;
    while ((m = detRegex.exec(xml)) !== null) {
      const det = m[1];
      items.push({
        product_name: (det.match(/<xProd>(.*?)<\/xProd>/) || [])[1] || '',
        ncm: (det.match(/<NCM>(\d+)<\/NCM>/) || [])[1] || '',
        qty: parseFloat((det.match(/<qCom>([\d.]+)<\/qCom>/) || [])[1] || '1'),
        unit_price: parseFloat((det.match(/<vUnCom>([\d.]+)<\/vUnCom>/) || [])[1] || '0'),
        barcode: (det.match(/<cEAN>(\d+)<\/cEAN>/) || [])[1] || '',
      });
    }
    res.json({
      nota_number: notaMatch ? notaMatch[1] : '',
      nota_key: chaveMatch ? chaveMatch[1] : '',
      supplier_name: fornMatch ? fornMatch[1] : '',
      supplier_cnpj: cnpjMatch ? cnpjMatch[1] : '',
      items,
    });
  } catch (e) {
    res.status(400).json({ error: 'Erro ao processar XML: ' + e.message });
  }
});

// ======================== REPORTS ========================

app.get('/api/reports/sales-by-product', auth, (req, res) => {
  const db = loadDb();
  const { store_id, start, end } = req.query;
  let sales = db.sales || [];
  if (store_id) sales = sales.filter(s => s.store_id === Number(store_id));
  if (start) sales = sales.filter(s => s.created_at >= start);
  if (end) sales = sales.filter(s => s.created_at <= end + ' 23:59:59');
  const report = {};
  for (const sale of sales) {
    if (!report[sale.product_id]) report[sale.product_id] = { product_id: sale.product_id, product_name: sale.product_name, qty: 0, total: 0 };
    report[sale.product_id].qty++;
    report[sale.product_id].total += sale.price;
  }
  res.json(Object.values(report).sort((a, b) => b.total - a.total));
});

app.get('/api/reports/sales-by-store', auth, (req, res) => {
  const db = loadDb();
  const { start, end } = req.query;
  let sales = db.sales || [];
  if (start) sales = sales.filter(s => s.created_at >= start);
  if (end) sales = sales.filter(s => s.created_at <= end + ' 23:59:59');
  const report = {};
  for (const sale of sales) {
    const store = db.stores.find(st => st.id === sale.store_id);
    if (!report[sale.store_id]) report[sale.store_id] = { store_id: sale.store_id, store_name: store ? store.name : String(sale.store_id), qty: 0, total: 0 };
    report[sale.store_id].qty++;
    report[sale.store_id].total += sale.price;
  }
  res.json(Object.values(report).sort((a, b) => b.total - a.total));
});

app.get('/api/reports/stock-summary', auth, (req, res) => {
  const db = loadDb();
  const { store_id } = req.query;
  const units = db.imei_units || [];
  const summary = db.products.filter(x => x.active).map(p => {
    let avail = units.filter(u => u.product_id === p.id && u.status === 'AVAILABLE');
    let sold = units.filter(u => u.product_id === p.id && u.status === 'SOLD');
    if (store_id) { avail = avail.filter(u => u.store_id === Number(store_id)); sold = sold.filter(u => u.store_id === Number(store_id)); }
    return { product_id: p.id, product_name: p.name, price: p.price, available: avail.length, sold: sold.length, total: avail.length + sold.length };
  });
  res.json(summary);
});

// ======================== DASHBOARD ========================

app.get('/api/dashboard', auth, (req, res) => {
  const db = loadDb();
  const today = now().substring(0, 10);
  const sales = db.sales || [];
  const todaySales = sales.filter(s => s.created_at.startsWith(today));
  const imeis = db.imei_units || [];

  res.json({
    today_sales: todaySales.length,
    today_revenue: todaySales.reduce((a, s) => a + s.price, 0),
    total_stock: imeis.filter(u => u.status === 'AVAILABLE').length,
    total_imeis: imeis.length,
    contas_pagar_pendente: (db.contas_pagar || []).filter(c => c.status === 'PENDING').reduce((a, c) => a + c.value, 0),
    contas_receber_pendente: (db.contas_receber || []).filter(c => c.status === 'PENDING').reduce((a, c) => a + c.value, 0),
    recent_sales: todaySales.slice(-10).reverse(),
    store_totals: db.stores.map(st => ({
      store_id: st.id,
      store_name: st.name,
      stock: imeis.filter(u => u.store_id === st.id && u.status === 'AVAILABLE').length,
      today_sales: todaySales.filter(s => s.store_id === st.id).length,
    })),
  });
});

// ======================== PEDIDOS ========================

app.get('/api/pedidos', auth, (req, res) => {
  const db = loadDb();
  const { store_id, status } = req.query;
  let items = db.pedidos || [];
  if (store_id) items = items.filter(p => p.store_id === Number(store_id));
  if (status) items = items.filter(p => p.status === status);
  res.json(items);
});

app.post('/api/pedidos', auth, (req, res) => {
  const db = loadDb();
  if (!db.pedidos) db.pedidos = [];
  const { store_id, customer_id, seller_id, items, total_value, tipo, notes } = req.body;
  const pedido = {
    id: nextId(db.pedidos),
    store_id: Number(store_id),
    customer_id: customer_id ? Number(customer_id) : null,
    seller_id: seller_id ? Number(seller_id) : null,
    items: items || [],
    total_value: Number(total_value || 0),
    tipo: tipo || 'NFCE',
    notes: notes || '',
    status: 'PENDENTE',
    created_at: now(),
  };
  db.pedidos.push(pedido);
  saveDb(db);
  broadcast('pedido_novo', { pedido });
  res.json(pedido);
});

// Aprovar / reprovar / faturar pedido
app.patch('/api/pedidos/:id', auth, (req, res) => {
  const db = loadDb();
  const idx = (db.pedidos || []).findIndex(p => p.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Pedido não encontrado' });
  const { status } = req.body;
  const pedido = db.pedidos[idx];

  if (status === 'FATURADO' && pedido.status !== 'FATURADO') {
    // ao faturar, lança receita e contas a receber
    if (!db.finance_entries) db.finance_entries = [];
    db.finance_entries.push({
      id: nextId(db.finance_entries), type: 'INCOME', category_id: 1,
      description: `Faturamento Pedido #${pedido.id}`, value: pedido.total_value,
      store_id: pedido.store_id, pedido_id: pedido.id,
      date: now().substring(0, 10), created_at: now(),
    });
    pedido.faturado_at = now();
  }
  pedido.status = status || pedido.status;
  if (req.body.aprovacao_financeiro !== undefined) pedido.aprovacao_financeiro = req.body.aprovacao_financeiro;
  saveDb(db);
  res.json(pedido);
});

// ======================== CAIXA (abertura/sangria/suprimento/fechamento) ========================

app.get('/api/caixa', auth, (req, res) => {
  const db = loadDb();
  const { store_id } = req.query;
  let regs = db.cash_registers || [];
  if (store_id) regs = regs.filter(c => c.store_id === Number(store_id));
  res.json(regs);
});

app.post('/api/caixa/sangria', auth, (req, res) => {
  const db = loadDb();
  const { store_id, amount, motivo } = req.body;
  const open = (db.cash_registers || []).find(c => c.store_id === Number(store_id) && c.status === 'OPEN');
  if (!open) return res.status(400).json({ error: 'Caixa não aberto nesta loja' });
  if (!open.movements) open.movements = [];
  open.movements.push({ type: 'SANGRIA', amount: Number(amount || 0), motivo: motivo || '', at: now() });
  // lança despesa
  if (!db.finance_entries) db.finance_entries = [];
  db.finance_entries.push({
    id: nextId(db.finance_entries), type: 'EXPENSE', category_id: 12,
    description: `Sangria de caixa${motivo ? ' - ' + motivo : ''}`, value: Number(amount || 0),
    store_id: Number(store_id), date: now().substring(0, 10), created_at: now(),
  });
  saveDb(db);
  res.json(open);
});

app.post('/api/caixa/suprimento', auth, (req, res) => {
  const db = loadDb();
  const { store_id, amount, motivo } = req.body;
  const open = (db.cash_registers || []).find(c => c.store_id === Number(store_id) && c.status === 'OPEN');
  if (!open) return res.status(400).json({ error: 'Caixa não aberto nesta loja' });
  if (!open.movements) open.movements = [];
  open.movements.push({ type: 'SUPRIMENTO', amount: Number(amount || 0), motivo: motivo || '', at: now() });
  saveDb(db);
  res.json(open);
});

// ======================== FLUXO DE CAIXA ========================

app.get('/api/fluxo-caixa', auth, (req, res) => {
  const db = loadDb();
  const { store_id, start, end } = req.query;
  let entries = db.finance_entries || [];
  if (store_id) entries = entries.filter(e => e.store_id === Number(store_id));
  if (start) entries = entries.filter(e => e.date >= start);
  if (end) entries = entries.filter(e => e.date <= end);
  // agrupa por dia
  const byDay = {};
  for (const e of entries) {
    const day = e.date;
    if (!byDay[day]) byDay[day] = { date: day, income: 0, expense: 0 };
    if (e.type === 'INCOME') byDay[day].income += e.value; else byDay[day].expense += e.value;
  }
  const days = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
  let saldo = 0;
  for (const d of days) { d.saldo_dia = d.income - d.expense; saldo += d.saldo_dia; d.saldo_acumulado = saldo; }
  res.json(days);
});

// ======================== INVENTÁRIO ========================

app.post('/api/inventario', auth, (req, res) => {
  const db = loadDb();
  if (!db.inventarios) db.inventarios = [];
  const { store_id, product_id, contagem, observacao } = req.body;
  const units = (db.imei_units || []).filter(u => u.product_id === Number(product_id) && u.store_id === Number(store_id) && u.status === 'AVAILABLE');
  const sistema = units.length;
  const inv = {
    id: nextId(db.inventarios),
    store_id: Number(store_id), product_id: Number(product_id),
    sistema, contagem: Number(contagem || 0),
    divergencia: Number(contagem || 0) - sistema,
    observacao: observacao || '', created_at: now(),
  };
  db.inventarios.push(inv);
  saveDb(db);
  res.json(inv);
});

app.get('/api/inventario', auth, (req, res) => {
  const db = loadDb();
  res.json(db.inventarios || []);
});

// ======================== SAÍDA DE MATERIAL / PRODUTO DEFEITO ========================

app.post('/api/saida-material', auth, (req, res) => {
  const db = loadDb();
  const { imei, motivo, tipo } = req.body; // tipo: DEFEITO | SAIDA
  const unit = (db.imei_units || []).find(u => u.imei === imei && u.status === 'AVAILABLE');
  if (!unit) return res.status(400).json({ error: 'IMEI não disponível' });
  unit.status = tipo === 'DEFEITO' ? 'DEFECTIVE' : 'OUT';
  unit.saida_motivo = motivo || '';
  unit.saida_at = now();
  if (!db.stock_movements) db.stock_movements = [];
  db.stock_movements.push({ id: nextId(db.stock_movements), imei, type: tipo || 'SAIDA', motivo: motivo || '', store_id: unit.store_id, created_at: now() });
  saveDb(db);
  broadcast('stock_updated', { store_id: unit.store_id });
  res.json({ ok: true, unit });
});

app.get('/api/produtos-defeito', auth, (req, res) => {
  const db = loadDb();
  res.json((db.imei_units || []).filter(u => u.status === 'DEFECTIVE'));
});

// ======================== COMPRAS ========================

app.get('/api/compras', auth, (req, res) => {
  const db = loadDb();
  res.json(db.compras || []);
});

app.post('/api/compras', auth, (req, res) => {
  const db = loadDb();
  if (!db.compras) db.compras = [];
  const compra = {
    id: nextId(db.compras),
    status: 'PENDENTE',
    created_at: now(),
    ...req.body,
  };
  db.compras.push(compra);
  saveDb(db);
  res.json(compra);
});

// ======================== CADASTROS GENÉRICOS (espelho RAJ) ========================

// Coleções simples liberadas para CRUD genérico (Cadastrar/Consultar como no RAJ)
const GENERIC_COLLECTIONS = [
  'bancos', 'contas_correntes', 'bandeiras_cartao', 'formas_pagamento',
  'grupos_produto', 'subgrupos_produto', 'unidades_medida',
  'tipos_operacao', 'series_nota', 'cfops', 'regionais', 'metas_lojas',
  // Pedidos
  'motivos_cancelamento', 'motivos_bonificacao',
  // Suprimentos
  'armazens', 'motivos_devolucao',
  // Produtos
  'canais_produto', 'tipos_produto',
  // Frente de Loja
  'motivos_sangria',
  // Marketing
  'cashback', 'cupons', 'promocoes',
  // Fiscal avançado (espelho RAJ)
  'tipos_oneracao', 'tipos_contribuinte', 'anexos_ncm', 'contratos',
];

app.get('/api/coll/:name', auth, (req, res) => {
  const name = req.params.name;
  if (!GENERIC_COLLECTIONS.includes(name)) return res.status(400).json({ error: 'Coleção inválida' });
  const db = loadDb();
  res.json((db[name] || []).filter(x => x.active !== 0));
});

app.post('/api/coll/:name', auth, (req, res) => {
  const name = req.params.name;
  if (!GENERIC_COLLECTIONS.includes(name)) return res.status(400).json({ error: 'Coleção inválida' });
  const db = loadDb();
  if (!db[name]) db[name] = [];
  const item = { id: nextId(db[name]), active: 1, created_at: now(), ...req.body };
  db[name].push(item);
  saveDb(db);
  res.json(item);
});

app.put('/api/coll/:name/:id', auth, (req, res) => {
  const name = req.params.name;
  if (!GENERIC_COLLECTIONS.includes(name)) return res.status(400).json({ error: 'Coleção inválida' });
  const db = loadDb();
  const idx = (db[name] || []).findIndex(x => x.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Registro não encontrado' });
  db[name][idx] = { ...db[name][idx], ...req.body, id: db[name][idx].id };
  saveDb(db);
  res.json(db[name][idx]);
});

app.delete('/api/coll/:name/:id', auth, (req, res) => {
  const name = req.params.name;
  if (!GENERIC_COLLECTIONS.includes(name)) return res.status(400).json({ error: 'Coleção inválida' });
  const db = loadDb();
  const idx = (db[name] || []).findIndex(x => x.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Registro não encontrado' });
  db[name][idx].active = 0;
  saveDb(db);
  res.json({ ok: true });
});

// ======================== PAGAMENTOS (Stone / PIX) ========================

// CRC16-CCITT (0xFFFF) para o BR Code PIX
function crc16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function emv(id, value) {
  return id + String(value.length).padStart(2, '0') + value;
}

// Gera o "copia e cola" PIX (BR Code estático/dinâmico simples)
function buildPixBRCode({ key, amount, name, city, txid }) {
  name = (name || 'JRS PDV').substring(0, 25);
  city = (city || 'RECIFE').substring(0, 15).toUpperCase();
  txid = (txid || '***').substring(0, 25);
  const gui = emv('00', 'br.gov.bcb.pix');
  const chave = emv('01', key);
  const mai = emv('26', gui + chave);
  let payload =
    emv('00', '01') +
    mai +
    emv('52', '0000') +
    emv('53', '986') +
    (amount ? emv('54', Number(amount).toFixed(2)) : '') +
    emv('58', 'BR') +
    emv('59', name) +
    emv('60', city) +
    emv('62', emv('05', txid));
  payload += '6304';
  return payload + crc16(payload);
}

app.get('/api/pay/config', auth, (req, res) => {
  const db = loadDb();
  const { store_id } = req.query;
  const configs = db.pay_config || [];
  if (store_id) return res.json(configs.find(c => c.store_id === Number(store_id)) || null);
  res.json(configs);
});

app.post('/api/pay/config', auth, (req, res) => {
  const db = loadDb();
  if (!db.pay_config) db.pay_config = [];
  const { store_id } = req.body;
  const idx = db.pay_config.findIndex(c => c.store_id === Number(store_id));
  if (idx >= 0) {
    db.pay_config[idx] = { ...db.pay_config[idx], ...req.body, updated_at: now() };
    saveDb(db);
    return res.json(db.pay_config[idx]);
  }
  const cfg = { id: nextId(db.pay_config), created_at: now(), ...req.body };
  db.pay_config.push(cfg);
  saveDb(db);
  res.json(cfg);
});

// Cria a cobrança. PIX => gera BR Code. (Integração Stone real entra aqui via API/webhook.)
app.post('/api/pay/intent', auth, (req, res) => {
  const db = loadDb();
  if (!db.payments) db.payments = [];
  const { store_id, amount, payment_method } = req.body;
  const cfg = (db.pay_config || []).find(c => c.store_id === Number(store_id)) || {};
  const store = db.stores.find(s => s.id === Number(store_id)) || {};

  const payment = {
    id: nextId(db.payments),
    store_id: Number(store_id),
    amount: Number(amount || 0),
    payment_method: payment_method || 'PIX',
    status: 'PENDING',
    provider: cfg.stone_token ? 'STONE' : 'MANUAL',
    created_at: now(),
  };

  if (payment_method === 'PIX') {
    if (!cfg.pix_key) {
      return res.status(400).json({ error: 'Chave PIX não configurada para esta loja' });
    }
    payment.brcode = buildPixBRCode({
      key: cfg.pix_key,
      amount: payment.amount,
      name: cfg.merchant_name || store.name,
      city: cfg.merchant_city || store.cidade,
      txid: 'JRS' + payment.id,
    });
  }

  // PONTO DE INTEGRAÇÃO STONE: se cfg.stone_token existir, criar cobrança via API Stone
  // e usar o QR/brcode retornado por eles; o webhook Stone chamaria /api/pay/webhook.

  db.payments.push(payment);
  saveDb(db);
  res.json(payment);
});

app.get('/api/pay/status/:id', auth, (req, res) => {
  const db = loadDb();
  const p = (db.payments || []).find(x => x.id === Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Pagamento não encontrado' });
  res.json({ id: p.id, status: p.status });
});

app.post('/api/pay/confirm/:id', auth, (req, res) => {
  const db = loadDb();
  const idx = (db.payments || []).findIndex(x => x.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Pagamento não encontrado' });
  db.payments[idx].status = 'PAID';
  db.payments[idx].paid_at = now();
  saveDb(db);
  broadcast('payment_paid', { id: db.payments[idx].id });
  res.json(db.payments[idx]);
});

// Webhook Stone (sem auth — validar assinatura na integração real)
app.post('/api/pay/webhook', (req, res) => {
  const db = loadDb();
  const { txid, status } = req.body || {};
  const id = txid ? Number(String(txid).replace('JRS', '')) : null;
  const idx = (db.payments || []).findIndex(x => x.id === id);
  if (idx >= 0 && (status === 'paid' || status === 'PAID' || status === 'approved')) {
    db.payments[idx].status = 'PAID';
    db.payments[idx].paid_at = now();
    saveDb(db);
    broadcast('payment_paid', { id });
  }
  res.json({ ok: true });
});

// ======================== SSE ========================

app.get('/api/events', auth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('data: {"event":"connected"}\n\n');
  sseClients.push(res);
  req.on('close', () => {
    const i = sseClients.indexOf(res);
    if (i >= 0) sseClients.splice(i, 1);
  });
});

app.listen(PORT, () => console.log(`JRS PDV V9 rodando em http://localhost:${PORT}`));
