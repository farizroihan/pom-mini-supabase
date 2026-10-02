'use strict';
/* Klien Supabase ringan (tanpa library): Auth + REST (PostgREST) */
const SB={
  cfg:window.POM_CONFIG||{},
  ok(){return /^https:\/\/.+\.supabase\.co/.test(this.cfg.url||'')&&this.cfg.key&&!/GANTI/.test(this.cfg.url+this.cfg.key)},
  ses(){try{return JSON.parse(localStorage.getItem('pm_session')||'null')}catch(e){return null}},
  setSes(s){s?localStorage.setItem('pm_session',JSON.stringify(s)):localStorage.removeItem('pm_session')},
  async auth(path,body){
    const r=await fetch(this.cfg.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:this.cfg.key,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error_description||d.msg||d.message||'Gagal terhubung');
    return d;
  },
  keep(d){this.setSes({access_token:d.access_token,refresh_token:d.refresh_token,exp:Date.now()+(d.expires_in-60)*1000,uid:d.user.id,email:d.user.email})},
  async login(email,pw){this.keep(await this.auth('token?grant_type=password',{email,password:pw}))},
  async token(){
    let s=this.ses();if(!s)throw new Error('Belum login');
    if(Date.now()>s.exp){this.keep(await this.auth('token?grant_type=refresh_token',{refresh_token:s.refresh_token}));s=this.ses()}
    return s.access_token;
  },
  async rest(path,opt={}){
    const t=await this.token();
    const r=await fetch(this.cfg.url+'/rest/v1/'+path,{...opt,headers:{apikey:this.cfg.key,Authorization:'Bearer '+t,'Content-Type':'application/json',...(opt.headers||{})}});
    if(!r.ok)throw new Error((await r.text()).slice(0,160)||('HTTP '+r.status));
    return r.status===204?null:await r.json().catch(()=>null);
  },
  to(t,uid){return{user_id:uid,id:t.id,tanggal:t.tanggal,produk:t.produk,metode_input:t.metodeInput,nominal:t.nominal,liter:t.liter,harga_jual:t.hargaJual,harga_modal:t.hargaModal,modal:t.modal,keuntungan:t.keuntungan}},
  from(r){return{id:r.id,tanggal:r.tanggal,produk:r.produk,metodeInput:r.metode_input,nominal:+r.nominal,liter:+r.liter,hargaJual:+r.harga_jual,hargaModal:+r.harga_modal,modal:+r.modal,keuntungan:+r.keuntungan}},
  async run(o){
    const uid=this.ses().uid,M={'Prefer':'resolution=merge-duplicates,return=minimal'};
    if(o.op==='ups')for(let i=0;i<o.txs.length;i+=500)await this.rest('transactions?on_conflict=user_id,id',{method:'POST',headers:M,body:JSON.stringify(o.txs.slice(i,i+500).map(t=>this.to(t,uid)))});
    else if(o.op==='del')await this.rest('transactions?id=eq.'+encodeURIComponent(o.id),{method:'DELETE'});
    else if(o.op==='prod')await this.rest('settings?on_conflict=user_id',{method:'POST',headers:M,body:JSON.stringify([{user_id:uid,products:o.products,updated_at:new Date().toISOString()}])});
    else if(o.op==='wipe'){await this.rest('transactions?id=not.is.null',{method:'DELETE'});await this.rest('settings?user_id=not.is.null',{method:'DELETE'})}
  }
};
