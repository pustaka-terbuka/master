async function testPKLDetailContent() {
  const url = 'http://kllibrary.dbkl.gov.my/client/en_US/pklsearchpage/search/detailnonmodal/ent:$002f$002fSD_ILS$002f0$002fSD_ILS:4657/ada';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  const title = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
                text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  console.log('Title match:', title ? title[1].trim() : 'none');
  const dts = text.match(/<(dt|th|div|td|span)[^>]*class="[^"]*(field|label|title|author|detail|value)[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi) || [];
  console.log('Matched elements count:', dts.length);
  for (const d of dts.slice(0, 15)) {
    console.log(d.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }
}
testPKLDetailContent();
