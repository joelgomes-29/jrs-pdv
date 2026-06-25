// Importador de Clientes/Fornecedores (CSV exportado do RAJ) -> Postgres/Supabase.
// Uso: node data/import_contatos.js
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const DL = path.join(process.env.USERPROFILE || '', 'Downloads');
const FORN = path.join(DL, 'Relatorio_fornecedores_22_06_2026_12_05_24.csv');
const CLI = path.join(DL, 'relatorio_cliente_22_06_2026_12_05_44.csv');

function readSmart(file) {
  const buf = fs.readFileSync(file);
  let txt = buf.toString('utf8');
  if (txt.includes('�')) txt = buf.toString('latin1'); // arquivo é Latin1
  return txt;
}

function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ';') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
      else if (c !== '\r') field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function idx(headers, ...names) {
  for (const n of names) {
    const i = headers.findIndex(h => h.trim().toUpperCase() === n.toUpperCase());
    if (i >= 0) return i;
  }
  return -1;
}

async function importFile(file, table, mapFn) {
  if (!fs.existsSync(file)) { console.log('NAO ACHOU: ' + file); return; }
  const rows = parseCSV(readSmart(file));
  const headers = rows.shift();
  let ok = 0, err = 0;
  for (const r of rows) {
    if (!r.length || !r.join('').trim()) continue;
    const rec = mapFn(r, headers);
    if (!rec || !rec.name) continue;
    const keys = Object.keys(rec).filter(k => rec[k] !== undefined && rec[k] !== '');
    if (!keys.length) continue;
    const ph = keys.map((_, i) => '$' + (i + 1));
    try {
      await pool.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${ph.join(',')})`, keys.map(k => rec[k]));
      ok++;
    } catch (e) { err++; if (err <= 3) console.log('  erro: ' + e.message); }
  }
  console.log(`${table}: inseridos=${ok} erros=${err} (de ${rows.length} linhas)`);
}

(async () => {
  try {
    await pool.query('DELETE FROM fornecedores');
    await pool.query('DELETE FROM clientes');

    await importFile(FORN, 'fornecedores', (r, h) => {
      const g = (...n) => { const i = idx(h, ...n); return i >= 0 ? (r[i] || '').trim() : ''; };
      return {
        codigo: g('CODIGO'), name: g('NOME'), razao_social: g('RAZAO SOCIAL'),
        cnpj: g('CPF / CNPJ', 'CPF/CNPJ'), tipo: g('TIPO'), email: g('E-MAIL', 'EMAIL'),
        fone: g('CONTATO EMPRESA') || g('CONTATO VENDEDOR'), endereco: g('ENDERECO'),
        cidade: g('CIDADE'), uf: g('UF'),
      };
    });

    await importFile(CLI, 'clientes', (r, h) => {
      const g = (...n) => { const i = idx(h, ...n); return i >= 0 ? (r[i] || '').trim() : ''; };
      return {
        codigo: g('Codigo'), name: g('Nome'), razao_social: g('Razao Social'),
        cpf: g('CPF/CNPJ'), email: g('Email'), fone: g('Telefone'), celular: g('Telefone 2'),
        endereco: g('Logradouro'), bairro: g('Bairro'), cidade: g('Cidade'), uf: g('Estado'),
      };
    });

    const a = await pool.query('SELECT count(*) FROM fornecedores');
    const b = await pool.query('SELECT count(*) FROM clientes');
    console.log('TOTAIS -> fornecedores=' + a.rows[0].count + ' clientes=' + b.rows[0].count);
    await pool.end();
  } catch (e) { console.log('FATAL: ' + e.message); process.exit(1); }
})();
