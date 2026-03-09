
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const xml2js = require('xml2js');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const sessions = new Map();
const sseClients = new Set();

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function loadDb(){ return JSON.parse(fs.readFileSync(DB_FILE,'utf8')); }
function saveDb(db){ fs.writeFileSync(DB_FILE, JSON.stringify(db,null,2),'utf8'); }
function nextId(arr){ return arr.length ? Math.max(...arr.map(x=>x.id||0))+1 : 1; }
function now(){ return new Date().toISOString().slice(0,19).replace('T',' '); }
function emitEvent(type,payload={}){
  const data = `data: ${JSON.stringify({type,payload,ts:new Date().toISOString()})}\n\n`;
  for(const res of sseClients){ try{ res.write(data); }catch(_){} }
}
function auth(req,res,next){
  const token=(req.headers.authorization||'').replace('Bearer ','').trim();
  if(!token || !sessions.has(token)) return res.status(401).json({error:'Não autenticado.'});
  req.user=sessions.get(token); next();
}
function adminOnly(req,res,next){
  if(req.user.role!=='ADMIN') return res.status(403).json({error:'Somente administrador.'});
  next();
}
function cards(db){
  const total_income = db.finance_entries.filter(x=>x.entry_type==='INCOME').reduce((a,b)=>a+Number(b.amount||0),0);
  const total_expense = db.finance_entries.filter(x=>x.entry_type==='EXPENSE').reduce((a,b)=>a+Number(b.amount||0),0);
  return {
    available_units: db.imei_units.filter(x=>x.status==='AVAILABLE').length,
    assistance_units: db.imei_units.filter(x=>x.status==='ASSISTANCE').length,
    repack_units: db.imei_units.filter(x=>x.status==='REPACK').length,
    sold_units: db.imei_units.filter(x=>x.status==='SOLD').length,
    total_income, total_expense, result: total_income-total_expense,
    open_cash: db.cash_registers.filter(x=>x.status==='OPEN').length
  };
}
function stockSummary(db){
  const rows=[];
  db.stores.forEach(s=>{
    db.products.forEach(p=>{
      const units=db.imei_units.filter(x=>x.store_id===s.id && x.product_id===p.id);
      rows.push({
        store_name:s.name, product_name:p.name, price:p.price,
        available_qty:units.filter(x=>x.status==='AVAILABLE').length,
        assistance_qty:units.filter(x=>x.status==='ASSISTANCE').length,
        repack_qty:units.filter(x=>x.status==='REPACK').length,
        sold_qty:units.filter(x=>x.status==='SOLD').length
      });
    });
  });
  return rows.sort((a,b)=>(a.store_name+a.product_name).localeCompare(b.store_name+b.product_name));
}
function rankings(db){
  const sm={}, pm={};
  db.sales.forEach(s=>{
    sm[s.seller_name] ||= {seller_name:s.seller_name,total_sales:0,total_value:0};
    sm[s.seller_name].total_sales += 1; sm[s.seller_name].total_value += Number(s.sale_price||0);
    const p = db.products.find(x=>x.id===s.product_id);
    const key = p ? p.name : `Produto ${s.product_id}`;
    pm[key] ||= {product_name:key,qty:0,total_value:0};
    pm[key].qty += 1; pm[key].total_value += Number(s.sale_price||0);
  });
  return {
    sellers:Object.values(sm).sort((a,b)=>b.total_value-a.total_value).slice(0,10),
    products:Object.values(pm).sort((a,b)=>b.total_value-a.total_value).slice(0,10)
  };
}

