import fs from 'fs';

async function checkKedahJohor() {
  const urls = [
    'https://kedahlib.gov.my/v2.1/',
    'https://ppaj.johor.gov.my/',
    'http://seal.ppaj.gov.my/',
    'http://wilmu.ppaj.gov.my/'
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow'
      });
      const text = await res.text();
      console.log(`URL: ${url} -> Status: ${res.status} -> Final: ${res.url}`);
      const matches = text.match(/href=["']([^"']+)["']/gi) || [];
      const clean = matches.map(m => m.replace(/^href=["']|["']$/g, ''));
      const relevant = clean.filter(c => /opac|catalog|katalog|search|carian|koha|equip|elib|u-library/i.test(c));
      console.log('Relevant links:', [...new Set(relevant)]);
    } catch (e) {
      console.log(`URL: ${url} ERR: ${e.message}`);
    }
  }
}

checkKedahJohor();
