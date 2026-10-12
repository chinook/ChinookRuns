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

async function chargerCourses() {
  const courses = await window.api.listeCourses();
  courses.sort((a, b) =>
    (a.date || '').localeCompare(b.date || '') ||
    a.nom.localeCompare(b.nom, undefined, { numeric: true }));

  listeEl.replaceChildren();
  if (!courses.length) { listeEl.textContent = 'Aucune course dans la base.'; return; }

  const table = document.createElement('table');
  const entete = table.createTHead().insertRow();
  ['Nom', 'Date', 'Lieu', ''].forEach(texte => {
    const th = document.createElement('th');
    th.textContent = texte;
    entete.appendChild(th);
  });
  const corps = table.createTBody();
  courses.forEach(c => corps.appendChild(ligneCourse(c)));
  listeEl.appendChild(table);
}

function ligneCourse(c) {
  const tr = document.createElement('tr');
  [c.nom, c.date ?? '—', c.lieu ?? '—'].forEach(texte => { tr.insertCell().textContent = texte; });
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
  [nom, date, lieu].forEach(i => tr.insertCell().appendChild(i));
  tr.insertCell().append(
    bouton('Enregistrer', 'primary', async () => {
      if (!nom.value.trim()) { nom.focus(); return; }
      await window.api.modifierCourse(c.id, {
        nom: nom.value.trim(),
        date: date.value || null,
        lieu: lieu.value.trim() || null
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
  analyse(rows, c.nom);
  document.getElementById('out').scrollIntoView({ behavior: 'smooth' });
}

chargerCourses();