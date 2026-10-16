/* Page LIVE : lit les paquets reçus par le récepteur LoRa (port série USB) ou une simulation.
   Format attendu : une ligne CSV par paquet, avec une ligne d'en-tête au début
     temps_s,vitesse_vent,rotor_speed,...,seq,rssi,snr
   Les colonnes seq / rssi / snr (facultatives) servent à la qualité de la liaison. */

const LV_META = /^(seq|pkt|rssi|snr)$/i;
const LV_MAX_LIGNES = 100000;
const LV_SILENCE_S = 5;             // alerte si aucun paquet depuis ce délai

const lv = {
  mode: null,                       // 'serial' | 'sim'
  tempsLocal: false,                // true si les paquets n'ont pas de temps_s
  port: null, reader: null, fermeture: null, simTimer: null,
  cols: [], lignes: [],
  debut: 0, dernierPaquet: 0, nbPaquets: 0, perdus: 0, derniereSeq: null,
  brut: [], dessinTimer: null,
};

const $lv = id => document.getElementById(id);
const lvCol = nom => lv.cols.findIndex(c => c.toLowerCase() === nom);

/* ---------- Réception ---------- */
function lvLigne(texte) {
  const ligne = texte.trim();
  if (!ligne || ligne.startsWith('#')) return;
  lv.brut.push(ligne);
  if (lv.brut.length > 200) lv.brut.shift();

  const jetons = ligne.split(',').map(s => s.trim());
  if (!Number.isFinite(Number(jetons[0])) || jetons[0] === '') {
    // la première valeur n'est pas un nombre : c'est une ligne d'en-tête (ou du bruit)
    const nouvelle = jetons.join() !== lv.cols.join();
    if (nouvelle && jetons.length > 1) {
      lv.tempsLocal = !jetons.some(c => c.toLowerCase() === 'temps_s');    // sinon on horodate à la réception
      lv.cols = lv.tempsLocal ? ['temps_s', ...jetons] : jetons;
      lv.lignes = [];
      lvChips();
    }
    return;
  }
  const nombres = jetons.map(j => j === '' ? NaN : Number(j));   // capteur absent = trou, pas une erreur
  if (!lv.cols.length) {                                          // aucun en-tête reçu : colonnes génériques
    lv.tempsLocal = false;
    lv.cols = ['temps_s', ...nombres.slice(1).map((_, i) => 'canal' + (i + 1))];
    lvChips();
  }
  if (nombres.length !== lv.cols.length - (lv.tempsLocal ? 1 : 0)) return;   // paquet incomplet : ignoré

  const maintenant = Date.now();
  if (!lv.debut) lv.debut = maintenant;
  if (lv.tempsLocal) nombres.unshift((maintenant - lv.debut) / 1000);

  const iSeq = lvCol('seq');
  if (iSeq >= 0) {
    const s = nombres[iSeq];
    if (lv.derniereSeq !== null && s > lv.derniereSeq + 1) lv.perdus += s - lv.derniereSeq - 1;
    lv.derniereSeq = s;
  }
  lv.nbPaquets++;
  lv.dernierPaquet = maintenant;
  lv.lignes.push(nombres);
  if (lv.lignes.length > LV_MAX_LIGNES) lv.lignes.shift();
}

/* ---------- Port série (Web Serial) ---------- */
async function lvConnecter() {
  if (!('serial' in navigator)) { alert("Le port série n'est pas disponible dans cette fenêtre."); return; }
  try {
    lv.port = await navigator.serial.requestPort();
    await lv.port.open({ baudRate: Number($lv('lvBaud').value) });
  } catch (e) {
    if (e.name !== 'NotFoundError') alert('Connexion impossible : ' + e.message);
    lv.port = null;
    return;
  }
  lvDemarrer('serial');

  const decodeur = new TextDecoderStream();
  lv.fermeture = lv.port.readable.pipeTo(decodeur.writable).catch(() => {});
  lv.reader = decodeur.readable.getReader();
  let tampon = '';
  try {
    for (;;) {
      const { value, done } = await lv.reader.read();
      if (done) break;
      tampon += value;
      const morceaux = tampon.split(/\r?\n/);
      tampon = morceaux.pop();
      morceaux.forEach(lvLigne);
    }
  } catch (e) {
    lvAlerte('Liaison série interrompue : ' + e.message);   // câble débranché, par exemple
  }
  lvArreter();
}

