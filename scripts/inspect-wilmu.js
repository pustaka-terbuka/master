async function inspectWilmu() {
  const url = 'http://seal.ppaj.gov.my/portal/';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  console.log('W-ILMU length:', text.length);
  const forms = text.match(/<form[^>]+action=["']([^"']+)["'][^>]*>/gi) || [];
  console.log('Forms:', forms);
  const links = Array.from(text.matchAll(/href=["']([^"']+)["']/gi)).map(m => m[1]);
  console.log('Sample links:', links.filter(l => !l.includes('.css') && !l.includes('.js')).slice(0, 10));
}
inspectWilmu();
