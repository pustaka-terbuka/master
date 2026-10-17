import fs from 'fs';

async function checkDetails() {
  const targets = [
    'http://seal.ppaj.gov.my/portal/',
    'https://webopac.pahanglibrary.gov.my/cgi-bin/koha/opac-search.pl?q=sejarah',
    'https://pintar.ppanpk.gov.my/catalog/records/82891',
    'http://opac.perlislib.gov.my/cgi-bin/koha/opac-search.pl?q=sejarah',
    'http://60.50.240.210/equip-perpustam/',
    'http://219.95.30.73:8080/opac/main.jsp',
    'https://equip.sabah.gov.my/webopac/',
    'http://www.librarynet.com.my/pls/angkasa/opac3.search_form?pc_product=OPAC',
    'http://kllibrary.dbkl.gov.my/client/en_US/pklsearchpage/'
  ];

  for (const url of targets) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow'
      });
      const text = await res.text();
      console.log(`=== ${url} ===`);
      console.log(`Status: ${res.status} | Final: ${res.url} | Length: ${text.length}`);
      const titleMatch = text.match(/<title[^>]*>(.*?)<\/title>/i);
      if (titleMatch) console.log(`Title: ${titleMatch[1].trim()}`);
    } catch (err) {
      console.log(`=== ${url} === ERROR: ${err.message}`);
    }
  }
}

checkDetails();