/* ---------- Simulation ---------- */
function lvSimuler() {
  lvDemarrer('sim');
  lv.cols = []; lv.lignes = [];
  lvLigne('temps_s,vitesse_vehicule,vitesse_vent,rotor_speed,pitch_degree,TSR,seq,rssi,snr');
  let seq = 0, t = 0;
  lv.simTimer = setInterval(() => {
    t += 0.5; seq++;
    if (Math.random() < 0.04) return;                       // paquet perdu (le seq saute)
    const vent = Math.max(.3, 6 + 1.5 * Math.sin(t / 25) + (Math.random() - .5));
    const rot = Math.max(0, vent * 5.2 / 1.5 * 60 / (2 * Math.PI) * (1 + (Math.random() - .5) * .08));
    const tsr = rot * 2 * Math.PI / 60 * 1.5 / vent;
    lvLigne([t.toFixed(1), (2 + t / 30).toFixed(2), vent.toFixed(2), rot.toFixed(1),
      (10 + 3 * Math.sin(t / 60)).toFixed(2), tsr.toFixed(2), seq,
      Math.round(-95 + 6 * (Math.random() - .5)), (7 + 2 * (Math.random() - .5)).toFixed(1)].join(','));
  }, 500);
}

/* ---------- Démarrage / arrêt ---------- */
function lvDemarrer(mode) {
  lvAlerte('');
  Object.assign(lv, { mode, debut: 0, dernierPaquet: 0, nbPaquets: 0, perdus: 0, derniereSeq: null, brut: [] });
  if (mode === 'serial') { lv.cols = []; lv.lignes = []; }
  $lv('lvConnecter').classList.add('hide');
  $lv('lvSimuler').classList.add('hide');
  $lv('lvArreter').classList.remove('hide');
  $lv('lvBaud').disabled = true;
  lvEtat();
  clearInterval(lv.dessinTimer);
  lv.dessinTimer = setInterval(lvDessiner, 500);
}

async function lvArreter() {
  clearInterval(lv.simTimer);
  const { reader, fermeture, port } = lv;
  Object.assign(lv, { mode: null, reader: null, fermeture: null, port: null });
  try { if (reader) await reader.cancel(); } catch {}
  try { if (fermeture) await fermeture; } catch {}
  try { if (port) await port.close(); } catch {}
  clearInterval(lv.dessinTimer);
  $lv('lvConnecter').classList.remove('hide');
  $lv('lvSimuler').classList.remove('hide');
  $lv('lvArreter').classList.add('hide');
  $lv('lvBaud').disabled = false;
  lvEtat();
  lvDessiner();
}

function lvAlerte(msg) {
  $lv('lvAlerte').textContent = msg;
  $lv('lvAlerte').classList.toggle('hide', !msg);
}

function lvEtat() {
  const b = $lv('lvEtat');
  const [txt, cls] = lv.mode === 'serial' ? ['EN DIRECT', 'b-ok'] : lv.mode === 'sim' ? ['SIMULATION', 'b-warn'] : ['DÉCONNECTÉ', 'b-info'];
  b.textContent = txt;
  b.className = 'badge ' + cls;
}

/* ---------- Affichage ---------- */
function lvChips() {
  const donnees = lv.cols.filter(c => !LV_META.test(c) && c.toLowerCase() !== 'temps_s');
  $lv('lvChips').innerHTML = donnees.map((h, i) =>
    `<label><input type="checkbox" data-h="${h}" ${i < 4 ? 'checked' : ''}><span class="dot" style="background:${css(COLORS[i % 6])}"></span>${h}</label>`).join('');
  $lv('lvChips').querySelectorAll('input').forEach(i => i.onchange = lvGraphe);
}

function lvTuile(valeur, libelle, vieux) {
  return `<div class="stat${vieux ? ' vieux' : ''}"><div class="v">${valeur}</div><div class="l">${libelle}</div></div>`;
}

function lvDessiner() {
  const n = lv.lignes.length;
  const age = lv.dernierPaquet ? (Date.now() - lv.dernierPaquet) / 1000 : null;
  const vieux = lv.mode && age !== null && age > LV_SILENCE_S;

  if (lv.mode && age !== null) lvAlerte(vieux ? `Aucun paquet reçu depuis ${Math.round(age)} s : vérifie l'émetteur, l'antenne ou la portée.` : '');
  $lv('lvCompteur').textContent = n ? `${lv.nbPaquets} paquets` : '';
  $lv('lvBrut').textContent = lv.brut.join('\n');
  $lv('lvEnregistrer').disabled = $lv('lvVider').disabled = !n;
  $lv('lvSession').textContent = n
    ? `${n} échantillons, ${fmt(lv.lignes[n - 1][0] - lv.lignes[0][0], 0)} s`
    : 'aucune donnée';
  if (!n) return;

  const derniere = lv.lignes[n - 1];
  $lv('lvTuiles').innerHTML = lv.cols.map((c, j) => LV_META.test(c) || j === lvCol('temps_s') ? '' : lvTuile(fmt(derniere[j]), c, vieux)).join('');

  const iR = lvCol('rssi'), iS = lvCol('snr');
  const total = lv.nbPaquets + lv.perdus;
  const liaison = [];
  if (iR >= 0) liaison.push(lvTuile(fmt(derniere[iR], 0) + ' <span class="u">dBm</span>', 'RSSI (force du signal)', vieux));
  if (iS >= 0) liaison.push(lvTuile(fmt(derniere[iS], 1) + ' <span class="u">dB</span>', 'SNR (rapport signal/bruit)', vieux));
  if (lvCol('seq') >= 0) liaison.push(lvTuile(total ? fmt(lv.perdus / total * 100, 1) + ' %' : '—', `paquets perdus (${lv.perdus} sur ${total})`, false));
  liaison.push(lvTuile(age === null ? '—' : fmt(age, 1) + ' s', 'depuis le dernier paquet', false));
  $lv('lvLiaison').innerHTML = liaison.join('');

  if (!$lv('lvPause').checked) lvGraphe();
}

