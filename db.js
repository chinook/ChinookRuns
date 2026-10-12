const { app } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

let db;

function ouvrirBase() {
    const chemin = path.join(app.getPath('userData'), 'chinook.db');
    db = new Database(chemin);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS courses (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            nom            TEXT NOT NULL,
            date           TEXT,
            lieu           TEXT,
            notes          TEXT,
            fichier_source TEXT,
            date_import    TEXT
        );

        CREATE TABLE IF NOT EXISTS canaux (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            nom       TEXT NOT NULL,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS echantillons (
            course_id INTEGER NOT NULL,
            canal_id  INTEGER NOT NULL,
            n         INTEGER NOT NULL,
            t         REAL,
            valeur    REAL,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY (canal_id)  REFERENCES canaux(id)  ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_echantillons
            ON echantillons(course_id, canal_id, n);
    `);

    console.log('Base ouverte :', chemin);
}

function listeCourses() {
    return db.prepare('SELECT * FROM courses ORDER BY id DESC').all();
}

function creerCourse(nom) {
    const resultat = db
        .prepare('INSERT INTO courses (nom, date_import) VALUES (?, ?)')
        .run(nom, new Date().toISOString());
    return Number(resultat.lastInsertRowid);
}

function importerCourse({ nom, date, lieu, notes, fichierSource, entetes, colTemps, lignes }) {
    const existe = db
        .prepare('SELECT id FROM courses WHERE fichier_source = ? AND date IS ?')
        .get(fichierSource, date);
    if (existe) return { doublon: true, id: existe.id };

    const importer = db.transaction(() => {
        const idCourse = Number(
            db.prepare(
                'INSERT INTO courses (nom, date, lieu, notes, fichier_source, date_import) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(nom, date, lieu, notes ?? null, fichierSource, new Date().toISOString()).lastInsertRowid
        );

        const insCanal = db.prepare('INSERT INTO canaux (course_id, nom) VALUES (?, ?)');
        const idsCanaux = entetes.map((h, j) =>
            j === colTemps ? null : Number(insCanal.run(idCourse, h).lastInsertRowid)
        );

        const insEch = db.prepare(
            'INSERT INTO echantillons (course_id, canal_id, n, t, valeur) VALUES (?, ?, ?, ?, ?)'
        );
        lignes.forEach((ligne, n) => {
            const t = ligne[colTemps] ?? null;
            idsCanaux.forEach((idCanal, j) => {
                if (idCanal !== null) insEch.run(idCourse, idCanal, n, t, ligne[j] ?? null);
            });
        });

        return idCourse;
    });

    return { doublon: false, id: importer() };
}

function nomsTables() {
    return db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map(r => r.name);
}

function listeTables() {
    return nomsTables().map(nom => ({
        nom,
        nb: db.prepare(`SELECT COUNT(*) AS n FROM "${nom}"`).get().n
    }));
}

const SOURCES = {
    canaux: `SELECT k.id, k.course_id, c.nom AS course, k.nom
             FROM canaux k JOIN courses c ON c.id = k.course_id`,
    echantillons: `SELECT e.course_id, c.nom AS course, e.canal_id, k.nom AS canal, e.n, e.t, e.valeur
                   FROM echantillons e
                   JOIN courses c ON c.id = e.course_id
                   JOIN canaux k ON k.id = e.canal_id`,
};

function lignesTable(nom, limite, decalage, recherche) {
    if (!nomsTables().includes(nom)) throw new Error('Table inconnue : ' + nom);
    const lim = Math.min(Number(limite) || 100, 1000);
    const dec = Math.max(Number(decalage) || 0, 0);
    const source = SOURCES[nom] || `SELECT * FROM "${nom}"`;
    const terme = String(recherche || '').trim();

    if (!terme) {
        const total = db.prepare(`SELECT COUNT(*) AS n FROM "${nom}"`).get().n;
        const lignes = db.prepare(`SELECT * FROM (${source}) LIMIT ? OFFSET ?`).all(lim, dec);
        return { lignes, total };
    }

    const colonnes = db.prepare(`SELECT * FROM (${source}) LIMIT 0`).columns().map(c => c.name);
    const filtre = colonnes.map(c => `CAST("${c}" AS TEXT) LIKE ? ESCAPE '\\'`).join(' OR ');
    const motif = '%' + terme.replace(/[\\%_]/g, '\\$&') + '%';
    const params = colonnes.map(() => motif);

    const total = db.prepare(`SELECT COUNT(*) AS n FROM (${source}) WHERE ${filtre}`).get(...params).n;
    const lignes = db.prepare(`SELECT * FROM (${source}) WHERE ${filtre} LIMIT ? OFFSET ?`)
        .all(...params, lim, dec);
    return { lignes, total };
}

function donneesCourse(id) {
    const canaux = db.prepare('SELECT id, nom FROM canaux WHERE course_id = ? ORDER BY id').all(id);
    const echantillons = db.prepare(
        'SELECT canal_id, n, t, valeur FROM echantillons WHERE course_id = ? ORDER BY n'
    ).all(id);

    const colonne = new Map(canaux.map((c, j) => [c.id, j + 1]));
    const lignes = [];
    for (const e of echantillons) {
        let ligne = lignes[e.n];
        if (!ligne) {
            ligne = new Array(canaux.length + 1).fill(null);
            ligne[0] = e.t;
            lignes[e.n] = ligne;
        }
        ligne[colonne.get(e.canal_id)] = e.valeur;
    }

    return { entetes: ['temps_s', ...canaux.map(c => c.nom)], lignes };
}

function modifierCourse(id, { nom, date, lieu, notes }) {
    return db.prepare('UPDATE courses SET nom = ?, date = ?, lieu = ?, notes = ? WHERE id = ?')
        .run(nom, date, lieu, notes ?? null, id).changes;
}

function supprimerCourse(id) {
    return db.prepare('DELETE FROM courses WHERE id = ?').run(id).changes;
}

module.exports = {
    ouvrirBase, listeCourses, creerCourse, importerCourse, listeTables, 
    lignesTable, donneesCourse, modifierCourse, supprimerCourse
};