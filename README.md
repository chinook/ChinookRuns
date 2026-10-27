# ChinookRuns

Application de bureau Windows pour **importer, stocker et analyser les courses** du véhicule éolien du Club Chinook (ÉTS).

Elle lit les fichiers CSV enregistrés sur la carte SD du véhicule, les conserve dans une base de données locale (SQLite) et affiche le diagnostic et les graphiques de chaque course. Elle fonctionne **hors ligne**.

## Fonctionnalités

- **Accueil** : présentation du club, photos et nombre de courses enregistrées. Le logo de la barre de navigation ramène toujours ici.
- **Base de données** : import d'un ou plusieurs fichiers CSV / XLSX à la fois (avec la date, le lieu et des notes), puis explorateur en lecture seule des tables avec barre de recherche dans toutes les colonnes
- **Visualiser une course** : liste des courses avec recherche (nom, date, lieu, notes) et actions Afficher, Modifier et Supprimer ; l'affichage montre les notes de la course, le résumé, le diagnostic de l'acquisition, l'évolution dans le temps, la relation entre deux mesures et la santé de chaque canal.- **LIVE** : page réservée à la télémétrie en temps réel via LoRa (pas encore implémentée)

L'application s'ouvre en fenêtre maximisée.

## Technologies

| Rôle | Outil |
|---|---|
| Application de bureau | Electron |
| Base de données | SQLite (`better-sqlite3`) |
| Graphiques | Plotly.js (dans `libs/`) |
| Lecture CSV / Excel | SheetJS (dans `libs/`) |
| Interface | HTML, CSS et JavaScript |

## Installation (développement)

Prérequis : **Windows** et **[Node.js](https://nodejs.org) (version LTS)**.

```bash
git clone https://github.com/chinook/ChinookRuns.git
cd ChinookRuns
npm install
npx electron-rebuild
npm start
```

`electron-rebuild` recompile le module SQLite pour la version d'Electron utilisée. À refaire après une mise à jour d'Electron.

> Si PowerShell affiche que l'exécution de scripts est désactivée, utilise l'invite de commandes (cmd), ou lance une fois :
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

## Construire l'installateur Windows

```bash
npm run build
```

Le résultat est dans `dist/` :

- `ChinookRuns Setup x.y.z.exe` : l'installateur à distribuer
- `win-unpacked/ChinookRuns.exe` : version sans installation, pratique pour tester

L'application n'est pas signée : Windows peut afficher un avertissement SmartScreen (« Informations complémentaires », puis « Exécuter quand même »).

## Utilisation

1. Ouvre **Base de données**, dans le bloc « Importer dans la base » : choisis les fichiers de course, indique la date, le lieu et éventuellement des notes, puis clique sur **Importer**. Le journal indique le résultat de chaque fichier.
2. Dans l'explorateur juste en dessous, choisis une table et utilise la barre de recherche pour filtrer ses lignes.
3. Va dans **Visualiser une course**, cherche une course si besoin, puis clique sur **Afficher** : les notes et les graphiques apparaissent.
4. **Modifier** permet de corriger le nom, la date, le lieu et les notes ; **Supprimer** retire une course et toutes ses mesures.

## Format des fichiers de course

Exemple d'en-tête d'un fichier de la carte SD :

```
time,vehicle_speed,wind_speed,current_gear,gear_ratio,pitch_angle,pitch_auto_target,mast_angle,rotor_rpm,wind_direction,efficiency,tsr
```

- Séparateurs acceptés : virgule, point-virgule, tabulation. Formats : CSV, TXT, XLSX, XLS.
- La colonne de temps doit s'appeler `temps`, `time` ou `t` (avec ou sans `_s`), sinon la première colonne est utilisée.
- Les colonnes sont libres : chaque colonne devient un canal enregistré par son nom, sans changer la base.
- Les valeurs manquantes ou non numériques sont enregistrées comme `NULL`.
- Les fichiers de moins de 10 lignes sont ignorés.
- Un fichier est considéré comme déjà importé si son nom, sa taille et la date saisie sont identiques.

Une partie du diagnostic (`src/app.js`) est écrite pour les noms de colonnes actuels (`wind_speed`, `tsr`, `rotor_rpm`, `wind_direction`; les anciens noms `vitesse_vent` et `rotor_speed` sont aussi reconnus). Si tu les renommes, ces vérifications précises ne se déclenchent plus ; le reste de l'analyse s'adapte automatiquement.

## Base de données

Le fichier est créé au premier lancement dans le dossier de données de l'utilisateur :

```
%APPDATA%\chinookruns\chinook.db
```

Il n'est pas dans le dépôt (voir `.gitignore`). Trois tables :

| Table | Contenu |
|---|---|
| `courses` | une ligne par fichier importé (nom, date, lieu, notes libres, fichier source) |
| `canaux` | une ligne par colonne de mesure et par course |
| `echantillons` | une ligne par mesure (course, canal, numéro de ligne `n`, temps `t`, valeur) |

Supprimer une course supprime aussi ses canaux et ses échantillons (suppression en cascade). Pour parcourir la base en dehors de l'application, utilise [DB Browser for SQLite](https://sqlitebrowser.org).

## Structure du projet

```
ChinookRuns/
├── main.js            processus principal Electron : fenêtre et handlers IPC
├── preload.js         pont sécurisé : expose window.api à la page
├── db.js              SQLite : schéma et requêtes
├── package.json       dépendances, scripts et configuration du build
├── build/icon.ico     icône de l'application
├── libs/              Plotly et SheetJS (fonctionnement hors ligne)
└── src/
    ├── analyseur.html structure des pages
    ├── styles.css     styles (clair / sombre automatique)
    ├── navigation.js  barre de navigation et changement de page
    ├── import.js      lecture et import des fichiers
    ├── courses.js     liste des courses : recherche, notes, afficher, modifier, supprimer
    ├── explorateur.js explorateur de la base avec recherche
    ├── app.js         analyse et graphiques d'une course
    └── img/           logo et photos de la page d'accueil
```

L'ordre des balises `script` dans `analyseur.html` est important : `navigation.js` doit rester en dernier.

## À venir

- Page **LIVE** : télémétrie en temps réel via LoRa (simulateur d'abord, puis lecture du port série)
- Comparaison de plusieurs courses sur un même graphique
- Sélection multiple pour appliquer une date et un lieu en lot
- Export et import de la base de données

## Club

Club Chinook, École de technologie supérieure (ÉTS), véhicule éolien.
