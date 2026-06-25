// Importador de PREÇOS POR LOJA (CSV de produtos exportado do RAJ) -> db.json
// Uso: node data/import_precos.js  [caminho_do_csv_opcional]
// Auto-detecta o CSV mais recente do Downloads cujo nome contenha "produt".
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, 'db.json');
const DL = path.join(process.env.USERPROFILE || '', 'Downloads');

// keyword da coluna "TABELA DE PREÇO:..." -> store_id do nosso sistema
const STORE_KW = {
  'BOA VISTA': 4, 'PATTEO': 6, 'GUARARAPES': 1, 'RECIFE': 2, 'RIOMAR': 3, 'RIO MAR': 3,
  'CARUARU': 8, 'DIFUSORA': 9, 'TACARUNA': 5, 'TAMANDARE': 10, 'TAMANDARÉ': 10,
  'FORMOSO': 11, 'PAULISTA': 7, 'NORTH': 7, 'SITE': 12,
};

function readSmart(file) {
  const buf = fs.readFileSync(file);
  let t = buf.toString('utf8');
  if (t.includes('�')) t = buf.toString('latin1');
  return t;
}
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ';') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); f = ''; rows.push(row); row = []; }
    else if (c !== '\r') f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows;
}
function num(s) {
  if (!s) return 0;
  s = String(s).replace(/[^\d,.-]/g, '').trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56 -> 1234.56
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function findCsv(arg) {
  if (arg && fs.existsSync(arg)) return arg;
  if (!fs.existsSync(DL)) return null;
  const cands = fs.readdirSync(DL).filter(f => /\.csv$/i.test(f) && /produt/i.test(f))
    .map(f => ({ f, t: fs.statSync(path.join(DL, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  return cands.length ? path.join(DL, cands[0].f) : null;
}

const file = findCsv(process.argv[2]);
if (!file) { console.log('Nenhum CSV de produto achado no Downloads (nome deve conter "produt"). Passe o caminho como argumento.'); process.exit(1); }
console.log('Lendo: ' + file);

const rows = parseCSV(readSmart(file));
const headers = rows.shift().map(h => h.trim());
const upper = headers.map(h => h.toUpperCase());

// localiza colunas
const codIdx = upper.findIndex(h => /^C[ÓO]D/.test(h) || h === 'CODIGO');
const descIdx = upper.findIndex(h => /DESCRI|NOME|PRODUTO/.test(h) && !/TABELA/.test(h));
const custoIdx = upper.findIndex(h => /COMPRA/.test(h));
// colunas de preço por loja
const priceCols = [];
upper.forEach((h, i) => {
  if (!/PRE[ÇC]O|TABELA/.test(h)) return;
  if (/COMPRA|PELICULA|PEL[ÍI]CULA/.test(h)) return;
  for (const kw in STORE_KW) { if (h.includes(kw)) { priceCols.push({ i, store: STORE_KW[kw], kw }); break; } }
});

console.log('Coluna codigo=' + codIdx + ' descricao=' + descIdx + ' custo=' + custoIdx);
console.log('Colunas de preco por loja mapeadas: ' + priceCols.map(p => p.kw + '->loja' + p.store).join(', '));

const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
const byCod = {}; db.products.forEach(p => { if (p.codigo) byCod[String(p.codigo)] = p; });
const byName = {}; db.products.forEach(p => { byName[(p.name || '').toUpperCase().trim()] = p; });

let matched = 0, prices = 0;
for (const r of rows) {
  if (!r.length) continue;
  const cod = (r[codIdx] || '').trim();
  const desc = (r[descIdx] || '').trim().toUpperCase().replace(/^SMARTPHONE\s+/, '');
  let prod = byCod[cod] || byName[desc];
  if (!prod) continue;
  matched++;
  if (!prod.prices) prod.prices = {};
  for (const pc of priceCols) {
    const v = num(r[pc.i]);
    if (v > 0) { prod.prices[pc.store] = v; prices++; }
  }
  if (custoIdx >= 0) { const c = num(r[custoIdx]); if (c > 0) prod.cost_price = c; }
  // base price = matriz (PATTEO=6) ou o maior preco encontrado
  const vals = Object.values(prod.prices || {}).filter(x => x > 0);
  if (vals.length) prod.price = prod.prices[6] || Math.max(...vals);
}

fs.writeFileSync(DB, JSON.stringify(db, null, 2));
console.log(`OK -> produtos casados: ${matched}, precos por loja gravados: ${prices}`);
