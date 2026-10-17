async function testIds() {
  const ids = [1, 100, 1000, 10000, 50000, 80000, 82891];
  for (const id of ids) {
    try {
      const res = await fetch(`https://pintar.ppanpk.gov.my/catalog/records/${id}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000)
      });
      console.log(`ID ${id}: status ${res.status}`);
      if (res.status === 200) {
        const t = await res.text();
        const h1 = t.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (h1) console.log(`  Title: ${h1[1].replace(/<[^>]+>/g, '').trim().slice(0, 50)}`);
      }
    } catch (e) {
      console.log(`ID ${id} ERR: ${e.message}`);
    }
  }
}
testIds();
