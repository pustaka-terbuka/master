async function test() {
  const homeRes = await fetch('https://gemilang.ukm.my/');
  const setCookie = homeRes.headers.get('set-cookie');
  const cgisessid = setCookie ? setCookie.split(';')[0] : '';
  console.log('Got session cookie:', cgisessid);

  const searchRes = await fetch('https://gemilang.ukm.my/cgi-bin/koha/opac-search.pl?q=malaysia', {
    headers: {
      'Cookie': cgisessid,
      'Referer': 'https://gemilang.ukm.my/'
    }
  });
  const text = await searchRes.text();
  const bibs = Array.from(text.matchAll(/biblionumber=(\d+)/g)).map(m => m[1]);
  const uniqueBibs = Array.from(new Set(bibs));
  console.log('Biblionumbers returned from search:', uniqueBibs.slice(0, 10));

  const firstBib = uniqueBibs[0];
  if (firstBib) {
    const detailRes = await fetch(`https://gemilang.ukm.my/cgi-bin/koha/opac-detail.pl?biblionumber=${firstBib}`, {
      headers: { 'Cookie': cgisessid, 'Referer': 'https://gemilang.ukm.my/' }
    });
    console.log('Detail page for', firstBib, 'status:', detailRes.status);
    const detailHtml = await detailRes.text();
    const title = detailHtml.match(/<h1[^>]*class="title"[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
    console.log('Title on detail page:', title);

    const exportRes = await fetch(`https://gemilang.ukm.my/cgi-bin/koha/opac-export.pl?op=export&bib=${firstBib}&format=marcxml`, {
      headers: { 'Cookie': cgisessid, 'Referer': 'https://gemilang.ukm.my/' }
    });
    console.log('Export MARCXML with session for bib', firstBib, 'status:', exportRes.status);
    const exportText = await exportRes.text();
    if (exportText.includes('<record')) {
      console.log('Export MARCXML SUCCESS! Length:', exportText.length);
    } else {
      console.log('Export MARCXML response snippet:', exportText.slice(0, 200));
    }
  }
}

test();
