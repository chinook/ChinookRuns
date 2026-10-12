const COLORS=['--c1','--c2','--c3','--c4','--c5','--c6'];
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SAT=[4095,1023,65535,255,4096,1024];

const sections=()=>[...document.querySelectorAll('#page-visualiser details.card')];
document.getElementById('expandAll').onclick=()=>sections().forEach(d=>d.open=true);
document.getElementById('collapseAll').onclick=()=>sections().forEach(d=>d.open=false);
// Plotly mesure 0 px dans une section fermée : on redimensionne à l'ouverture
sections().forEach(d=>d.addEventListener('toggle',()=>{
  const id=d.dataset.plot;if(d.open&&id&&document.getElementById(id).data)Plotly.Plots.resize(id)}));

/* ---------- Statistiques ---------- */
const finite=a=>a.filter(Number.isFinite);
const median=a=>{const s=[...a].sort((x,y)=>x-y),n=s.length;return n?(n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2):NaN};
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const quant=(a,q)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(q*s.length))]};
const fmt=(x,d=2)=>Number.isFinite(x)?(Math.abs(x)>=1000?x.toFixed(0):+x.toFixed(d)).toString():'—';
function corr(a,b){const n=a.length,ma=mean(a),mb=mean(b);let sab=0,saa=0,sbb=0;
  for(let i=0;i<n;i++){const x=a[i]-ma,y=b[i]-mb;sab+=x*y;saa+=x*x;sbb+=y*y}return sab/Math.sqrt(saa*sbb)}

function spikes(v){            // médiane glissante sur 5 points, écart robuste
  const n=v.length,res=new Array(n).fill(0);
  for(let i=0;i<n;i++){const w=v.slice(Math.max(0,i-2),Math.min(n,i+3)).filter(Number.isFinite);res[i]=v[i]-median(w)}
  const ar=res.map(Math.abs).filter(Number.isFinite),mad=1.4826*median(ar);
  const f=finite(v),range=quant(f,.99)-quant(f,.01);
  const thr=Math.max(6*mad,.25*range,1e-9);
  return res.map((r,i)=>Math.abs(r)>thr?i:-1).filter(i=>i>=0);
}

