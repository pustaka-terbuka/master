async function inspectLinks() {
  const url = 'http://kllibrary.dbkl.gov.my/client/en_US/pklsearchpage/search/results?qu=Malaysia';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  const allLinks = Array.from(text.matchAll(/href="([^"]+)"/gi)).map(m => m[1]);
  const resultsLinks = allLinks.filter(l => l.includes('results.'));
  console.log('Results links count:', resultsLinks.length);
  console.log('Unique results actions:', [...new Set(resultsLinks.map(l => l.split('?')[0]))]);
  console.log('Sample links:', resultsLinks.slice(0, 5));
}
inspectLinks();
