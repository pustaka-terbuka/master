async function getPages() {
  const res = await fetch('http://seal.ppaj.gov.my/portal/index.php?rest_route=/wp/v2/pages');
  const pages = await res.json();
  console.log('Result:', pages);
}
getPages();
