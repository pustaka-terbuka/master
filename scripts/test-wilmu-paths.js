async function testWilmuPaths() {
  const paths = [
    'http://seal.ppaj.gov.my/webopac',
    'http://seal.ppaj.gov.my/opac',
    'http://seal.ppaj.gov.my/equip',
    'http://wilmu.ppaj.gov.my/webopac',
    'http://wilmu.ppaj.gov.my/opac',
    'http://wilmu.ppaj.gov.my/equip',
    'http://wilmu.ppaj.gov.my/wilmu'
  ];
  for (const p of paths) {
    try {
      const res = await fetch(p, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
        redirect: 'manual'
      });
      console.log(p, 'Status:', res.status, 'Location:', res.headers.get('location'));
    } catch (e) {
      console.log(p, 'ERR:', e.message);
    }
  }
}
testWilmuPaths();
