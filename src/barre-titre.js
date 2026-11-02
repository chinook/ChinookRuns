// Menus de la barre de titre (Fichier / Édition / Affichage) : le menu natif d'Electron est désactivé
(function () {
  const barre = document.getElementById('barreTitre');
  const menus = [...barre.querySelectorAll('.barre-menu')];
  let ouvert = null;

  function afficher(menu) {
    ouvert = menu;
    for (const m of menus) {
      const actif = m === menu;
      m.querySelector('.barre-menu-liste').hidden = !actif;
      m.firstElementChild.classList.toggle('actif', actif);
    }
  }

  for (const m of menus) {
    m.firstElementChild.addEventListener('click', () => afficher(ouvert === m ? null : m));
    m.firstElementChild.addEventListener('mouseenter', () => { if (ouvert) afficher(m); });
  }
  barre.addEventListener('click', (e) => {
    const action = e.target.dataset && e.target.dataset.action;
    if (!action) return;
    afficher(null);
    window.api.actionFenetre(action);
  });
  window.addEventListener('mousedown', (e) => { if (ouvert && !barre.contains(e.target)) afficher(null); });
})();
