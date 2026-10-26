// Download-Knöpfe direkt auf den Installer der neuesten Version; ohne API-Antwort bleibt die Releases-Seite.
// #dl-meta bekommt Version und Größe vor seinen Text (data-rest)
fetch('https://api.github.com/repos/JamyH/all-you-need/releases/latest')
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((rel) => {
    const setup = rel.assets.find((a) => /Setup-.*\.exe$/.test(a.name));
    if (!setup) return;
    document.querySelectorAll('a[href$="releases/latest"].btn').forEach((a) => { a.href = setup.browser_download_url; });
    const meta = document.getElementById('dl-meta');
    if (meta) meta.textContent = `${rel.tag_name} · ${(setup.size / 1048576).toFixed(0)} MB · ${meta.dataset.rest}`;
  })
  .catch(() => {});