function lvGraphe() {
  const sel = [...document.querySelectorAll('#lvChips input:checked')].map(i => i.dataset.h);
  const n = sel.length;
  if (!n || !lv.lignes.length) { Plotly.purge('lvGraph'); return; }

  const fin = lv.lignes[lv.lignes.length - 1][0], debut = fin - Number($lv('lvFenetre').value);
  let i0 = lv.lignes.length - 1;
  while (i0 > 0 && lv.lignes[i0 - 1][0] >= debut) i0--;
  const vue = lv.lignes.slice(i0), x = vue.map(l => l[0]);

  const H = tailleCanal(), L = baseLayout(), gap = .03, h = (1 - gap * (n - 1)) / n;
  const layout = { ...L, height: Math.max(260, n * H + 70), hovermode: 'x unified', showlegend: false,
    uirevision: 'live', xaxis: { title: 'temps (s)', gridcolor: L._line, anchor: 'y', zeroline: false, range: [Math.max(debut, x[0]), fin] } };
  $lv('lvGraph').style.height = layout.height + 'px';   // sans ça la carte garde 0 px et le graphique déborde dessus
  const traces = [];
  sel.forEach((nom, k) => {
    const ax = n - k, cle = ax === 1 ? 'y' : 'y' + ax;
    layout['yaxis' + (ax === 1 ? '' : ax)] = { domain: [1 - (k + 1) * h - k * gap, 1 - k * (h + gap)],
      title: { text: nom, font: { size: 11 } }, gridcolor: L._line, zeroline: false, automargin: true, nticks: nbGraduations(H) };
    const j = lv.cols.indexOf(nom);
    traces.push({ x, y: vue.map(l => l[j]), type: 'scattergl', mode: 'lines', name: nom,
      line: { color: css(COLORS[lv.cols.filter(c => !LV_META.test(c) && c.toLowerCase() !== 'temps_s').indexOf(nom) % 6]), width: 1.4 },
      xaxis: 'x', yaxis: cle });
  });
  Plotly.react('lvGraph', traces, layout, { responsive: true, displaylogo: false });
}

/* ---------- Session ---------- */
async function lvEnregistrer() {
  if (lv.lignes.length < MIN_LIGNES) { alert(`Il faut au moins ${MIN_LIGNES} échantillons pour enregistrer.`); return; }
  const maintenant = new Date();
  const horodatage = maintenant.toISOString().slice(0, 16).replace('T', ' ');
  const res = await window.api.importerCourse({
    nom: `LIVE ${horodatage}`,
    date: maintenant.toISOString().slice(0, 10),
    lieu: null,
    notes: lv.mode === 'sim' ? 'Session simulée' : 'Session enregistrée en direct (LoRa)',
    fichierSource: `LIVE ${horodatage} (${lv.lignes.length} lignes)`,
    entetes: lv.cols,
    colTemps: Math.max(0, lvCol('temps_s')),
    lignes: lv.lignes.map(l => l.map(v => Number.isFinite(v) ? v : null)),
  });
  alert(res.doublon ? 'Cette session est déjà dans la base.' : 'Session enregistrée dans la base de données.');
  await chargerCourses();
  await chargerTables();
}

function lvVider() {
  if (lv.lignes.length && !confirm('Effacer les données de cette session (non enregistrées) ?')) return;
  Object.assign(lv, { lignes: [], nbPaquets: 0, perdus: 0, derniereSeq: null, debut: 0, brut: [] });
  $lv('lvTuiles').textContent = '';
  $lv('lvLiaison').textContent = '';
  Plotly.purge('lvGraph');
  lvDessiner();
}

$lv('lvConnecter').onclick = lvConnecter;
$lv('lvSimuler').onclick = lvSimuler;
$lv('lvArreter').onclick = lvArreter;
$lv('lvEnregistrer').onclick = lvEnregistrer;
$lv('lvVider').onclick = lvVider;
$lv('lvFenetre').onchange = lvGraphe;
initTaille('lvHauteur', lvGraphe);
$lv('lvPause').onchange = lvGraphe;
document.querySelectorAll('#page-live details[data-live-plot]').forEach(d =>
  d.addEventListener('toggle', () => { if (d.open && $lv(d.dataset.livePlot).data) Plotly.Plots.resize($lv(d.dataset.livePlot)); }));
