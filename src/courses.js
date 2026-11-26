const listeEl = document.getElementById('listeCourses');

function bouton(texte, classe, action) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn' + (classe ? ' ' + classe : '');
  b.textContent = texte;
  b.onclick = action;
  return b;
}

function champ(type, valeur) {
  const i = document.createElement('input');
  i.type = type;
  i.value = valeur ?? '';
  return i;
}

function zoneTexte(valeur) {
  const t = document.createElement('textarea');
  t.value = valeur ?? '';
  t.placeholder = 'Notes sur cette course…';
  return t;
}

const courseSearch = document.getElementById('courseSearch');
const courseInfo = document.getElementById('courseInfo');
const viderBtn = document.getElementById('viderBtn');
let toutesCourses = [];
const dossierNom = document.getElementById('dossierNom');
const dossierDeplacer = document.getElementById('dossierDeplacer');
const selection = new Set();          // ids des courses cochées
const replies = new Set();            // dossiers repliés ('' : sans dossier)

// minuscules et sans accents : « gaspesie » trouve « Gaspésie »
const simplifier = s => String(s ?? '').normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();

async function chargerCourses() {
  toutesCourses = await window.api.listeCourses();
  toutesCourses.sort((a, b) =>
    (a.date || '').localeCompare(b.date || '') ||
    a.nom.localeCompare(b.nom, undefined, { numeric: true }));
  const ids = new Set(toutesCourses.map(c => c.id));
  selection.forEach(id => { if (!ids.has(id)) selection.delete(id); });
  const dossiers = [...new Set(toutesCourses.map(c => c.dossier).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  document.getElementById('listeDossiers').replaceChildren(...dossiers.map(d => new Option(d, d)));
  dessinerCourses();
}

function majSelection() {
  dossierDeplacer.disabled = !selection.size;
  dossierDeplacer.textContent = selection.size ? `Déplacer la sélection (${selection.size})` : 'Déplacer la sélection';
}

function caseACocher(cochee, action) {
  const i = document.createElement('input');
  i.type = 'checkbox';
  i.checked = cochee;
  i.onchange = () => action(i.checked);
  return i;
}

// Ligne d'en-tête d'un dossier : cocher tout le dossier, ou le replier en cliquant sur son nom
function ligneDossier(nom, courses, ouvert) {
  const tr = document.createElement('tr');
  tr.className = 'ligne-dossier';
  tr.insertCell().appendChild(caseACocher(courses.every(c => selection.has(c.id)), coche => {
    courses.forEach(c => coche ? selection.add(c.id) : selection.delete(c.id));
    dessinerCourses();
  }));
  const cellule = tr.insertCell();
  cellule.colSpan = 5;
  cellule.appendChild(bouton(`${ouvert ? '▾' : '▸'} ${nom || 'Sans dossier'} (${courses.length})`, '', () => {
    if (!replies.delete(nom)) replies.add(nom);
    dessinerCourses();
  }));
  return tr;
}

async function deplacerSelection() {
  if (!selection.size) return;
  await window.api.deplacerCourses([...selection], dossierNom.value.trim() || null);
  selection.clear();
  dossierNom.value = '';
  await chargerCourses();
  await chargerTables();
}

function dessinerCourses() {
  const terme = simplifier(courseSearch.value.trim());
  const courses = terme
    ? toutesCourses.filter(c => [c.nom, c.date, c.lieu, c.dossier, c.notes].some(v => simplifier(v).includes(terme)))
    : toutesCourses;

  courseInfo.textContent = terme
    ? `${courses.length} sur ${toutesCourses.length} courses`
    : `${toutesCourses.length} course${toutesCourses.length > 1 ? 's' : ''}`;
  viderBtn.disabled = !toutesCourses.length;
  majSelection();

  listeEl.replaceChildren();
  if (!toutesCourses.length) { listeEl.textContent = 'Aucune course dans la base.'; return; }
  if (!courses.length) {
    listeEl.textContent = `Aucune course ne correspond à « ${courseSearch.value.trim()} ».`;
    return;
  }

  const table = document.createElement('table');
  const entete = table.createTHead().insertRow();
  ['', 'Nom', 'Date', 'Lieu', 'Notes', ''].forEach(texte => {
    const th = document.createElement('th');
    th.textContent = texte;
    entete.appendChild(th);
  });
  const corps = table.createTBody();
  // dossiers en ordre alphabétique, « sans dossier » à la fin ; sans aucun dossier, la liste reste simple
  const groupes = new Map();
  courses.forEach(c => {
    const d = c.dossier || '';
    if (!groupes.has(d)) groupes.set(d, []);
    groupes.get(d).push(c);
  });
  const noms = [...groupes.keys()].sort((a, b) => !a - !b || a.localeCompare(b, undefined, { numeric: true }));
  const avecDossiers = toutesCourses.some(c => c.dossier);
  noms.forEach(nom => {
    const ouvert = !avecDossiers || !!terme || !replies.has(nom);     // une recherche montre tout
    if (avecDossiers) corps.appendChild(ligneDossier(nom, groupes.get(nom), ouvert));
    if (ouvert) groupes.get(nom).forEach(c => corps.appendChild(ligneCourse(c)));
  });
  listeEl.appendChild(table);
}

function ligneCourse(c) {
  const tr = document.createElement('tr');
  tr.insertCell().appendChild(caseACocher(selection.has(c.id), coche => {
    coche ? selection.add(c.id) : selection.delete(c.id);
    dessinerCourses();
  }));
  [c.nom, c.date ?? '—', c.lieu ?? '—'].forEach(texte => { tr.insertCell().textContent = texte; });

  const celluleNotes = tr.insertCell();
  celluleNotes.className = 'notes-cell';
  celluleNotes.textContent = c.notes ? c.notes.replace(/\s*\n\s*/g, ' · ') : '—';
  if (c.notes) celluleNotes.title = c.notes;

  tr.insertCell().append(
    bouton('Afficher', 'primary', () => afficherCourse(c)),
    bouton('Modifier', '', () => tr.replaceWith(ligneEdition(c))),
    bouton('Supprimer', '', () => supprimerCourse(c))
  );
  return tr;
}

function ligneEdition(c) {
  const tr = document.createElement('tr');
  const nom = champ('text', c.nom);
  const date = champ('date', c.date);
  const lieu = champ('text', c.lieu);
  const notes = zoneTexte(c.notes);
  tr.insertCell();                                       // colonne des cases à cocher
  [nom, date, lieu, notes].forEach(i => tr.insertCell().appendChild(i));
  tr.insertCell().append(
    bouton('Enregistrer', 'primary', async () => {
      if (!nom.value.trim()) { nom.focus(); return; }
      await window.api.modifierCourse(c.id, {
        nom: nom.value.trim(),
        date: date.value || null,
        lieu: lieu.value.trim() || null,
        notes: notes.value.trim() || null
      });
      await chargerCourses();
      await chargerTables();
    }),
    bouton('Annuler', '', () => tr.replaceWith(ligneCourse(c)))
  );
  return tr;
}

async function supprimerCourse(c) {
  if (!confirm(`Supprimer « ${c.nom} » (${c.date ?? 'sans date'}) et toutes ses mesures ?`)) return;
  await window.api.supprimerCourse(c.id);
  await chargerCourses();
  await chargerTables();
}

async function afficherCourse(c) {
  const { entetes, lignes } = await window.api.donneesCourse(c.id);
  const rows = [entetes, ...lignes.map(l => l.map(v => v ?? ''))];
  document.getElementById('fname').textContent = `${c.nom} — ${c.date ?? 'sans date'}`;

  const notesEl = document.getElementById('notesCourse');
  notesEl.replaceChildren();
  if (c.notes) {
    const titre = document.createElement('strong');
    titre.textContent = 'Notes : ';
    notesEl.append(titre, c.notes);
  }
  notesEl.classList.toggle('hide', !c.notes);

  analyse(rows, c.nom);
  document.getElementById('out').scrollIntoView({ behavior: 'smooth' });
}

async function viderToutesLesCourses() {
  const n = toutesCourses.length;
  if (!n) return;
  if (!confirm(`Supprimer les ${n} course${n > 1 ? 's' : ''} de la base, avec toutes leurs mesures ?\n\nUne copie de sauvegarde de la base est faite juste avant.`)) return;
  if (!confirm('Dernière confirmation : toutes les courses seront supprimées. Continuer ?')) return;

  viderBtn.disabled = true;
  try {
    await window.api.viderCourses();
  } catch (e) {
    alert('Erreur pendant la suppression : ' + e.message);
  }
  // les graphiques affichés appartenaient à une course qui n'existe plus
  document.getElementById('out').classList.add('hide');
  document.getElementById('tools').classList.add('hide');
  await chargerCourses();
  await chargerTables();
}

// la sélection est vidée à chaque recherche : on ne déplace jamais des courses qu'on ne voit plus
courseSearch.addEventListener('input', () => { selection.clear(); dessinerCourses(); });
dossierDeplacer.addEventListener('click', deplacerSelection);
dossierNom.addEventListener('keydown', e => { if (e.key === 'Enter') deplacerSelection(); });
viderBtn.addEventListener('click', viderToutesLesCourses);

chargerCourses();