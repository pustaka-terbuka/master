async function testPKL() {
  const url = 'http://kllibrary.dbkl.gov.my/client/en_US/pklsearchpage/';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  console.log('PKL length:', text.length);
  // look for search forms, search endpoints, or search results
  const forms = text.match(/<form[^>]+action=["']([^"']+)["'][^>]*>/gi) || [];
  console.log('Forms:', forms);
  // look for client urls
  const links = text.match(/href=["']([^"']+)["']/gi) || [];
  console.log('Sample links:', links.filter(l => l.includes('search') || l.includes('detail')).slice(0, 10));
}
testPKL();
