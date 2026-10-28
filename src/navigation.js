const pages = [...document.querySelectorAll('.page')];
const boutonsNav = [...document.querySelectorAll('#nav [data-page]')];

function el(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte != null) e.textContent = texte;
  return e;
}

const nombre = (x, d = 1) => Number.isFinite(x) ? x.toLocaleString('fr-CA', { maximumFractionDigits: d }) : '—';
const dureeLisible = s => s >= 3600
  ? `${Math.floor(s / 3600)} h ${String(Math.round(s % 3600 / 60)).padStart(2, '0')}`
  : `${Math.round(s / 60)} min`;

function tuile(valeur, libelle) {
  const t = el('div', 'stat');
  t.append(el('div', 'v', valeur), el('div', 'l', libelle));
  return t;
}

async function majAccueil() {
  const courses = await window.api.listeCourses();
  const tuiles = document.getElementById('homeTuiles');
  const derniere = document.getElementById('derniereCourse');
  tuiles.replaceChildren();
  derniere.replaceChildren();

  if (!courses.length) {
    const vide = el('div', 'card vide');
    const importer = el('button', 'btn primary', 'Importer ma première course');
    importer.type = 'button';
    importer.onclick = () => afficherPage('base');
    vide.append(el('p', null, "Aucune course enregistrée pour l'instant."), importer);
    derniere.append(vide);
    return;
  }

  const stats = await window.api.statsAccueil();
  tuiles.append(
    tuile(courses.length, `course${courses.length > 1 ? 's' : ''} enregistrée${courses.length > 1 ? 's' : ''}`),
    tuile(dureeLisible(stats.dureeTotale), "d'enregistrement"),
    tuile(Number.isFinite(stats.ventMoyen) ? nombre(stats.ventMoyen) + ' m/s' : '—', 'vent moyen'),
    tuile(Number.isFinite(stats.vitesseMax) ? nombre(stats.vitesseMax) + ' m/s' : '—', 'vitesse max du véhicule')
  );

  // la plus récente par date de course ; à date égale, la dernière importée
  const c = [...courses].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id)[0];
  const carte = el('div', 'card derniere');
  const texte = el('div');
  texte.append(
    el('div', 'etiquette', 'Dernière course'),
    el('div', 'nom', c.nom),
    el('div', 'meta', [c.date, c.lieu].filter(Boolean).join(' · ') || 'Sans date ni lieu')
  );
  if (c.notes) texte.append(el('div', 'notes', c.notes.replace(/\s*\n\s*/g, ' · ')));
  const afficher = el('button', 'btn primary', 'Afficher');
  afficher.type = 'button';
  afficher.onclick = () => { afficherPage('visualiser'); afficherCourse(c); };
  carte.append(texte, afficher);
  derniere.append(carte);
}

document.getElementById('actImporter').onclick = () => afficherPage('base');
document.getElementById('actVisualiser').onclick = () => afficherPage('visualiser');

function afficherPage(nom) {
  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + nom));
  boutonsNav.forEach(b => b.classList.toggle('active', b.dataset.page === nom));
  window.scrollTo(0, 0);

  if (nom === 'home') majAccueil();
  if (nom === 'base') { chargerTables(); chargerCourses(); }   // chargerCourses met à jour le bouton « Vider la base »
  if (nom === 'live') {
    requestAnimationFrame(() => { const g = document.getElementById('lvGraph'); if (g && g.data) Plotly.Plots.resize(g); });
  }
  if (nom === 'visualiser') {
    chargerCourses();
    // Plotly mesure 0 px dans une page cachée : on redimensionne au retour
    requestAnimationFrame(() => {
      ['timeline', 'scatter'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.data) Plotly.Plots.resize(el);
      });
    });
  }
}

boutonsNav.forEach(b => b.addEventListener('click', () => afficherPage(b.dataset.page)));

afficherPage('home');