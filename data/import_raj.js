// Ingestor GENÉRICO do RAJ: engole qualquer .xls (tabela HTML) ou .csv do Downloads
// e guarda em raj_import (jsonb). Cria uma "fonte" por arquivo. Idempotente por fonte.
// Uso: node data/import_raj.js            (varre o Downloads)
//      node data/import_raj.js --force    (reimporta as fontes já existentes)
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
let XLSX = null; try { XLSX = require('xlsx'); } catch (e) { /* .xlsx será pulado */ }

const DL = path.join(process.env.USERPROFILE || '', 'Downloads');
const FORCE = process.argv.includes('--force');
// arquivos já tratados por importadores dedicados (não reimporta genérico)
const SKIP = /relatorio_cliente|Relatorio_fornecedores|contas_a_receber|consulta_contas_pagar|relatorio_entrada_nf|Notas_Fiscais/i;

const ENT = { Aacute:'Á',aacute:'á',Eacute:'É',eacute:'é',Iacute:'Í',iacute:'í',Oacute:'Ó',oacute:'ó',Uacute:'Ú',uacute:'ú',Ccedil:'Ç',ccedil:'ç',Atilde:'Ã',atilde:'ã',Otilde:'Õ',otilde:'õ',Acirc:'Â',acirc:'â',Ecirc:'Ê',ecirc:'ê',Ocirc:'Ô',ocirc:'ô',Agrave:'À',agrave:'à' };
function decode(s){return (s||'').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&([A-Za-z]+);/g,(m,n)=>ENT[n]!==undefined?ENT[n]:m).replace(/&#(\d+);/g,(m,n)=>String.fromCharCode(+n)).replace(/\s+/g,' ').trim();}
function readSmart(f){const b=fs.readFileSync(f);const u=b.toString('utf8');const bad=(u.match(/�/g)||[]).length+(u.match(/[ÃÂ][-ÿ]/g)||[]).length;return bad>5?b.toString('latin1'):u;}
function parseHtmlTable(html){const rows=[];const trRe=/<tr[^>]*>([\s\S]*?)<\/tr>/gi;let m;while((m=trRe.exec(html))!==null){const cells=[];const cRe=/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;let c;while((c=cRe.exec(m[1]))!==null)cells.push(decode(c[1]));if(cells.length)rows.push(cells);}return rows;}
function parseCsv(text){const rows=[];let row=[],f='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}else if(c==='"')q=true;else if(c===';'||c===',')row.push(f),f='';else if(c==='\n'){row.push(f);f='';rows.push(row);row=[];}else if(c!=='\r')f+=c;}if(f.length||row.length){row.push(f);rows.push(row);}return rows;}
function headerRow(rows){let hi=0,best=0;rows.forEach((r,i)=>{const n=r.filter(Boolean).length;if(n>best){best=n;hi=i;}});return hi;}
function slug(fn){return fn.replace(/\.(xls|xlsx|csv)$/i,'').replace(/[_-]?\d{6,}.*$/,'').replace(/tirado.*$/i,'').replace(/\d{2}[_-]\d{2}[_-]\d{4}.*$/,'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').toLowerCase()||'dados';}

async function bulkInsert(source, titulo, records){
  let total=0; const SZ=300;
  for(let i=0;i<records.length;i+=SZ){
    const chunk=records.slice(i,i+SZ);
    const vals=[]; const ph=[];
    chunk.forEach((rec,ri)=>{ph.push(`($${ri*4+1},$${ri*4+2},$${ri*4+3},$${ri*4+4})`);vals.push(source,titulo,rec.n,JSON.stringify(rec.d));});
    await pool.query(`INSERT INTO raj_import(source,titulo,row_num,data) VALUES ${ph.join(',')}`,vals);
    total+=chunk.length;
  }
  return total;
}

(async()=>{
 try{
  if(!fs.existsSync(DL)){console.log('Downloads nao encontrado');process.exit(1);}
  const files=fs.readdirSync(DL).filter(f=>/\.(xls|xlsx|csv)$/i.test(f)&&!SKIP.test(f));
  if(!files.length){console.log('Nenhum arquivo novo (.xls/.csv) no Downloads.');await pool.end();return;}
  for(const fn of files){
    const source=slug(fn);
    const existing=(await pool.query('SELECT count(*)::int c FROM raj_import WHERE source=$1',[source])).rows[0].c;
    if(existing>0 && !FORCE){console.log(`- ${fn} -> fonte '${source}' ja tem ${existing} (pulando; use --force)`);continue;}
    if(FORCE)await pool.query('DELETE FROM raj_import WHERE source=$1',[source]);
    let rows;
    if(/\.xlsx$/i.test(fn)){
      if(!XLSX){console.log(`- ${fn} -> .xlsx precisa da lib xlsx (npm i xlsx)`);continue;}
      const wb=XLSX.readFile(path.join(DL,fn));
      const ws=wb.Sheets[wb.SheetNames[0]];
      rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''}).map(r=>r.map(c=>String(c==null?'':c).trim()));
    }else{
      const txt=readSmart(path.join(DL,fn));
      rows=/\.csv$/i.test(fn)?parseCsv(txt):parseHtmlTable(txt);
    }
    if(rows.length<2){console.log(`- ${fn} -> vazio/ilegivel`);continue;}
    const hi=headerRow(rows);
    let hdr=rows[hi].map((h,i)=>h||('col'+i));
    // dedup headers
    const seen={};hdr=hdr.map(h=>{let k=h;while(seen[k])k=k+'_';seen[k]=1;return k;});
    const recs=[];
    rows.slice(hi+1).forEach((r,idx)=>{
      if(!r.filter(Boolean).length)return;
      const d={};hdr.forEach((h,ci)=>{if((r[ci]||'').trim())d[h]=r[ci].trim();});
      if(Object.keys(d).length)recs.push({n:idx+1,d});
    });
    const n=await bulkInsert(source,fn,recs);
    console.log(`+ ${fn} -> fonte '${source}': ${n} linhas (${hdr.length} colunas)`);
  }
  const srcs=await pool.query('SELECT source, count(*)::int c FROM raj_import GROUP BY source ORDER BY source');
  console.log('\nFONTES no raj_import:');srcs.rows.forEach(r=>console.log('  '+r.source+' = '+r.c));
  await pool.end();
 }catch(e){console.log('FATAL: '+e.message);process.exit(1);}
})();
