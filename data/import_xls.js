// Importa os .xls (tabelas HTML) do RAJ -> Postgres.
// Contas a Receber, Contas a Pagar, Entradas de NF (agregadas), Notas Fiscais.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const DL = path.join(process.env.USERPROFILE || '', 'Downloads');
const FILES = {
  contas_receber: 'contas_a_receber_20260625131151.xls',
  contas_pagar: 'consulta_contas_pagar_20260625131422.xls',
  notas_entrada: 'relatorio_entrada_nf_tirado_em_25_06_2026_13_16_12.xls',
  notas_fiscais: 'Notas_Fiscais25_06_2026_13_17_11.xls',
};

const ENT = { Aacute: 'Á', aacute: 'á', Eacute: 'É', eacute: 'é', Iacute: 'Í', iacute: 'í', Oacute: 'Ó', oacute: 'ó', Uacute: 'Ú', uacute: 'ú', Ccedil: 'Ç', ccedil: 'ç', Atilde: 'Ã', atilde: 'ã', Otilde: 'Õ', otilde: 'õ', Acirc: 'Â', acirc: 'â', Ecirc: 'Ê', ecirc: 'ê', Ocirc: 'Ô', ocirc: 'ô', Agrave: 'À', agrave: 'à' };
function decode(s) {
  return (s || '').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&([A-Za-z]+);/g, (m, n) => ENT[n] !== undefined ? ENT[n] : m)
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ').trim();
}
function readSmart(f) {
  const b = fs.readFileSync(f);
  const u = b.toString('utf8');
  // mojibake de latin1 lido como utf8: 'Ã'/'Â' seguido de char alto, ou replacement char
  const bad = (u.match(/�/g) || []).length + (u.match(/[ÃÂ][-ÿ]/g) || []).length;
  return bad > 5 ? b.toString('latin1') : u;
}
function parseTable(html) {
  const rows = []; const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi; let m;
  while ((m = trRe.exec(html)) !== null) {
    const cells = []; const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi; let c;
    while ((c = cellRe.exec(m[1])) !== null) cells.push(decode(c[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}
function headerRow(rows) { let hi = 0, best = 0; rows.forEach((r, i) => { const n = r.filter(Boolean).length; if (n > best) { best = n; hi = i; } }); return hi; }
function colFinder(headers) {
  const H = headers.map(h => (h || '').toUpperCase());
  return (...kws) => { for (const kw of kws) { const i = H.findIndex(h => h.includes(kw)); if (i >= 0) return i; } return -1; };
}
function num(s) {
  if (!s) return 0; s = String(s).replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
}

async function bulkInsert(table, cols, records) {
  if (!records.length) return 0;
  let total = 0; const SZ = 250;
  for (let i = 0; i < records.length; i += SZ) {
    const chunk = records.slice(i, i + SZ);
    const vals = []; const ph = [];
    chunk.forEach((rec, ri) => {
      ph.push('(' + cols.map((_, ci) => '$' + (ri * cols.length + ci + 1)).join(',') + ')');
      cols.forEach(c => vals.push(rec[c] === undefined ? null : rec[c]));
    });
    await pool.query(`INSERT INTO ${table}(${cols.join(',')}) VALUES ${ph.join(',')}`, vals);
    total += chunk.length;
  }
  return total;
}

(async () => {
  try {
    // ---- CONTAS A RECEBER ----
    {
      const f = path.join(DL, FILES.contas_receber);
      const rows = parseTable(readSmart(f)); const hi = headerRow(rows); const H = rows[hi]; const col = colFinder(H);
      const c = { cod: col('LANCTO'), desc: col('DESCRI'), cli: col('CLIENTE'), nf: col('NF'), cat: col('CATEGORIA'), loja: col('LOJA'), val: col('VALOR BRUTO', 'VALOR L'), venc: col('VENCIMENTO'), rec: col('VALOR RECEBIDO', 'RECEBIDO'), st: col('STATUS') };
      const recs = rows.slice(hi + 1).filter(r => r[c.cod]).map(r => ({
        codigo: r[c.cod], descricao: r[c.desc], cliente: r[c.cli], documento: r[c.nf], categoria: r[c.cat],
        store_name: r[c.loja], valor: num(r[c.val]), vencimento: r[c.venc], recebimento: r[c.rec], status: r[c.st],
      }));
      await pool.query('DELETE FROM contas_receber');
      const n = await bulkInsert('contas_receber', ['codigo', 'descricao', 'cliente', 'documento', 'categoria', 'store_name', 'valor', 'vencimento', 'recebimento', 'status'], recs);
      console.log('contas_receber: ' + n);
    }
    // ---- CONTAS A PAGAR ----
    {
      const f = path.join(DL, FILES.contas_pagar);
      const rows = parseTable(readSmart(f)); const hi = headerRow(rows); const H = rows[hi]; const col = colFinder(H);
      const c = { cod: col('CODIGO'), desc: col('DESCRICAO', 'DESCRI'), nome: col('NOME'), doc: col('CPF', 'CNPJ'), cat: col('CATEGORIA'), reg: col('REGIONAL'), val: col('VALOR PARCELA', 'VALOR NF'), pago: col('VALOR PAGO'), venc: col('VENCIMENTO'), st: col('STATUS') };
      const recs = rows.slice(hi + 1).filter(r => r[c.cod]).map(r => ({
        codigo: r[c.cod], descricao: r[c.desc], fornecedor: r[c.nome], documento: r[c.doc], categoria: r[c.cat],
        store_name: c.reg >= 0 ? r[c.reg] : '', valor: num(r[c.val]), pagamento: r[c.pago], vencimento: r[c.venc], status: r[c.st],
      }));
      await pool.query('DELETE FROM contas_pagar');
      const n = await bulkInsert('contas_pagar', ['codigo', 'descricao', 'fornecedor', 'documento', 'categoria', 'store_name', 'valor', 'pagamento', 'vencimento', 'status'], recs);
      console.log('contas_pagar: ' + n);
    }
    // ---- ENTRADAS DE NF (agrega por nota) ----
    {
      const f = path.join(DL, FILES.notas_entrada);
      const rows = parseTable(readSmart(f)); const hi = headerRow(rows); const H = rows[hi]; const col = colFinder(H);
      const c = { nota: col('NOTA'), forn: col('FORNECEDOR'), reg: col('REGIONAL'), vtot: col('VL TOT', 'TOT PROD'), data: col('DATA'), cfop: col('CFOP') };
      const g = {};
      rows.slice(hi + 1).forEach(r => {
        const nota = r[c.nota]; if (!nota) return;
        const k = nota + '|' + (r[c.reg] || '');
        if (!g[k]) g[k] = { numero: nota, fornecedor: r[c.forn], store_name: r[c.reg], valor: 0, qtd_itens: 0, data_entrada: r[c.data], natureza: r[c.cfop] };
        g[k].valor += num(r[c.vtot]); g[k].qtd_itens++;
      });
      const recs = Object.values(g);
      await pool.query('DELETE FROM notas_entrada');
      const n = await bulkInsert('notas_entrada', ['numero', 'fornecedor', 'store_name', 'valor', 'qtd_itens', 'data_entrada', 'natureza'], recs);
      console.log('notas_entrada (notas agregadas): ' + n + ' (de ' + (rows.length - hi - 1) + ' itens)');
    }
    // ---- NOTAS FISCAIS ----
    {
      const f = path.join(DL, FILES.notas_fiscais);
      const rows = parseTable(readSmart(f)); const hi = headerRow(rows); const H = rows[hi]; const col = colFinder(H);
      const c = { data: col('DATA'), num: col('NOTA FISCAL'), cfop: col('CFOP'), dest: col('CLIENTE'), val: col('TOTAL NF'), st: col('STATUS'), mov: col('MOVIMENTO'), reg: col('REGIONAL'), cnpj: col('CNPJ') };
      const recs = rows.slice(hi + 1).filter(r => r[c.num]).map(r => ({
        numero: r[c.num], natureza: r[c.cfop], tipo: r[c.mov], destinatario: r[c.dest], documento: r[c.cnpj],
        store_name: r[c.reg], valor: num(r[c.val]), status: r[c.st], data_emissao: r[c.data],
      }));
      await pool.query('DELETE FROM notas_fiscais');
      const n = await bulkInsert('notas_fiscais', ['numero', 'natureza', 'tipo', 'destinatario', 'documento', 'store_name', 'valor', 'status', 'data_emissao'], recs);
      console.log('notas_fiscais: ' + n);
    }

    const cnt = async t => (await pool.query('SELECT count(*) FROM ' + t)).rows[0].count;
    console.log('TOTAIS -> receber=' + await cnt('contas_receber') + ' pagar=' + await cnt('contas_pagar') + ' entradas=' + await cnt('notas_entrada') + ' nfe=' + await cnt('notas_fiscais'));
    await pool.end();
  } catch (e) { console.log('FATAL: ' + e.message); process.exit(1); }
})();