/* ---------- Analyse ---------- */
let D=null;
function analyse(rows,name){
  const header=rows[0].map(h=>String(h).trim());
  const body=rows.slice(1);
  const bad=body.filter(r=>r.length!==header.length||r.some(c=>c===''||!Number.isFinite(Number(c)))).length;
  const cols={};
  header.forEach((h,j)=>cols[h]=body.map(r=>r[j]===''||r[j]==null?NaN:Number(r[j])));
  const N=body.length, tName=header.find(h=>/^(temps|time|t)(_s)?$/i.test(h))||header[0];
  const raw=cols[tName];
  const find=[];                      // {sev,t,d}
  const add=(sev,t,d)=>find.push({sev,t,d});

  // --- Temps
  let t=raw.slice(),rate=NaN;
  const dups=raw.filter((v,i)=>i>0&&v===raw[i-1]).length;
  const span=raw[N-1]-raw[0];
  if(dups>0.2*N){
    rate=N/(span||1);
    t=raw.map((_,i)=>raw[0]+i/rate);
    add('warn','Horodatage trop grossier ('+dups+' lignes sur '+N+' partagent la même seconde)',
      'Environ '+fmt(rate,1)+' échantillons/s mais le temps n\'a que 1 s de résolution. J\'ai reconstruit un temps régulier pour les graphiques. Pour corriger à la source : enregistrer millis() ou micros() au lieu de secondes entières.');
  }else{ rate=(N-1)/(span||1); }
  const dt=t.slice(1).map((v,i)=>v-t[i]),dtm=median(dt.filter(x=>x>0));
  const gaps=dt.filter(x=>x>4*dtm).length;
  if(dups<=.2*N&&gaps) add('crit','Trous dans l\'acquisition ('+gaps+')','Des intervalles plus de 4× plus longs que la normale. Cause probable : écriture SD bloquante, reset ou perte d\'alimentation.');
  if(bad) add('crit',bad+' ligne(s) corrompue(s) ou incomplète(s)','Colonnes manquantes ou valeurs non numériques. Typique d\'une coupure pendant l\'écriture SD ou d\'un buffer qui déborde.');

  // --- Canaux
  const chans=header.filter(h=>h!==tName);
  const info={};
  chans.forEach(h=>{
    const v=cols[h],f=finite(v),u=new Set(f).size;
    const zeros=f.filter(x=>x===0).length/f.length;
    const same=v.filter((x,i)=>i>0&&x===v[i-1]).length/(N-1);
    const sp=u>1?spikes(v):[];
    info[h]={v,min:Math.min(...f),max:Math.max(...f),mean:mean(f),u,zeros,same,spikes:sp,dead:u<=1};
    if(u<=1){
      const val=f[0];
      if(val===0) add('crit',h+' : toujours 0','Capteur non lu, non branché, ou valeur jamais calculée (vérifier le câblage et le code).');
      else if(SAT.includes(val)) add('crit',h+' : bloqué à '+val+' (saturation du convertisseur)','Ressemble à une entrée ADC flottante ou à un capteur débranché : '+val+' est le maximum d\'un ADC '+(Math.log2(val+1)|0)+' bits.');
      else add('warn',h+' : valeur figée à '+fmt(val),'Aucune variation sur tout l\'enregistrement. Capteur gelé, valeur codée en dur, ou grandeur non mise à jour.');
    }else{
      if(zeros>.9) add('warn',h+' : à 0 pendant '+Math.round(zeros*100)+' % du temps','Normal si le rotor/véhicule est à l\'arrêt, sinon problème de capteur.');
      if(sp.length>=3) add('info',h+' : '+sp.length+' pics isolés','Points qui s\'écartent fortement de leurs voisins (marqués en rouge sur le graphique). Parasites, rebonds de signal, ou erreur de lecture.');
    }
  });

  // --- Relations (si les colonnes existent)
  const c=n=>cols[Object.keys(cols).find(k=>k.toLowerCase()===n.toLowerCase())];
  const vent=c('vitesse_vent'),tsr=c('TSR'),rot=c('rotor_speed'),cmd=c('CMD'),wind=c('WIND');
  if(vent&&tsr){
    const idx=vent.map((_,i)=>i).filter(i=>vent[i]>.1&&tsr[i]>0);
    if(idx.length>20){
      const k=idx.map(i=>tsr[i]*vent[i]),cv=Math.sqrt(mean(k.map(x=>(x-mean(k))**2)))/mean(k);
      if(cv<.03) add('crit','TSR = '+fmt(mean(k),1)+' ÷ vitesse_vent : il ne dépend pas de la vitesse du rotor',
        'TSR×vent est quasi constant (écart '+fmt(cv*100,1)+' %). Le TSR devrait être proportionnel à rotor_speed ÷ vent. Il est probablement calculé avec une vitesse de rotor fixe ou périmée : à vérifier dans le code.');
    }
    const z=vent.filter((x,i)=>x>.1&&tsr[i]===0).length,tot=vent.filter(x=>x>.1).length;
    if(tot&&z/tot>.05) add('warn','TSR = 0 alors qu\'il y a du vent ('+z+' lignes, '+Math.round(z/tot*100)+' %)','Condition dans le code qui force le TSR à 0 ou division échouée. À comparer avec l\'état de rotor_speed.');
  }
  if(vent&&rot){
    const fast=rot.filter((x,i)=>x>0&&vent[i]<.5).length;
    const st=finite(rot).filter(x=>x>0);
    if(st.length>3){
      const d=[...new Set(st.map(x=>+x.toFixed(2)))].sort((a,b)=>a-b);
      const step=d.length>1?Math.min(...d.slice(1).map((x,i)=>x-d[i])):NaN;
      if(step>1) add('info','rotor_speed est quantifié par pas de '+fmt(step,2),'La vitesse n\'a que quelques valeurs possibles : le comptage d\'impulsions est trop grossier à basse vitesse. Mesurer le temps entre impulsions donnerait une meilleure résolution.');
    }
  }
  if(vent&&cmd&&corr(vent,cmd)>.99) add('info','CMD suit presque exactement vitesse_vent (corrélation '+fmt(corr(vent,cmd),3)+')','Soit CMD est une consigne dérivée du vent, soit c\'est une copie du même capteur. Si c\'est un 2e anémomètre, utile pour valider le 1er (écart moyen '+fmt(mean(vent.map((x,i)=>Math.abs(x-cmd[i]))),2)+').');
  if(wind){
    const out=finite(wind).filter(x=>Math.abs(x)>90).length;
    if(out>0) add('info','WIND dépasse ±90° pour '+out+' échantillons ('+Math.round(out/N*100)+' %)','Si WIND est une direction relative, le vent vient de côté/arrière ou la girouette est bruitée. Si ce n\'est pas un angle, ignorer.');
  }
  if(!find.length) add('ok','Rien d\'anormal détecté','Aucune des règles n\'a déclenché.');
  const ord={crit:0,warn:1,info:2,ok:3};find.sort((a,b)=>ord[a.sev]-ord[b.sev]);

  D={name,N,t,rate,cols,info,chans,find,tName,dur:t[N-1]-t[0]};
  render();
}

