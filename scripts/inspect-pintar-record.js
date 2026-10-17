async function testRecord() {
  const url = 'https://pintar.ppanpk.gov.my/catalog/records/82891';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  console.log('Status:', res.status, 'Length:', text.length);
  // Look for metadata, JSON-LD, Dublin Core, MARC fields
  const jsonLd = text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (jsonLd) {
    console.log('Found JSON-LD:', jsonLd[1]);
  }
  const metas = text.match(/<meta[^>]+>/gi) || [];
  console.log('Sample metas:', metas.filter(m => m.includes('title') || m.includes('author') || m.includes('description') || m.includes('isbn')));
  const h1 = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) console.log('H1:', h1[1].replace(/<[^>]+>/g, '').trim());
}
testRecord();
