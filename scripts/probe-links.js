async function check() {
  const r = await fetch('https://www.kedahlib.gov.my/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await r.text();
  const matches = html.match(/href=["'][^"']+["']/gi) || [];
  const found = matches
    .map(m => m.slice(6, -1))
    .filter(u => /opac|katalog|catalog|carian|koha|library/i.test(u));
  console.log('Kedah links:', [...new Set(found)]);

  const r2 = await fetch('https://ppaj.johor.gov.my/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html2 = await r2.text();
  const matches2 = html2.match(/href=["'][^"']+["']/gi) || [];
  const found2 = matches2
    .map(m => m.slice(6, -1))
    .filter(u => /opac|katalog|catalog|carian|koha|seal/i.test(u));
  console.log('Johor links:', [...new Set(found2)]);
}
check().catch(console.error);
