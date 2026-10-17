async function testPKLDetail() {
  const url = 'http://kllibrary.dbkl.gov.my/client/en_US/pklsearchpage/search/detailnonmodal/ent:$002f$002fSD_ILS$002f0$002fSD_ILS:4657/ada';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('Detail status:', res.status, 'url:', res.url);
  const text = await res.text();
  console.log('Detail length:', text.length);
  const title = text.match(/<div class="displayDetailElement[^"]*">([\s\S]*?)<\/div>/gi) || [];
  console.log('Details found:', title.length);
  for (const t of title.slice(0, 10)) {
    console.log(t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }
}
testPKLDetail();
