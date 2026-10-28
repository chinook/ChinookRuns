const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    listeCourses: () => ipcRenderer.invoke('courses:liste'),
    statsAccueil: () => ipcRenderer.invoke('courses:stats'),
    creerCourse: (nom) => ipcRenderer.invoke('courses:creer', nom),
    importerCourse: (course) => ipcRenderer.invoke('courses:importer', course),
    donneesCourse: (id) => ipcRenderer.invoke('courses:donnees', id),
    modifierCourse: (id, champs) => ipcRenderer.invoke('courses:modifier', id, champs),
    supprimerCourse: (id) => ipcRenderer.invoke('courses:supprimer', id),
    viderCourses: () => ipcRenderer.invoke('courses:vider'),
    listeTables: () => ipcRenderer.invoke('db:tables'),
    lignesTable: (nom, limite, decalage, recherche) => ipcRenderer.invoke('db:lignes', nom, limite, decalage, recherche),
});