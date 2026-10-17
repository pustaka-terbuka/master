import dns from 'dns/promises';

const domainsToTest = [
  // UM
  'umlib.um.edu.my', 'umlib.locate.ebsco.com',
  // USM
  'lib.usm.my', 'library.usm.my',
  // UKM
  'gemilang.ukm.my', 'www.ukm.my',
  // UPM
  'lib.upm.edu.my', 'elib.upm.edu.my', 'koha.upm.edu.my', 'opac.upm.edu.my',
  // UTM
  'library.utm.my', 'opac.utm.my', 'ent.library.utm.my',
  // UiTM
  'library.uitm.edu.my', 'opac.library.uitm.edu.my', 'permata.uitm.edu.my',
  // IIUM
  'www.iium.edu.my', 'lib.iium.edu.my', 'libopac.iium.edu.my',
  // UUM
  'library.uum.edu.my', 'opac.uum.edu.my',
  // UNIMAS
  'library.unimas.my', 'www.library.unimas.my', 'koha.unimas.my',
  // UMS
  'library.ums.edu.my', 'opac.ums.edu.my',
  // UPSI
  'pustaka.upsi.edu.my', 'koha.upsi.edu.my',
  // USIM
  'library.usim.edu.my', 'perpustakaan.usim.edu.my', 'koha.usim.edu.my',
  // UMT
  'psnz.umt.edu.my', 'koha.umt.edu.my',
  // UTHM
  'library.uthm.edu.my', 'ptta.uthm.edu.my',
  // UTeM
  'library.utem.edu.my', 'utemlib.utem.edu.my',
  // UMPSA
  'library.umpsa.edu.my', 'koha.umpsa.edu.my', 'library.ump.edu.my',
  // UniMAP
  'library.unimap.edu.my', 'ptf.unimap.edu.my',
  // UniSZA
  'library.unisza.edu.my', 'unisza.edu.my',
  // UMK
  'lib.umk.edu.my', 'koha.umk.edu.my',
  // UPNM
  'lib.upnm.edu.my', 'koha.upnm.edu.my',
  // UTP
  'irc.utp.edu.my', 'www.utp.edu.my',
  // MMU
  'shdl.mmu.edu.my',
  // UNITEN
  'library.uniten.edu.my', 'www.uniten.edu.my',
  // UTAR
  'library.utar.edu.my',
  // Sunway
  'library.sunway.edu.my', 'sunwayuniversity.edu.my',
  // Taylors
  'taylorslibrary.taylors.edu.my'
];

async function checkDns() {
  console.log('Resolving DNS for candidate library domains...');
  for (const d of domainsToTest) {
    try {
      const { address } = await dns.lookup(d);
      console.log(`[DNS OK]   ${d.padEnd(30)} -> ${address}`);
    } catch (e) {
      // not resolved
    }
  }
}
checkDns();
