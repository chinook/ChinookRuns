const pages = [...document.querySelectorAll('.page')];
const boutonsNav = [...document.querySelectorAll('#nav [data-page]')];

async function majAccueil() {
  const courses = await window.api.listeCourses();
  const n = courses.length;
  document.getElementById('homeStats').textContent = n
    ? `${n} course${n > 1 ? 's' : ''} enregistrée${n > 1 ? 's' : ''} dans la base.`
    : "Aucune course enregistrée pour l'instant : commence par l'onglet Base de données.";
}

function afficherPage(nom) {
  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + nom));
  boutonsNav.forEach(b => b.classList.toggle('active', b.dataset.page === nom));
  window.scrollTo(0, 0);

  if (nom === 'home') majAccueil();
  if (nom === 'base') chargerTables();
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