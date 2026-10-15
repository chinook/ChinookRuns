const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./db');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900,
    show: false,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  win.loadFile('src/analyseur.html');
}

ipcMain.handle('courses:liste', () => db.listeCourses());
ipcMain.handle('courses:stats', () => db.statsAccueil());
ipcMain.handle('courses:creer', (event, nom) => db.creerCourse(nom));
ipcMain.handle('courses:importer', (event, course) => db.importerCourse(course));
ipcMain.handle('courses:donnees', (event, id) => db.donneesCourse(id));
ipcMain.handle('courses:modifier', (event, id, champs) => db.modifierCourse(id, champs));
ipcMain.handle('courses:supprimer', (event, id) => db.supprimerCourse(id));
ipcMain.handle('db:tables', () => db.listeTables());
ipcMain.handle('db:lignes', (event, nom, limite, decalage, recherche) => db.lignesTable(nom, limite, decalage, recherche));

app.whenReady().then(() => {
  db.ouvrirBase();
  createWindow();
});
app.on('window-all-closed', () => app.quit());