function pick(obj, path, fallback=null){
  try{
    return path.split('.').reduce((acc,k)=>acc && acc[k] !== undefined ? acc[k] : undefined, obj) ?? fallback;
  }catch{ return fallback; }
}
function onlyDigits(v){ return String(v || '').replace(/\D/g,''); }
async function parseNFeXmlText(xmlText){
  const parsed = await xml2js.parseStringPromise(xmlText, { explicitArray:false, mergeAttrs:true, trim:true });
  const nfe = parsed?.nfeProc?.NFe || parsed?.NFe || parsed?.procNFe?.NFe || parsed;
  const inf = nfe?.infNFe || nfe?.NFe?.infNFe || nfe;
  const ide = inf?.ide || {};
  const emit = inf?.emit || {};
  let det = inf?.det || [];
  if (!Array.isArray(det)) det = [det];

  const items = det.map(d => {
    const prod = d?.prod || {};
    return {
      code: prod.cProd || '',
      barcode: onlyDigits(prod.cEAN || prod.cEANTrib || ''),
      name: prod.xProd || '',
      ncm: prod.NCM || '',
      cfop: prod.CFOP || '',
      unit: prod.uCom || '',
      quantity: Number(prod.qCom || 0),
      unit_price: Number(prod.vUnCom || 0),
      total: Number(prod.vProd || 0)
    };
  }).filter(x => x.name);

  return {
    supplier_name: emit?.xNome || '',
    supplier_document: onlyDigits(emit?.CNPJ || emit?.CPF || ''),
    note_number: ide?.nNF || '',
    serie: ide?.serie || '',
    issue_date: ide?.dhEmi || ide?.dEmi || '',
    items
  };
}

function mapEnriched(db){
  const storeName=id=>(db.stores.find(x=>x.id===id)||{}).name || '';
  const product=id=>db.products.find(x=>x.id===id)||{};
  return {
    sales: db.sales.map(x=>({...x,store_name:storeName(x.store_id),product_name:product(x.product_id).name||''})).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))),
    moves: db.stock_movements.map(x=>({...x,store_name:storeName(x.store_id),product_name:product(x.product_id).name||''})).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))),
    service_moves: db.service_moves.map(x=>({...x,store_name:storeName(x.store_id),product_name:product(x.product_id).name||''})).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))),
    transfers: db.transfers.map(x=>({...x,from_store_name:storeName(x.from_store_id),to_store_name:storeName(x.to_store_id),product_name:product(x.product_id).name||''})).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))),
    imeis: db.imei_units.map(x=>({...x,store_name:storeName(x.store_id),product_name:product(x.product_id).name||'',price:product(x.product_id).price||0,barcode:product(x.product_id).barcode||''})).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))),
    notes:{
      entries: db.note_entries.map(x=>({...x,store_name:storeName(x.store_id),product_name:product(x.product_id).name||''})).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))),
      exits: db.note_exits.map(x=>({...x,store_name:storeName(x.store_id),product_name:product(x.product_id).name||''})).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))
    },
    cash: db.cash_registers.map(x=>({...x,store_name:storeName(x.store_id)})).sort((a,b)=>b.id-a.id),
    finance: db.finance_entries.map(x=>({...x,store_name:storeName(x.store_id)})).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))),
    sellers: db.sellers.map(x=>({...x,store_name:storeName(x.store_id)})).sort((a,b)=>(a.store_name+a.name).localeCompare(b.store_name+b.name)),
    customers: (db.customers||[]).map(x=>({...x,store_name:storeName(x.store_id)})).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))),
    employees: (db.employees||[]).map(x=>({...x,store_name:storeName(x.store_id)})).sort((a,b)=>(a.store_name+a.name).localeCompare(b.store_name+b.name))
  };
}

app.get('/api/events', auth, (req,res)=>{
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.write(`data: ${JSON.stringify({type:'connected'})}\n\n`);
  sseClients.add(res);
  req.on('close',()=>sseClients.delete(res));
});

app.post('/api/login',(req,res)=>{
  const {username,password}=req.body||{};
  const db=loadDb();
  const user=db.users.find(u=>u.username===username && u.password===password && u.active===1);
  if(!user) return res.status(401).json({error:'Usuário ou senha inválidos.'});
  const token=crypto.randomBytes(24).toString('hex');
  const safe={id:user.id,name:user.name,username:user.username,role:user.role};
  sessions.set(token,safe);
  res.json({token,user:safe});
});

app.get('/api/bootstrap', auth, (req,res)=>{
  const db=loadDb();
  res.json({
    stores:db.stores, products:db.products,
    sellers: mapEnriched(db).sellers.filter(x=>x.active===1),
    stockSummary:stockSummary(db), cards:cards(db), rankings:rankings(db), me:req.user, customers_count:(db.customers||[]).length, employees_count:(db.employees||[]).length
  });
});

