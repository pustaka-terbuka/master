import fs from 'fs';

async function probe() {
  const targets = [
    { code: 'ppaj', name: 'Johor', url: 'https://ppaj.johor.gov.my/' },
    { code: 'ppak', name: 'Kedah', url: 'https://www.kedahlib.gov.my/' },
    { code: 'ppank', name: 'Kelantan', url: 'http://www.kelantanlibrary.gov.my/' },
    { code: 'perpustam', name: 'Melaka', url: 'https://perpustam.gov.my/' },
    { code: 'ppans', name: 'Negeri Sembilan', url: 'https://www.nslibrary.gov.my/' },
    { code: 'ppap', name: 'Pahang', url: 'https://webopac.pahanglibrary.gov.my/' },
    { code: 'ppanpk', name: 'Perak', url: 'https://pintar.ppanpk.gov.my/' },
    { code: 'ppanps', name: 'Perlis', url: 'http://opac.perlislib.gov.my/' },
    { code: 'ssl', name: 'Sabah', url: 'https://library.sabah.gov.my/' },
    { code: 'sarawak', name: 'Sarawak', url: 'https://www.librarynet.com.my/' },
    { code: 'ppat', name: 'Terengganu', url: 'https://www.trglib.gov.my/' },
    { code: 'pkl', name: 'Kuala Lumpur', url: 'https://perpustakaankualalumpur.dbkl.gov.my/' }
  ];

  console.log('--- Probing State Library Portals ---');
  for (const t of targets) {
    try {
      const res = await fetch(t.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000)
      });
      const text = await res.text();
      const finalUrl = res.url;
      const titleMatch = text.match(/<title[^>]*>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';
      
      // Look for opac, catalog, ilms, koha, equip, symphony, etc.
      const links = Array.from(text.matchAll(/href=["']([^"']+)["']/gi)).map(m => m[1]);
      const opacLinks = links.filter(l => /opac|catalog|katalog|carian|search|koha|equip|elib/i.test(l));

      console.log(`[${t.code.toUpperCase()}] ${t.name}: Status ${res.status} | Final: ${finalUrl}`);
      console.log(`  Title: ${title.slice(0, 80)}`);
      if (opacLinks.length > 0) {
        console.log(`  Catalog Links: ${[...new Set(opacLinks)].slice(0, 5).join(' , ')}`);
      }
    } catch (err) {
      console.log(`[${t.code.toUpperCase()}] ${t.name} ERROR: ${err.message}`);
    }
  }
}

probe();
