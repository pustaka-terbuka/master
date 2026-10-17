async function inspectWilmuBody() {
  const url = 'http://seal.ppaj.gov.my/portal/';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  console.log('Body length:', text.length);
  // find all anchor tags and their texts
  const anchors = Array.from(text.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
    .map(m => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() }))
    .filter(a => a.text.length > 0 && !a.href.startsWith('#'));
  console.log('Anchors:', anchors);
}
inspectWilmuBody();
