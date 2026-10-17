async function check() {
  const targets = [
    { name: 'UKM', url: 'https://gemilang.ukm.my/' },
    { name: 'UPM', url: 'https://lib.upm.edu.my/' },
    { name: 'UTM', url: 'https://library.utm.my/' },
    { name: 'UiTM', url: 'https://library.uitm.edu.my/' }
  ];

  for (const t of targets) {
    try {
      const res = await fetch(t.url);
      const html = await res.text();
      console.log(`\n=== ${t.name} (${t.url}) ===`);
      console.log('Title:', html.match(/<title>[\s\S]*?<\/title>/i)?.[0]);
      const forms = Array.from(html.matchAll(/<form[\s\S]*?<\/form>/gi)).map(m => m[0]);
      for (const f of forms.slice(0, 3)) {
        const action = f.match(/action=["'](.*?)["']/i)?.[1];
        console.log(' Form action:', action);
      }
      const links = Array.from(html.matchAll(/href=["'](.*?)["']/gi)).map(m => m[1]).filter(u => /catalog|opac|koha|search/i.test(u));
      console.log(' Links:', Array.from(new Set(links)).slice(0, 5));
    } catch (e) {
      console.log(t.name, 'Error:', e.message);
    }
  }
}
check();
