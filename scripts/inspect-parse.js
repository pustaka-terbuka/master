async function test() {
  const homeRes = await fetch('https://gemilang.ukm.my/');
  const cgisessid = homeRes.headers.get('set-cookie')?.split(';')[0] || '';

  const res = await fetch('https://gemilang.ukm.my/cgi-bin/koha/opac-detail.pl?biblionumber=664041', {
    headers: { 'Cookie': cgisessid, 'Referer': 'https://gemilang.ukm.my/' }
  });
  const html = await res.text();
  const rawSummaries = Array.from(html.matchAll(/<span class="results_summary[^"]*">([\s\S]*?)<\/span>/gi)).map(m => m[0]);
  for (const s of rawSummaries.slice(0, 5)) {
    console.log('\n--- RAW ---');
    console.log(s);
  }

  // Holdings table search
  const holdingTable = html.match(/<table[^>]*id="holdingst"[^>]*>([\s\S]*?)<\/table>/i);
  if (holdingTable) {
    console.log('\nHoldings table found! Length:', holdingTable[0].length);
    const rows = Array.from(holdingTable[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map(m => m[1]);
    for (const r of rows.slice(0, 3)) {
      console.log('Holdings row:', r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    }
  }
}
test();