app.get('/api/users', auth, adminOnly, (req,res)=>{
  const db=loadDb(); res.json(db.users.map(({password,...u})=>u));
});
app.post('/api/users', auth, adminOnly, (req,res)=>{
  const {name,username,password,role}=req.body||{};
  if(!name||!username||!password||!role) return res.status(400).json({error:'Preencha os campos do usuário.'});
  const db=loadDb();
  if(db.users.some(u=>u.username===username)) return res.status(400).json({error:'Usuário já existe.'});
  db.users.push({id:nextId(db.users),name,username,password,role,active:1});
  saveDb(db); emitEvent('users.updated'); res.json({ok:true});
});

app.get('/api/sellers', auth, (req,res)=>{
  const db=loadDb(); let list=db.sellers.filter(x=>x.active===1);
  if(req.query.store_id) list=list.filter(x=>String(x.store_id)===String(req.query.store_id));
  res.json(list);
});
app.post('/api/sellers', auth, adminOnly, (req,res)=>{
  const {store_id,name}=req.body||{};
  if(!store_id||!name) return res.status(400).json({error:'Informe loja e nome do vendedor.'});
  const db=loadDb(); db.sellers.push({id:nextId(db.sellers),store_id:Number(store_id),name,active:1});
  saveDb(db); emitEvent('sellers.updated'); res.json({ok:true});
});

app.get('/api/imeis', auth, (req,res)=>{
  const db=loadDb(); let list=mapEnriched(db).imeis;
  const {store_id,product_id,status,barcode}=req.query;
  if(store_id) list=list.filter(x=>String(x.store_id)===String(store_id));
  if(product_id) list=list.filter(x=>String(x.product_id)===String(product_id));
  if(status) list=list.filter(x=>x.status===status);
  if(barcode) list=list.filter(x=>String(x.barcode)===String(barcode));
  res.json(list);
});

app.post('/api/cash/open', auth, (req,res)=>{
  const {store_id,opening_amount}=req.body||{};
  if(!store_id) return res.status(400).json({error:'Informe a loja.'});
  const db=loadDb();
  if(db.cash_registers.some(c=>c.store_id===Number(store_id)&&c.status==='OPEN')) return res.status(400).json({error:'Já existe caixa aberto nessa loja.'});
  db.cash_registers.push({id:nextId(db.cash_registers),store_id:Number(store_id),opened_by:req.user.name,opening_amount:Number(opening_amount||0),opened_at:now(),closed_by:null,closing_amount:null,closed_at:null,status:'OPEN'});
  saveDb(db); emitEvent('cash.updated'); res.json({ok:true});
});
app.post('/api/cash/close', auth, (req,res)=>{
  const {store_id,closing_amount}=req.body||{};
  const db=loadDb(); const open=db.cash_registers.find(c=>c.store_id===Number(store_id)&&c.status==='OPEN');
  if(!open) return res.status(400).json({error:'Não existe caixa aberto nessa loja.'});
  open.status='CLOSED'; open.closed_by=req.user.name; open.closing_amount=Number(closing_amount||0); open.closed_at=now();
  saveDb(db); emitEvent('cash.updated'); res.json({ok:true});
});
app.get('/api/cash', auth, (req,res)=>{ const db=loadDb(); res.json(mapEnriched(db).cash); });

