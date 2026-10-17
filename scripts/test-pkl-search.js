async function testPKLSearch() {
  const url = 'http://kllibrary.dbkl.gov.my/client/en_US/pklsearchpage/search/results?qu=Malaysia';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  console.log('Search length:', text.length);
  const titles = text.match(/<div class="displayDetailElement[^"]*">([\s\S]*?)<\/div>/gi) || [];
  console.log('Display details count:', titles.length);
  const links = text.match(/href="([^"]+)"/gi) || [];
  const cellLinks = links.filter(l => !l.includes('.css') && !l.includes('.js') && !l.includes('mainmenu'));
  console.log('Cell links:', cellLinks.slice(0, 10));
}
testPKLSearch();
