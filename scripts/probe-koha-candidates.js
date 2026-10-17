const kohaCandidates = [
  { name: 'UKM', url: 'https://gemilang.ukm.my/' },
  { name: 'UTM', url: 'https://opac.utm.my/' },
  { name: 'UPM', url: 'http://www.elib.upm.edu.my/' },
  { name: 'UiTM', url: 'https://opac.library.uitm.edu.my/' },
  { name: 'UUM', url: 'http://opac.uum.edu.my/' },
  { name: 'UNIMAS', url: 'http://koha.unimas.my/' },
  { name: 'UMS', url: 'http://opac.ums.edu.my/' },
  { name: 'UPSI', url: 'http://koha.upsi.edu.my/' },
  { name: 'UMT', url: 'http://koha.umt.edu.my/' },
  { name: 'UMPSA', url: 'http://koha.umpsa.edu.my/' },
  { name: 'UMK', url: 'http://koha.umk.edu.my/' },
  { name: 'UPNM', url: 'http://koha.upnm.edu.my/' },
  { name: 'MMU', url: 'https://shdl.mmu.edu.my/' },
  { name: 'TAYLORS', url: 'https://taylorslibrary.taylors.edu.my/' }
];

async function checkKoha() {
  for (const c of kohaCandidates) {
    try {
      const res = await fetch(c.url, { signal: AbortSignal.timeout(6000), redirect: 'follow' });
      console.log(`[OK]   ${c.name.padEnd(8)} HTTP ${res.status} - ${c.url}`);
    } catch (e) {
      console.log(`[FAIL] ${c.name.padEnd(8)} ${e.code || e.message} - ${c.url}`);
    }
  }
}

checkKoha();