app.post('/api/note-entry', auth, (req,res)=>{
  const {store_id,supplier_name,note_number,product_id,imeis,notes}=req.body||{};
  if(!store_id||!product_id||!Array.isArray(imeis)||imeis.length===0) return res.status(400).json({error:'Informe loja, produto e IMEIs.'});
  const db=loadDb(); const product=db.products.find(p=>p.id===Number(product_id));
  if(!product) return res.status(404).json({error:'Produto não encontrado.'});
  for(const raw of imeis){ const imei=String(raw).trim(); if(db.imei_units.some(x=>x.imei===imei)) return res.status(400).json({error:`IMEI duplicado: ${imei}`}); }
  imeis.forEach(raw=>{
    const imei=String(raw).trim(); if(!imei) return;
    db.imei_units.push({id:nextId(db.imei_units),store_id:Number(store_id),product_id:Number(product_id),imei,status:'AVAILABLE',location_note:notes||null,last_document:note_number||null,created_at:now(),updated_at:now()});
    db.stock_movements.push({id:nextId(db.stock_movements),store_id:Number(store_id),product_id:Number(product_id),imei,movement_type:'ENTRY_NOTE',quantity:1,document_number:note_number||null,seller_name:null,customer_name:null,notes:notes||null,created_at:now()});
  });
  db.note_entries.push({id:nextId(db.note_entries),store_id:Number(store_id),supplier_name:supplier_name||null,note_number:note_number||null,product_id:Number(product_id),quantity:imeis.length,total_value:imeis.length*Number(product.price),notes:notes||null,created_at:now()});
  saveDb(db); emitEvent('stock.updated'); res.json({ok:true});
});

app.post('/api/sell', auth, (req,res)=>{
  const {store_id,product_id,imei,seller_name,customer_name,payment_method,sale_price}=req.body||{};
  if(!store_id||!product_id||!imei||!seller_name||!payment_method||!sale_price) return res.status(400).json({error:'Preencha os campos obrigatórios.'});
  const db=loadDb(); const unit=db.imei_units.find(x=>x.imei===String(imei).trim()&&x.store_id===Number(store_id)&&x.product_id===Number(product_id)&&x.status==='AVAILABLE');
  if(!unit) return res.status(400).json({error:'IMEI não disponível nessa loja.'});
  const saleId=nextId(db.sales);
  db.sales.push({id:saleId,store_id:Number(store_id),product_id:Number(product_id),imei:String(imei).trim(),seller_name,customer_name:customer_name||null,sale_price:Number(sale_price),payment_method,created_at:now()});
  unit.status='SOLD'; unit.updated_at=now(); unit.location_note=`Vendido para ${customer_name||'cliente'}`; unit.last_document=`VENDA-${saleId}`;
  db.stock_movements.push({id:nextId(db.stock_movements),store_id:Number(store_id),product_id:Number(product_id),imei:String(imei).trim(),movement_type:'SALE',quantity:1,document_number:null,seller_name,customer_name:customer_name||null,notes:`Pagamento: ${payment_method}`,created_at:now()});
  db.finance_entries.push({id:nextId(db.finance_entries),store_id:Number(store_id),entry_type:'INCOME',category:'Venda de aparelho',description:`Venda ${imei} - ${seller_name}`,amount:Number(sale_price),due_date:null,status:'PAID',reference_type:'SALE',reference_id:saleId,created_at:now()});
  db.note_exits.push({id:nextId(db.note_exits),store_id:Number(store_id),destination_name:customer_name||'Cliente final',note_number:`VENDA-${saleId}`,product_id:Number(product_id),quantity:1,total_value:Number(sale_price),reason:'VENDA',notes:`Venda do IMEI ${imei}`,created_at:now()});
  saveDb(db); emitEvent('sale.created'); res.json({ok:true});
});

app.post('/api/service-move', auth, (req,res)=>{
  const {store_id,product_id,imei,move_type,destination_name,notes}=req.body||{};
  if(!store_id||!product_id||!imei||!move_type) return res.status(400).json({error:'Preencha os campos obrigatórios.'});
  if(!['ASSISTANCE','REPACK'].includes(move_type)) return res.status(400).json({error:'Tipo inválido.'});
  const db=loadDb(); const unit=db.imei_units.find(x=>x.imei===String(imei).trim()&&x.store_id===Number(store_id)&&x.product_id===Number(product_id)&&x.status==='AVAILABLE');
  if(!unit) return res.status(400).json({error:'IMEI não disponível para saída.'});
  unit.status = move_type==='ASSISTANCE' ? 'ASSISTANCE' : 'REPACK'; unit.updated_at=now(); unit.location_note=destination_name||null; unit.last_document=move_type;
  db.service_moves.push({id:nextId(db.service_moves),store_id:Number(store_id),product_id:Number(product_id),imei:String(imei).trim(),move_type,status:'OPEN',destination_name:destination_name||null,notes:notes||null,created_at:now(),returned_at:null});
  db.stock_movements.push({id:nextId(db.stock_movements),store_id:Number(store_id),product_id:Number(product_id),imei:String(imei).trim(),movement_type:move_type,quantity:1,document_number:null,seller_name:null,customer_name:null,notes:notes||null,created_at:now()});
  saveDb(db); emitEvent('stock.updated'); res.json({ok:true});
});

