async function inspectResults() {
  const url = 'http://kllibrary.dbkl.gov.my/client/en_US/pklsearchpage/search/results?qu=Malaysia';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  const detailClicks = text.match(/href="([^"]*cellclick[^"]*)"/gi) || [];
  console.log('Cell clicks:', detailClicks.slice(0, 5));
  const titles = text.match(/<div class="displayDetailElement[^"]*">([\s\S]*?)<\/div>/gi) ||
                 text.match(/class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/(a|div|span)>/gi) || [];
  console.log('Sample titles found:', titles.slice(0, 5).map(t => t.replace(/<[^>]+>/g, '').trim()));
}
inspectResults();
