const { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme } = require('electron');
const path = require('path');
const db = require('./db');

// Barre de titre : les boutons réduire / agrandir / fermer restent ceux de Windows, aux couleurs du thème
// (le thème de l'interface suit celui de Windows, comme dans styles.css)
const HAUTEUR_BARRE = 36;
const couleursBarre = () => (nativeTheme.shouldUseDarkColors
  ? { color: '#181d24', symbolColor: '#e8ebef', height: HAUTEUR_BARRE }
  : { color: '#ffffff', symbolColor: '#1b1f24', height: HAUTEUR_BARRE });

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: couleursBarre(),
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  // Port série (page LIVE) : Electron n'affiche pas de sélecteur de port, on le fournit ici
  const ses = win.webContents.session;
  ses.setPermissionCheckHandler((wc, permission) => permission === 'serial');
  ses.setDevicePermissionHandler(details => details.deviceType === 'serial');
  ses.on('select-serial-port', (event, ports, wc, callback) => {
    event.preventDefault();
    if (ports.length <= 1) return callback(ports[0] ? ports[0].portId : '');
    const choix = dialog.showMessageBoxSync(win, {
      type: 'question',
      message: 'Quel port utiliser pour le récepteur LoRa ?',
      buttons: [...ports.map(p => p.displayName || p.portName), 'Annuler'],
      cancelId: ports.length,
    });
    callback(choix < ports.length ? ports[choix].portId : '');
  });

  nativeTheme.on('updated', () => {
    if (!win.isDestroyed()) win.setTitleBarOverlay(couleursBarre());
  });

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  win.loadFile('src/analyseur.html');
}

// Le menu natif est remplacé par la barre de titre de l'interface (src/barre-titre.js)
ipcMain.handle('fenetre:action', (event, action) => {
  const fenetre = BrowserWindow.fromWebContents(event.sender);
  if (!fenetre) return;
  const contenu = fenetre.webContents;
  if (action === 'quitter') app.quit();
  else if (action === 'recharger') contenu.reload();
  else if (action === 'plein-ecran') fenetre.setFullScreen(!fenetre.isFullScreen());
  else if (action === 'outils') contenu.toggleDevTools();
  else if (action === 'couper') contenu.cut();
  else if (action === 'copier') contenu.copy();
  else if (action === 'coller') contenu.paste();
  else if (action === 'tout-selectionner') contenu.selectAll();
});

ipcMain.handle('courses:liste', () => db.listeCourses());
ipcMain.handle('courses:stats', () => db.statsAccueil());
ipcMain.handle('courses:creer', (event, nom) => db.creerCourse(nom));
ipcMain.handle('courses:importer', (event, course) => db.importerCourse(course));
ipcMain.handle('courses:donnees', (event, id) => db.donneesCourse(id));
ipcMain.handle('courses:modifier', (event, id, champs) => db.modifierCourse(id, champs));
ipcMain.handle('courses:supprimer', (event, id) => db.supprimerCourse(id));
ipcMain.handle('courses:vider', () => db.viderCourses());
ipcMain.handle('db:tables', () => db.listeTables());
ipcMain.handle('db:lignes', (event, nom, limite, decalage, recherche) => db.lignesTable(nom, limite, decalage, recherche));

app.whenReady().then(() => {
  db.ouvrirBase();
  Menu.setApplicationMenu(null);
  createWindow();
});
app.on('window-all-closed', () => app.quit());