app.post('/api/service-return', auth, (req,res)=>{
  const {imei,notes}=req.body||{};
  if(!imei) return res.status(400).json({error:'Informe o IMEI.'});
  const db=loadDb(); const unit=db.imei_units.find(x=>x.imei===String(imei).trim()&&['ASSISTANCE','REPACK'].includes(x.status));
  if(!unit) return res.status(400).json({error:'IMEI não está em assistência ou reembalo.'});
  const last=[...db.service_moves].reverse().find(x=>x.imei===String(imei).trim()&&x.status==='OPEN');
  unit.status='AVAILABLE'; unit.updated_at=now(); unit.location_note=notes||null; unit.last_document='RETURN';
  if(last){ last.status='RETURNED'; last.returned_at=now(); last.notes=(last.notes||'') + ` | Retorno: ${notes||'retorno'}`; }
  db.stock_movements.push({id:nextId(db.stock_movements),store_id:unit.store_id,product_id:unit.product_id,imei:String(imei).trim(),movement_type:'RETURN_TO_STOCK',quantity:1,document_number:null,seller_name:null,customer_name:null,notes:notes||null,created_at:now()});
  saveDb(db); emitEvent('stock.updated'); res.json({ok:true});
});

app.post('/api/transfer', auth, (req,res)=>{
  const {from_store_id,to_store_id,product_id,imei,notes}=req.body||{};
  if(!from_store_id||!to_store_id||!product_id||!imei) return res.status(400).json({error:'Preencha origem, destino, produto e IMEI.'});
  if(String(from_store_id)===String(to_store_id)) return res.status(400).json({error:'Origem e destino devem ser diferentes.'});
  const db=loadDb(); const unit=db.imei_units.find(x=>x.imei===String(imei).trim()&&x.store_id===Number(from_store_id)&&x.product_id===Number(product_id)&&x.status==='AVAILABLE');
  if(!unit) return res.status(400).json({error:'IMEI não disponível na loja de origem.'});
  db.transfers.push({id:nextId(db.transfers),from_store_id:Number(from_store_id),to_store_id:Number(to_store_id),product_id:Number(product_id),imei:String(imei).trim(),requested_by:req.user.name,notes:notes||null,created_at:now()});
  unit.store_id=Number(to_store_id); unit.updated_at=now(); unit.location_note=notes||`Transferido por ${req.user.name}`; unit.last_document='TRANSFER';
  db.stock_movements.push({id:nextId(db.stock_movements),store_id:Number(from_store_id),product_id:Number(product_id),imei:String(imei).trim(),movement_type:'TRANSFER_OUT',quantity:1,document_number:null,seller_name:null,customer_name:null,notes:notes||null,created_at:now()});
  db.stock_movements.push({id:nextId(db.stock_movements),store_id:Number(to_store_id),product_id:Number(product_id),imei:String(imei).trim(),movement_type:'TRANSFER_IN',quantity:1,document_number:null,seller_name:null,customer_name:null,notes:notes||null,created_at:now()});
  saveDb(db); emitEvent('stock.updated'); res.json({ok:true});
});

app.post('/api/finance-expense', auth, (req,res)=>{
  const {store_id,category,description,amount,due_date,status}=req.body||{};
  if(!category||!description||!amount) return res.status(400).json({error:'Preencha categoria, descrição e valor.'});
  const db=loadDb();
  db.finance_entries.push({id:nextId(db.finance_entries),store_id:store_id?Number(store_id):null,entry_type:'EXPENSE',category,description,amount:Number(amount),due_date:due_date||null,status:status||'OPEN',reference_type:'MANUAL',reference_id:null,created_at:now()});
  saveDb(db); emitEvent('finance.updated'); res.json({ok:true});
});

