// Inspeciona os .xls (tabelas HTML) do RAJ: mostra cabeçalho + 1ª linha + total.
const fs = require('fs');
const path = require('path');
const DL = path.join(process.env.USERPROFILE || '', 'Downloads');

const FILES = {
  contas_receber: 'contas_a_receber_20260625131151.xls',
  contas_pagar: 'consulta_contas_pagar_20260625131422.xls',
  notas_entrada: 'relatorio_entrada_nf_tirado_em_25_06_2026_13_16_12.xls',
  notas_fiscais: 'Notas_Fiscais25_06_2026_13_17_11.xls',
};

function decode(s) {
  return (s || '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ').trim();
}
function parseTable(html) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const cells = [];
    const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let c;
    while ((c = cellRe.exec(m[1])) !== null) cells.push(decode(c[1].replace(/<[^>]+>/g, '')));
    if (cells.length) rows.push(cells);
  }
  return rows;
}
function readSmart(f) {
  const b = fs.readFileSync(f);
  let t = b.toString('utf8');
  if (t.includes('�')) t = b.toString('latin1');
  return t;
}

for (const [key, fname] of Object.entries(FILES)) {
  const f = path.join(DL, fname);
  if (!fs.existsSync(f)) { console.log(`\n### ${key}: NAO ACHOU ${fname}`); continue; }
  const rows = parseTable(readSmart(f));
  // acha a linha de cabeçalho (a com mais células não vazias)
  let hi = 0, best = 0;
  rows.forEach((r, i) => { const n = r.filter(Boolean).length; if (n > best) { best = n; hi = i; } });
  console.log(`\n### ${key} (${fname}) -> ${rows.length} linhas, header na linha ${hi} com ${best} colunas`);
  console.log('HEADER: ' + rows[hi].map((h, i) => i + ':' + h).join(' | '));
  if (rows[hi + 1]) console.log('LINHA1: ' + rows[hi + 1].slice(0, 24).join(' | '));
}
