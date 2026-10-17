async function inspectFull() {
  const url = 'https://pintar.ppanpk.gov.my/catalog/records/82891';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  // find tables, dt/dd, or divs
  const matches = text.match(/<(dt|th|div)[^>]*>(.*?)<\/(dt|th|div)>\s*<(dd|td|div)[^>]*>([\s\S]*?)<\/(dd|td|div)>/gi) || [];
  console.log('Key-value pairs found:', matches.length);
  for (const m of matches.slice(0, 15)) {
    console.log(m.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }
}
inspectFull();