app.post('/api/finance-income', auth, (req,res)=>{
  const {store_id,category,description,amount,due_date,status}=req.body||{};
  if(!category||!description||!amount) return res.status(400).json({error:'Preencha categoria, descrição e valor.'});
  const db=loadDb();
  db.finance_entries.push({id:nextId(db.finance_entries),store_id:store_id?Number(store_id):null,entry_type:'INCOME',category,description,amount:Number(amount),due_date:due_date||null,status:status||'OPEN',reference_type:'MANUAL',reference_id:null,created_at:now()});
  saveDb(db); emitEvent('finance.updated'); res.json({ok:true});
});

app.get('/api/finance', auth, (req,res)=>{ const db=loadDb(); res.json({entries:mapEnriched(db).finance, summary:cards(db)}); });
app.get('/api/movements', auth, (req,res)=>{ const db=loadDb(); res.json(mapEnriched(db).moves); });
app.get('/api/sales', auth, (req,res)=>{ const db=loadDb(); res.json(mapEnriched(db).sales); });
app.get('/api/service-moves', auth, (req,res)=>{ const db=loadDb(); res.json(mapEnriched(db).service_moves); });
app.get('/api/transfers', auth, (req,res)=>{ const db=loadDb(); res.json(mapEnriched(db).transfers); });
app.get('/api/notes', auth, (req,res)=>{ const db=loadDb(); res.json(mapEnriched(db).notes); });

app.post('/api/nfe/parse', auth, async (req,res) => {
  try{
    const { xml } = req.body || {};
    if(!xml || !String(xml).trim()) return res.status(400).json({ error:'Envie o conteúdo XML da nota.' });
    const parsed = await parseNFeXmlText(String(xml));
    res.json(parsed);
  }catch(err){
    res.status(400).json({ error:'Não foi possível ler o XML da nota.' });
  }
});


app.get('/api/customers', auth, (req,res)=>{
  const db = loadDb();
  let list = mapEnriched(db).customers;
  const store_ids = String(req.query.store_ids || '').split(',').map(x=>x.trim()).filter(Boolean);
  if (store_ids.length && !store_ids.includes('ALL')) list = list.filter(x => store_ids.includes(String(x.store_id)));
  const q = String(req.query.q || '').toLowerCase().trim();
  if (q) list = list.filter(x => `${x.name||''} ${x.cpf||''} ${x.phone||''}`.toLowerCase().includes(q));
  res.json(list);
});
app.post('/api/customers', auth, (req,res)=>{
  const { name, cpf, phone, store_id, origin_app } = req.body || {};
  if (!name || !store_id) return res.status(400).json({ error:'Informe nome e loja.' });
  const db = loadDb();
  db.customers.push({ id: nextId(db.customers||[]), name, cpf: cpf||'', phone: phone||'', store_id: Number(store_id), origin_app: !!origin_app, created_at: now() });
  saveDb(db); emitEvent('customers.updated'); res.json({ ok:true });
});
app.get('/api/employees', auth, (req,res)=>{
  const db = loadDb();
  let list = mapEnriched(db).employees;
  const store_ids = String(req.query.store_ids || '').split(',').map(x=>x.trim()).filter(Boolean);
  if (store_ids.length && !store_ids.includes('ALL')) list = list.filter(x => store_ids.includes(String(x.store_id)));
  res.json(list);
});
app.post('/api/employees', auth, adminOnly, (req,res)=>{
  const { name, role_name, store_id } = req.body || {};
  if (!name || !store_id) return res.status(400).json({ error:'Informe nome e loja.' });
  const db = loadDb();
  db.employees.push({ id: nextId(db.employees||[]), name, role_name: role_name||'Funcionário', store_id: Number(store_id), active: 1, created_at: now() });
  saveDb(db); emitEvent('employees.updated'); res.json({ ok:true });
});

app.get('/api/health', (req,res)=>res.json({ok:true}));
app.get('*', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT, ()=>console.log(`JRS PDV V4 rodando em http://localhost:${PORT}`));
