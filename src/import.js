const MIN_LIGNES = 10;   // les fichiers plus courts sont ignorés

const importFiles = document.getElementById('importFiles');
const importDate = document.getElementById('importDate');
const importLieu = document.getElementById('importLieu');
const importNotes = document.getElementById('importNotes');
const importBtn = document.getElementById('importBtn');
const importLog = document.getElementById('importLog');

async function lireFichier(f) {
  if (/\.(xlsx|xls)$/i.test(f.name)) {
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    return rows.map(r => (r.length === 1 && String(r[0]).includes(',')) ? String(r[0]).split(',') : r);
  }
  return (await f.text()).split(/\r?\n/).filter(l => l.trim()).map(l => l.split(/[,;\t]/));
}

function preparer(rows) {
  const entetes = rows[0].map(h => String(h).trim());
  let colTemps = entetes.findIndex(h => /^(temps|time|t)(_s)?$/i.test(h));
  if (colTemps === -1) colTemps = 0;
  const lignes = rows.slice(1)
    .map(r => entetes.map((_, j) => {
      const v = r[j];
      if (v === '' || v == null) return null;
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    }))
    .filter(l => l[colTemps] !== null);
  return { entetes, colTemps, lignes };
}

importBtn.addEventListener('click', async () => {
  const fichiers = [...importFiles.files];
  if (!fichiers.length) { importLog.textContent = 'Choisis au moins un fichier.'; return; }

  importBtn.disabled = true;
  const log = [];
  for (const f of fichiers) {
    try {
      const { entetes, colTemps, lignes } = preparer(await lireFichier(f));
      if (lignes.length < MIN_LIGNES) {
        log.push(`${f.name} : ignoré (${lignes.length} lignes)`);
      } else {
        const res = await window.api.importerCourse({
          nom: f.name.replace(/\.[^.]+$/, ''),
          date: importDate.value || null,
          lieu: importLieu.value.trim() || null,
          notes: importNotes.value.trim() || null,
          fichierSource: `${f.name} (${f.size} o)`,
          entetes, colTemps, lignes
        });
        log.push(res.doublon ? `${f.name} : déjà importé` : `${f.name} : importé (${lignes.length} lignes)`);
      }
    } catch (e) {
      log.push(`${f.name} : erreur — ${e.message}`);
    }
    importLog.textContent = log.join('\n');
  }
  importBtn.disabled = false;
  await chargerCourses();
  await chargerTables();
});