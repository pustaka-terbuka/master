async function test() {
  const homeRes = await fetch('https://gemilang.ukm.my/');
  const cgisessid = homeRes.headers.get('set-cookie')?.split(';')[0] || '';

  const marcRes = await fetch('https://gemilang.ukm.my/cgi-bin/koha/opac-MARCdetail.pl?biblionumber=258715', {
    headers: { 'Cookie': cgisessid, 'Referer': 'https://gemilang.ukm.my/' }
  });
  const html = await marcRes.text();
  const trs = Array.from(html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map(m => m[1]);
  for (const tr of trs.slice(0, 10)) {
    console.log('--- TR ---');
    console.log(tr.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }
}
test();