/* ---------- Affichage ---------- */
const SEV={crit:'CRITIQUE',warn:'ATTENTION',info:'INFO',ok:'OK'};
function render(){
  document.getElementById('out').classList.remove('hide');
  document.getElementById('tools').classList.remove('hide');
  document.getElementById('findHint').textContent=D.find.length+' point'+(D.find.length>1?'s':'');
  const live=D.chans.filter(h=>!D.info[h].dead),dead=D.chans.filter(h=>D.info[h].dead);
  const nCrit=D.find.filter(f=>f.sev==='crit').length;
  const st=[[D.N,'échantillons'],[fmt(D.dur/60,1)+' min','durée'],['~'+fmt(D.rate,1)+' Hz','fréquence'],
            [live.length+' / '+D.chans.length,'canaux qui varient'],[nCrit,'problèmes critiques']];
  document.getElementById('stats').innerHTML=st.map(s=>`<div class="stat"><div class="v">${s[0]}</div><div class="l">${s[1]}</div></div>`).join('');
  document.getElementById('findings').innerHTML=D.find.map(f=>
    `<div class="find"><span class="badge b-${f.sev}">${SEV[f.sev]}</span><div><div class="t">${f.t}</div><div class="d">${f.d}</div></div></div>`).join('');

  // sélecteur de canaux
  const chips=document.getElementById('chips');
  chips.innerHTML=live.map((h,i)=>`<label><input type="checkbox" data-h="${h}" checked><span class="dot" style="background:${css(COLORS[i%6])}"></span>${h}</label>`).join('');
  chips.querySelectorAll('input').forEach(i=>i.onchange=drawTimeline);
  document.getElementById('deadnote').textContent=dead.length?'Canaux sans variation (non tracés) : '+dead.join(', '):'';
  drawTimeline();

  // scatter
  const opts=live.map(h=>`<option>${h}</option>`).join('');
  const sx=document.getElementById('sx'),sy=document.getElementById('sy');
  sx.innerHTML=sy.innerHTML=opts;
  if(live.includes('vitesse_vent'))sx.value='vitesse_vent';
  sy.value=live.includes('rotor_speed')?'rotor_speed':live[Math.min(1,live.length-1)];
  sx.onchange=sy.onchange=document.getElementById('colt').onchange=drawScatter;
  drawScatter();

  // tableau santé
  const rowsH=D.chans.map(h=>{const i=D.info[h];
    return `<tr><td>${h}</td><td>${fmt(i.min)}</td><td>${fmt(i.max)}</td><td>${fmt(i.mean)}</td><td>${i.u}</td>
      <td>${Math.round(i.zeros*100)} %</td><td>${Math.round(i.same*100)} %</td><td>${i.spikes.length}</td></tr>`}).join('');
  document.getElementById('health').innerHTML=`<table><thead><tr><th>Canal</th><th>min</th><th>max</th><th>moyenne</th><th>valeurs distinctes</th><th>% zéros</th><th>% répété</th><th>pics</th></tr></thead><tbody>${rowsH}</tbody></table>`;
}

function baseLayout(){
  const ink=css('--ink'),line=css('--line');
  return {paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{color:ink,size:12},
    margin:{l:60,r:16,t:10,b:44},hoverlabel:{namelength:-1},_line:line};
}

function drawTimeline(){
  const sel=[...document.querySelectorAll('#chips input:checked')].map(i=>i.dataset.h);
  const live=D.chans.filter(h=>!D.info[h].dead);
  const L=baseLayout(),n=sel.length;if(!n){Plotly.purge('timeline');return}
  const gap=.025,h=(1-gap*(n-1))/n;
  const layout={...L,height:Math.max(260,n*130+50),hovermode:'x unified',showlegend:false,
    xaxis:{title:'temps (s)',gridcolor:L._line,anchor:'y'+(n>1?n:''),zeroline:false}};
  const traces=[];
  sel.forEach((hn,k)=>{
    const ax=n-k,key=ax===1?'y':'y'+ax;                // premier canal en haut
    const dom=[1-(k+1)*h-k*gap,1-k*(h+gap)];
    layout['yaxis'+(ax===1?'':ax)]={domain:dom,title:{text:hn,font:{size:11}},gridcolor:L._line,zeroline:false,automargin:true};
    const col=css(COLORS[live.indexOf(hn)%6]),i=D.info[hn];
    traces.push({x:D.t,y:i.v,type:'scattergl',mode:'lines',name:hn,line:{color:col,width:1.3},yaxis:key,xaxis:'x'});
    if(i.spikes.length)traces.push({x:i.spikes.map(j=>D.t[j]),y:i.spikes.map(j=>i.v[j]),type:'scattergl',mode:'markers',
      name:hn+' (pic)',marker:{color:css('--crit'),size:6},yaxis:key,xaxis:'x',hoverinfo:'skip'});
  });
  layout.xaxis.anchor='y';
  Plotly.react('timeline',traces,layout,{responsive:true,displaylogo:false});
}

function drawScatter(){
  const x=document.getElementById('sx').value,y=document.getElementById('sy').value;
  const L=baseLayout(),byT=document.getElementById('colt').checked;
  const mk={size:5,opacity:.65,color:byT?D.t:css('--c1')};
  if(byT)Object.assign(mk,{colorscale:'Viridis',colorbar:{title:'s',thickness:10}});
  Plotly.react('scatter',[{x:D.info[x].v,y:D.info[y].v,mode:'markers',type:'scattergl',marker:mk,
    text:D.t.map(v=>'t = '+fmt(v,1)+' s'),hovertemplate:x+': %{x}<br>'+y+': %{y}<br>%{text}<extra></extra>'}],
    {...L,height:380,xaxis:{title:x,gridcolor:L._line},yaxis:{title:y,gridcolor:L._line}},{responsive:true,displaylogo:false});
}

// pour tests / console : analyseTexte(csv)
window.analyseTexte=t=>analyse(t.split(/\r?\n/).filter(l=>l.trim()).map(l=>l.split(',')),'test');