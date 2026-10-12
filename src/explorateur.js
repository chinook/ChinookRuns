const TAILLE_PAGE = 100;

const dbTables = document.getElementById('dbTables');
const dbGrid = document.getElementById('dbGrid');
const dbInfo = document.getElementById('dbInfo');
const dbPrev = document.getElementById('dbPrev');
const dbNext = document.getElementById('dbNext');
const dbSearch = document.getElementById('dbSearch');

let tables = [];
let tableCourante = null;
let page = 0;
let recherche = '';
let total = 0;
let numeroRequete = 0;
let minuterie = null;

function dessinerBoutons() {
  dbTables.replaceChildren(...tables.map(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn' + (t.nom === tableCourante ? ' primary' : '');
    b.textContent = `${t.nom} (${t.nb})`;
    b.onclick = () => { tableCourante = t.nom; page = 0; dessinerBoutons(); afficher(); };
    return b;
  }));
}

async function chargerTables() {
  tables = await window.api.listeTables();
  if (!tables.some(t => t.nom === tableCourante)) tableCourante = tables.length ? tables[0].nom : null;
  dessinerBoutons();
  if (tableCourante) afficher();
}

async function afficher() {
  const requete = ++numeroRequete;
  const resultat = await window.api.lignesTable(tableCourante, TAILLE_PAGE, page * TAILLE_PAGE, recherche);
  if (requete !== numeroRequete) return;   // une recherche plus récente est en cours
  total = resultat.total;
  const lignes = resultat.lignes;

  dbGrid.replaceChildren();
  if (!lignes.length) {
    const vide = document.createElement('p');
    vide.className = 'dead';
    vide.style.padding = '12px';
    vide.textContent = recherche ? `Aucun résultat pour « ${recherche} ».` : 'Table vide.';
    dbGrid.appendChild(vide);
  } else {
    const colonnes = Object.keys(lignes[0]);
    const table = document.createElement('table');
    const entete = table.createTHead().insertRow();
    colonnes.forEach(c => {
      const th = document.createElement('th');
      th.textContent = c;
      entete.appendChild(th);
    });
    const corps = table.createTBody();
    lignes.forEach(l => {
      const tr = corps.insertRow();
      colonnes.forEach(c => { tr.insertCell().textContent = l[c] ?? 'NULL'; });
    });
    dbGrid.appendChild(table);
  }
  dbGrid.scrollTop = 0;

  const debut = total ? page * TAILLE_PAGE + 1 : 0;
  const fin = Math.min((page + 1) * TAILLE_PAGE, total);
  dbInfo.textContent = `${tableCourante} — lignes ${debut} à ${fin} sur ${total}` +
    (recherche ? ` (filtre : « ${recherche} »)` : '');
  dbPrev.disabled = page === 0;
  dbNext.disabled = (page + 1) * TAILLE_PAGE >= total;
}

dbSearch.addEventListener('input', () => {
  clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    recherche = dbSearch.value.trim();
    page = 0;
    if (tableCourante) afficher();
  }, 250);
});

dbPrev.onclick = () => { page--; afficher(); };
dbNext.onclick = () => { page++; afficher(); };
document.getElementById('dbRefresh').onclick = chargerTables;

chargerTables();