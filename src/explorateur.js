const TAILLE_PAGE = 100;

const dbTables = document.getElementById('dbTables');
const dbGrid = document.getElementById('dbGrid');
const dbInfo = document.getElementById('dbInfo');
const dbPrev = document.getElementById('dbPrev');
const dbNext = document.getElementById('dbNext');

let tableCourante = null;
let total = 0;
let page = 0;

async function chargerTables() {
  const tables = await window.api.listeTables();
  dbTables.replaceChildren(...tables.map(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = `${t.nom} (${t.nb})`;
    b.onclick = () => { tableCourante = t.nom; total = t.nb; page = 0; afficher(); };
    return b;
  }));

  const courante = tables.find(t => t.nom === tableCourante) || tables[0];
  if (courante) { tableCourante = courante.nom; total = courante.nb; afficher(); }
}

async function afficher() {
  const lignes = await window.api.lignesTable(tableCourante, TAILLE_PAGE, page * TAILLE_PAGE);
  dbGrid.replaceChildren();

  if (!lignes.length) {
    dbGrid.textContent = 'Table vide.';
  } else {
    const colonnes = Object.keys(lignes[0]);
    const table = document.createElement('table');
    const entete = table.insertRow();
    colonnes.forEach(c => {
      const th = document.createElement('th');
      th.textContent = c;
      entete.appendChild(th);
    });
    lignes.forEach(l => {
      const tr = table.insertRow();
      colonnes.forEach(c => { tr.insertCell().textContent = l[c] ?? 'NULL'; });
    });
    dbGrid.appendChild(table);
  }

  const debut = total ? page * TAILLE_PAGE + 1 : 0;
  const fin = Math.min((page + 1) * TAILLE_PAGE, total);
  dbInfo.textContent = `${tableCourante} — lignes ${debut} à ${fin} sur ${total}`;
  dbPrev.disabled = page === 0;
  dbNext.disabled = (page + 1) * TAILLE_PAGE >= total;
}

dbPrev.onclick = () => { page--; afficher(); };
dbNext.onclick = () => { page++; afficher(); };
document.getElementById('dbRefresh').onclick = chargerTables;

chargerTables();