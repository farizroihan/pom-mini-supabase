'use strict';
/* ===== Layer database (ganti isi fungsi ini untuk pindah ke MySQL/Supabase/Firebase/REST) ===== */
const DB={
  get(k,d){try{const v=localStorage.getItem('pm_'+k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){localStorage.setItem('pm_'+k,JSON.stringify(v))},
  products(){return this.get('products',{Pertalite:{jual:12000,modal:10000},Pertamax:{jual:17500,modal:15950}})},
  txs(){return this.get('transactions',[])},
  saveTx(t){this.saveMany([t])},
  saveMany(l){const m=new Map(this.txs().map(x=>[x.id,x]));l.forEach(t=>m.set(t.id,t));this.set('transactions',[...m.values()]);this.queue({op:'ups',txs:l})},
  delTx(id){this.set('transactions',this.txs().filter(x=>x.id!==id));this.queue({op:'del',id})},
  saveProducts(p){this.set('products',p);this.queue({op:'prod',products:p})},
  wipe(){['products','transactions'].forEach(k=>localStorage.removeItem('pm_'+k));this.queue({op:'wipe'})},
  /* ---- Sinkronisasi: cache lokal + antrean perubahan ke Supabase ---- */
  pend(){return this.get('pend',[])},
  queue(o){this.set('pend',this.pend().concat([o]));this.sync()},
  async sync(){
    if(this.busy||!SB.ses())return;this.busy=true;let changed=false;
    try{
      while(this.pend().length){await SB.run(this.pend()[0]);this.set('pend',this.pend().slice(1))}
      changed=await this.pull();this.err='';
    }catch(e){this.err=String(e.message||e)==='Failed to fetch'?'Tidak ada koneksi':String(e.message||e)}
    this.busy=false;
    if(this.pend().length&&!this.err)return this.sync();
    if(changed&&!/^#add/.test(location.hash))route();
  },
  async pull(){
    const rows=[];
    for(let o=0;;o+=1000){const r=await SB.rest('transactions?select=*&order=tanggal.asc,id.asc',{headers:{'Range-Unit':'items',Range:o+'-'+(o+999)}})||[];rows.push(...r);if(r.length<1000)break}
    const st=await SB.rest('settings?select=products');
    if(this.pend().length)return false;
    const a=rows.map(SB.from),f=x=>JSON.stringify(x.map(t=>COLS.map(c=>t[c])).sort());
    let ch=f(a)!==f(this.txs());this.set('transactions',a);
    if(st&&st[0]&&st[0].products){ch=ch||JSON.stringify(st[0].products)!==JSON.stringify(this.products());this.set('products',st[0].products)}
    return ch;
  }
};
/* ===== Util ===== */
const $=s=>document.querySelector(s);
const rp=n=>'Rp'+Math.round(n).toLocaleString('id-ID');
const lt=n=>(Math.round(n*1000)/1000).toLocaleString('id-ID',{minimumFractionDigits:3,maximumFractionDigits:3})+' L';
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const BLN=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const tgl=s=>{const[y,m,d]=s.split('-');return d+' '+BLN[+m-1]+' '+y};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const num=v=>{const n=parseFloat(String(v).replace(',','.'));return isFinite(n)?n:0};
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1800)}
function confirmBox(title,text,okLabel,cb){const d=$('#dlg');d.innerHTML=`<h2 style="margin:0 0 8px;color:var(--ink)">${title}</h2><p class="lbl">${text}</p><div class="row"><button id="no">Batal</button><button id="ok" class="dng">${okLabel}</button></div>`;d.showModal();$('#no').onclick=()=>d.close();$('#ok').onclick=()=>{d.close();cb()}}
/* ===== Perhitungan (satu sumber untuk semua tampilan) ===== */
function calc(mode,input,jual,modal){
  let nominal,liter;
  if(mode==='nominal'){nominal=input;liter=jual>0?input/jual:0}
  else{liter=input;nominal=Math.round(liter*jual)}
  const m=liter*modal;return{nominal,liter,modal:m,keuntungan:nominal-m}
}
const sum=a=>a.reduce((s,t)=>({n:s.n+t.nominal,l:s.l+t.liter,m:s.m+t.modal,u:s.u+t.keuntungan,c:s.c+1}),{n:0,l:0,m:0,u:0,c:0});
const byProd=(a,p)=>sum(a.filter(t=>t.produk===p));
/* ===== Navigasi ===== */
const NAV=[['dash','▦','Dashboard'],['add','＋','Penjualan'],['hist','☰','Riwayat'],['rep','▮','Laporan'],['set','⚙','Pengaturan']];
function renderNav(r){
  $('#bottom').innerHTML=NAV.map(([k,i,n])=>`<a href="#${k}" class="${r===k?'on':''}"><b>${i}</b>${n}</a>`).join('');
  $('#side').innerHTML='<h3>⛽ Pom Mini</h3>'+NAV.map(([k,i,n])=>`<a href="#${k}" class="${r===k?'on':''}">${i}&nbsp; ${n}</a>`).join('');
}
function route(){
  if(!SB.ses())return renderLogin();
  document.body.classList.remove('nologin');
  const h=(location.hash||'#dash').slice(1).split('/');const r=h[0];
  renderNav(r);const v={dash:vDash,add:()=>vAdd(h[1]),hist:vHist,rep:vRep,set:vSet}[r]||vDash;v();window.scrollTo(0,0);
}
/* ===== Dashboard ===== */
function vDash(){
  const t=DB.txs().filter(x=>x.tanggal===today()),s=sum(t),pt=byProd(t,'Pertalite'),px=byProd(t,'Pertamax');
  $('#app').innerHTML=`<h1>Hari ini · ${tgl(today())}</h1>${pendHtml()}
  <div class="grid s4"><div class="card big"><div class="lbl">Penjualan hari ini</div><div class="val">${rp(s.n)}</div></div>
  <div class="card"><div class="lbl">Modal hari ini</div><div class="val">${rp(s.m)}</div></div>
  <div class="card"><div class="lbl">Keuntungan hari ini</div><div class="val g">${rp(s.u)}</div></div>
  <div class="card"><div class="lbl">Liter hari ini</div><div class="val a">${lt(s.l)}</div></div>
  <div class="card"><div class="lbl">Jumlah transaksi</div><div class="val">${s.c} transaksi</div></div></div>
  <h2>Per produk</h2><div class="grid"><div class="card"><div class="lbl">Pertalite</div><div class="val">${rp(pt.n)}</div><div class="lbl">${lt(pt.l)}</div></div>
  <div class="card"><div class="lbl">Pertamax</div><div class="val">${rp(px.n)}</div><div class="lbl">${lt(px.l)}</div></div></div>
  <div style="margin:16px 0"><a href="#add" class="btn pri" style="display:block;text-align:center;text-decoration:none;line-height:20px">+ TAMBAH TRANSAKSI</a></div>
  <h2>Transaksi hari ini</h2><div class="card">${t.length?t.slice().reverse().map(itemHtml).join(''):'<div class="empty">Belum ada transaksi hari ini. Tekan Tambah Transaksi untuk mulai mencatat.</div>'}</div>`;
  bindActs();
}
const pendHtml=()=>DB.err?`<p class="lbl r" style="margin:-6px 0 12px">⚠ Belum tersinkron: ${esc(DB.err)}. Data aman di perangkat, akan dikirim otomatis.</p>`:(DB.pend().length?'<p class="lbl" style="margin:-6px 0 12px">Menyinkronkan '+DB.pend().length+' perubahan…</p>':'');
function itemHtml(t){return `<div class="item"><div><span class="tag ${t.produk==='Pertamax'?'px':''}">${t.produk}</span> <b>${rp(t.nominal)}</b><div class="lbl">${lt(t.liter)} · Modal ${rp(t.modal)}</div></div><div style="text-align:right"><div class="g"><b>Untung ${rp(t.keuntungan)}</b></div><div class="acts" style="justify-content:flex-end"><button class="sm" data-e="${t.id}">Edit</button><button class="sm dng" data-d="${t.id}">Hapus</button></div></div></div>`}
function bindActs(){
  document.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>location.hash='add/'+b.dataset.e);
  document.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>confirmBox('Hapus transaksi ini?','Data yang dihapus tidak dapat dikembalikan tanpa backup.','Hapus',()=>{DB.delTx(b.dataset.d);toast('Transaksi dihapus');route()}));
}
/* ===== Tambah / Edit ===== */
function vAdd(editId){
  const P=DB.products(),old=editId?DB.txs().find(x=>x.id===editId):null;
  const st=old?{...old,input:old.metodeInput==='liter'?old.liter:old.nominal,mode:old.metodeInput}:{id:null,tanggal:today(),produk:'Pertalite',mode:'nominal',input:'',hargaJual:P.Pertalite.jual,hargaModal:P.Pertalite.modal};
  $('#app').innerHTML=`<h1>${old?'Edit Transaksi':'Tambah Penjualan'}</h1><div class="card">
  <label>Cara Input</label><div class="seg"><button id="m-nominal">Berdasarkan Nominal</button><button id="m-liter">Berdasarkan Liter</button></div>
  <label>Produk</label><div class="seg"><button id="p-Pertalite">Pertalite</button><button id="p-Pertamax">Pertamax</button></div>
  <label id="inl"></label><input id="inp" inputmode="decimal" autocomplete="off" placeholder="0">
  <div class="row"><div><label>Harga Jual/Liter (Rp)</label><input id="hj" inputmode="decimal"></div><div><label>Harga Modal/Liter (Rp)</label><input id="hm" inputmode="decimal"></div></div>
  <label>Tanggal</label><input id="tg" type="date"></div>
  <div class="card sum"><b>Ringkasan</b><div class="grid"><div><div class="lbl">Nominal Penjualan</div><div class="val" id="s-n"></div></div><div><div class="lbl">Liter</div><div class="val a" id="s-l"></div></div><div><div class="lbl">Modal</div><div class="val" id="s-m"></div></div><div><div class="lbl">Keuntungan</div><div class="val g" id="s-u"></div></div></div><div class="lbl" id="s-g" style="margin-top:10px"></div></div>
  <div style="margin-top:14px"><button class="pri" id="save">SIMPAN TRANSAKSI</button></div>`;
  const upd=()=>{
    ['nominal','liter'].forEach(m=>$('#m-'+m).className=st.mode===m?'on':'');['Pertalite','Pertamax'].forEach(p=>$('#p-'+p).className=st.produk===p?'on':'');
    $('#inl').textContent=st.mode==='nominal'?'Nominal Penjualan (Rp)':'Liter Terjual (L)';
    const c=calc(st.mode,num(st.input),num(st.hargaJual),num(st.hargaModal));
    $('#s-n').textContent=rp(c.nominal);$('#s-l').textContent=lt(c.liter);$('#s-m').textContent=rp(c.modal);$('#s-u').textContent=rp(c.keuntungan);
    $('#s-g').textContent='Margin '+(c.nominal>0?(c.keuntungan/c.nominal*100).toFixed(1):'0.0')+'%';return c;
  };
  $('#inp').value=st.input;$('#hj').value=st.hargaJual;$('#hm').value=st.hargaModal;$('#tg').value=st.tanggal;
  $('#m-nominal').onclick=()=>{st.mode='nominal';st.input='';$('#inp').value='';upd()};
  $('#m-liter').onclick=()=>{st.mode='liter';st.input='';$('#inp').value='';upd()};
  ['Pertalite','Pertamax'].forEach(p=>$('#p-'+p).onclick=()=>{st.produk=p;st.hargaJual=P[p].jual;st.hargaModal=P[p].modal;$('#hj').value=st.hargaJual;$('#hm').value=st.hargaModal;upd()});
  $('#inp').oninput=e=>{st.input=e.target.value;upd()};$('#hj').oninput=e=>{st.hargaJual=e.target.value;upd()};$('#hm').oninput=e=>{st.hargaModal=e.target.value;upd()};$('#tg').onchange=e=>st.tanggal=e.target.value;
  upd();
  $('#save').onclick=()=>{
    if(!(num(st.input)>0))return toast('Isi '+(st.mode==='nominal'?'nominal':'liter')+' dulu');
    if(!(num(st.hargaJual)>0))return toast('Harga jual harus lebih dari 0');
    if(!st.tanggal)return toast('Pilih tanggal');
    const c=upd();
    DB.saveTx({id:st.id||('t'+Date.now()+Math.random().toString(36).slice(2,6)),tanggal:st.tanggal,produk:st.produk,metodeInput:st.mode,nominal:c.nominal,liter:c.liter,hargaJual:num(st.hargaJual),hargaModal:num(st.hargaModal),modal:c.modal,keuntungan:c.keuntungan});
    toast(old?'Transaksi diperbarui':'Transaksi tersimpan');
    if(old)location.hash='hist';else{st.input='';$('#inp').value='';upd();$('#inp').focus()}
  };
}
/* ===== Riwayat ===== */
function vHist(){
  const f=DB.get('filter',{d:'',p:''});
  const a=DB.txs().filter(t=>(!f.d||t.tanggal===f.d)&&(!f.p||t.produk===f.p)).sort((x,y)=>y.tanggal.localeCompare(x.tanggal)||y.id.localeCompare(x.id));
  $('#app').innerHTML=`<h1>Riwayat</h1><div class="card"><div class="row"><div><label>Tanggal</label><input type="date" id="fd" value="${f.d}"></div><div><label>Produk</label><select id="fp"><option value="">Semua</option><option ${f.p==='Pertalite'?'selected':''}>Pertalite</option><option ${f.p==='Pertamax'?'selected':''}>Pertamax</option></select></div></div></div>
  <h2>${a.length} transaksi · Omzet ${rp(sum(a).n)} · Untung ${rp(sum(a).u)}</h2>
  ${a.length?`<div class="card cards">${a.map(t=>`<div class="lbl" style="padding:10px 14px 0">${tgl(t.tanggal)}</div>`+itemHtml(t)).join('')}</div>
  <div class="card tbl"><table><tr><th>Tanggal</th><th>Produk</th><th>Nominal</th><th>Liter</th><th>Harga Jual</th><th>Harga Modal</th><th>Modal</th><th>Keuntungan</th><th>Aksi</th></tr>${a.map(t=>`<tr><td>${tgl(t.tanggal)}</td><td>${t.produk}</td><td>${rp(t.nominal)}</td><td>${lt(t.liter)}</td><td>${rp(t.hargaJual)}</td><td>${rp(t.hargaModal)}</td><td>${rp(t.modal)}</td><td class="g">${rp(t.keuntungan)}</td><td><button class="sm" data-e="${t.id}">Edit</button> <button class="sm dng" data-d="${t.id}">Hapus</button></td></tr>`).join('')}</table></div>`:'<div class="card empty">Tidak ada transaksi yang cocok.</div>'}`;
  $('#fd').onchange=e=>{f.d=e.target.value;DB.set('filter',f);vHist()};$('#fp').onchange=e=>{f.p=e.target.value;DB.set('filter',f);vHist()};bindActs();
}
/* ===== Laporan ===== */
function bars(title,vals,labels,color,fmt){
  const mx=Math.max(1,...vals.map(Math.abs));
  return `<div class="card chart"><b>${title}</b><div class="bars" style="margin-top:12px">${vals.map((v,i)=>`<i title="${labels[i]}: ${fmt(v)}" style="height:${Math.max(2,Math.abs(v)/mx*100)}%;background:${v<0?'var(--red)':color}"></i>`).join('')}</div><div class="cl"><span>${labels[0]||''}</span><span>Maks ${fmt(mx)}</span><span>${labels[labels.length-1]||''}</span></div></div>`;
}
let repTab='day',repDay=today(),repMon=today().slice(0,7);
function vRep(){
  const all=DB.txs();
  let h=`<h1>Laporan</h1><div class="tabs"><button id="td" class="${repTab==='day'?'on':''}">Harian</button><button id="tm" class="${repTab==='mon'?'on':''}">Bulanan</button></div>`;
  if(repTab==='day'){
    const t=all.filter(x=>x.tanggal===repDay),s=sum(t),pt=byProd(t,'Pertalite'),px=byProd(t,'Pertamax');
    h+=`<div class="card"><label>Pilih tanggal</label><input type="date" id="rd" value="${repDay}"></div><h2>${tgl(repDay)}</h2>
    <div class="grid s4">${stat('Total transaksi',s.c+' transaksi')}${stat('Total Pertalite',rp(pt.n))}${stat('Total Pertamax',rp(px.n))}${stat('Total omzet',rp(s.n))}${stat('Total modal',rp(s.m))}${stat('Total keuntungan',rp(s.u),'g')}${stat('Total liter',lt(s.l),'a')}</div>`;
  }else{
    const [y,m]=repMon.split('-').map(Number),dim=new Date(y,m,0).getDate(),t=all.filter(x=>x.tanggal.startsWith(repMon)),s=sum(t),pt=byProd(t,'Pertalite'),px=byProd(t,'Pertamax');
    const days=[...Array(dim)].map((_,i)=>sum(t.filter(x=>+x.tanggal.slice(8)===i+1))),lb=days.map((_,i)=>String(i+1));
    h+=`<div class="card"><label>Pilih bulan</label><input type="month" id="rm" value="${repMon}"></div><h2>${BLN[m-1]} ${y}</h2>
    <div class="grid s4">${stat('Total transaksi',s.c)}${stat('Total omzet',rp(s.n))}${stat('Total modal',rp(s.m))}${stat('Total keuntungan',rp(s.u),'g')}${stat('Liter Pertalite',lt(pt.l))}${stat('Liter Pertamax',lt(px.l))}${stat('Total liter',lt(s.l),'a')}${stat('Hari aktif',days.filter(d=>d.c).length+' hari')}</div>
    <div class="grid" style="margin-top:12px;grid-template-columns:1fr">${bars('Omzet per hari',days.map(d=>d.n),lb,'var(--amb)',rp)}${bars('Keuntungan per hari',days.map(d=>d.u),lb,'var(--grn)',rp)}${bars('Liter terjual per hari',days.map(d=>d.l),lb,'#5aa9ff',lt)}${bars('Pertalite vs Pertamax (omzet)',[pt.n,px.n],['Pertalite','Pertamax'],'var(--amb)',rp)}</div>`;
  }
  $('#app').innerHTML=h;$('#td').onclick=()=>{repTab='day';vRep()};$('#tm').onclick=()=>{repTab='mon';vRep()};
  if($('#rd'))$('#rd').onchange=e=>{repDay=e.target.value||today();vRep()};if($('#rm'))$('#rm').onchange=e=>{repMon=e.target.value||today().slice(0,7);vRep()};
}
const stat=(l,v,c='')=>`<div class="card"><div class="lbl">${l}</div><div class="val ${c}">${v}</div></div>`;
/* ===== Pengaturan, backup, export ===== */
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();a.remove()}
const COLS=['id','tanggal','produk','metodeInput','nominal','liter','hargaJual','hargaModal','modal','keuntungan'];
function pickFile(accept,cb){const i=document.createElement('input');i.type='file';i.accept=accept;i.onchange=()=>{const f=i.files[0];if(!f)return;const r=new FileReader();r.onload=()=>cb(String(r.result));r.readAsText(f)};i.click()}
const valid=t=>t&&t.id&&/^\d{4}-\d{2}-\d{2}$/.test(t.tanggal)&&['Pertalite','Pertamax'].includes(t.produk)&&isFinite(t.nominal)&&isFinite(t.liter)&&isFinite(t.modal);
function mergeTxs(list){const ok=list.filter(valid);DB.saveMany(ok);return ok.length}
function vSet(){
  const P=DB.products();
  $('#app').innerHTML=`<h1>Pengaturan</h1><div class="card"><b>Akun dan Sinkronisasi</b><p class="lbl">${esc(SB.ses().email)} · ${DB.err?'⚠ '+esc(DB.err):(DB.pend().length?DB.pend().length+' perubahan menunggu':'Tersinkron')}</p><div class="row" style="margin-top:10px"><button id="sy">Sinkronkan sekarang</button><button id="out">Keluar</button></div></div><div style="height:14px"></div><div class="card"><b>Harga BBM (default)</b><p class="lbl">Dipakai sebagai nilai awal form. Mengubahnya tidak mengubah transaksi lama.</p>
  ${['Pertalite','Pertamax'].map(p=>`<h2>${p}</h2><div class="row"><div><label>Harga jual/L</label><input id="j${p}" inputmode="numeric" value="${P[p].jual}"></div><div><label>Harga modal/L</label><input id="m${p}" inputmode="numeric" value="${P[p].modal}"></div></div>`).join('')}
  <div style="margin-top:14px"><button class="pri" id="sp">Simpan harga</button></div></div>
  <h2>Backup dan Export</h2><div class="card"><div class="grid"><button id="ec">Export CSV</button><button id="ic">Import CSV</button><button id="bj">Backup JSON</button><button id="rj">Restore JSON</button></div>
  <div style="margin-top:12px"><button class="dng" style="width:100%" id="wipe">Hapus Semua Data</button></div><p class="lbl" style="margin-top:12px">${DB.txs().length} transaksi tersimpan di perangkat ini. Backup berkala disarankan.</p></div>`;
  $('#sy').onclick=async()=>{await DB.sync();toast(DB.err?'Gagal: '+DB.err:'Tersinkron');vSet()};
  $('#out').onclick=()=>confirmBox('Keluar dari akun?',DB.pend().length?'Ada '+DB.pend().length+' perubahan yang belum terkirim dan akan hilang dari perangkat ini.':'Data di perangkat ini dihapus, data online tetap aman.','Keluar',()=>{['transactions','products','pend','session','filter'].forEach(k=>localStorage.removeItem('pm_'+k));route()});
  $('#sp').onclick=()=>{const n={};for(const p of ['Pertalite','Pertamax']){n[p]={jual:num($('#j'+p).value),modal:num($('#m'+p).value)};if(!(n[p].jual>0))return toast('Harga jual '+p+' tidak valid')}DB.saveProducts(n);toast('Harga disimpan')};
  $('#ec').onclick=()=>{const a=DB.txs();if(!a.length)return toast('Belum ada data');download('pom-mini-'+today()+'.csv',[COLS.join(',')].concat(a.map(t=>COLS.map(c=>t[c]).join(','))).join('\n'),'text/csv')};
  $('#ic').onclick=()=>pickFile('.csv,text/csv',txt=>{const L=txt.trim().split(/\r?\n/),hd=L.shift().split(',').map(s=>s.trim());const rows=L.map(l=>{const v=l.split(','),o={};hd.forEach((c,i)=>o[c]=['nominal','liter','hargaJual','hargaModal','modal','keuntungan'].includes(c)?parseFloat(v[i]):(v[i]||'').trim());return o});toast(mergeTxs(rows)+' transaksi diimpor');vSet()});
  $('#bj').onclick=()=>download('pom-mini-backup-'+today()+'.json',JSON.stringify({app:'pom-mini',products:DB.products(),transactions:DB.txs()},null,1),'application/json');
  $('#rj').onclick=()=>pickFile('.json,application/json',txt=>{try{const d=JSON.parse(txt);if(!Array.isArray(d.transactions))throw 0;confirmBox('Restore backup?','Transaksi dengan ID sama akan ditimpa, lainnya digabung.','Restore',()=>{if(d.products)DB.saveProducts(d.products);toast(mergeTxs(d.transactions)+' transaksi dipulihkan');vSet()})}catch(e){toast('File backup tidak valid')}});
  $('#wipe').onclick=()=>confirmBox('Hapus semua data?','Semua transaksi dan harga akan dihapus permanen. Buat backup dulu bila perlu.','Hapus semua',()=>{DB.wipe();toast('Semua data dihapus');route()});
}
/* ===== Start ===== */
function renderLogin(){
  document.body.classList.add('nologin');renderNav('');
  $('#app').innerHTML=`<div class="card" style="max-width:380px;margin:10vh auto 0"><h1>⛽ Pom Mini</h1><p class="lbl">Masuk agar catatan penjualan tersinkron di semua perangkat.</p>${SB.ok()?'':'<p class="lbl r">Isi js/config.js dengan URL dan key Supabase dulu.</p>'}<label>Email</label><input id="em" type="email" autocomplete="username"><label>Kata sandi</label><input id="pw" type="password" autocomplete="current-password"><div style="margin-top:16px"><button class="pri" id="go">Masuk</button></div><p class="lbl r" id="err" style="margin-top:10px"></p></div>`;
  const go=async()=>{const b=$('#go');b.disabled=true;$('#err').textContent='';
    try{if(!SB.ok())throw new Error('Konfigurasi Supabase belum diisi');await SB.login($('#em').value.trim(),$('#pw').value);boot()}
    catch(e){$('#err').textContent=/Failed to fetch/.test(e.message)?'Tidak ada koneksi internet':(/Invalid login/i.test(e.message)?'Email atau kata sandi salah':e.message);b.disabled=false}};
  $('#go').onclick=go;$('#pw').onkeydown=e=>{if(e.key==='Enter')go()};
}
function boot(){
  if(!SB.ses())return renderLogin();
  const k='pm_mig_'+SB.ses().uid;
  if(!localStorage.getItem(k)){localStorage.setItem(k,'1');if(DB.txs().length)DB.saveMany(DB.txs());if(localStorage.getItem('pm_products'))DB.saveProducts(DB.products())}
  route();DB.sync();
}
window.addEventListener('hashchange',route);
window.addEventListener('online',()=>DB.sync());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)DB.sync()});
boot();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
