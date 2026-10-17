async function inspectWilmuRest() {
  const url = 'http://wilmu.ppaj.gov.my/portal/index.php?rest_route=/';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await res.json();
  console.log('Routes count:', Object.keys(data.routes || {}).length);
  const routes = Object.keys(data.routes || {});
  console.log('Sample routes:', routes.filter(r => !r.startsWith('/wp/v2')).slice(0, 20));
  console.log('WP routes:', routes.filter(r => r.includes('post') || r.includes('page') || r.includes('search') || r.includes('book')));
}
inspectWilmuRest();
