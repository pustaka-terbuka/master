async function inspectMenuPelanggan() {
  const url = 'https://ppaj.johor.gov.my/menu-pelanggan/';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  const anchors = Array.from(text.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
    .map(m => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() }))
    .filter(a => a.text.length > 0 && !a.href.startsWith('#'));
  console.log('Menu Pelanggan Anchors:', anchors.filter(a => /katalog|opac|carian|search|buku|bahan|pinjam/i.test(a.text) || /katalog|opac|search/i.test(a.href)));
}
inspectMenuPelanggan();
