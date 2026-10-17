async function testSealRedirect() {
  const res = await fetch('http://seal.ppaj.gov.my/', { redirect: 'manual' });
  console.log('Status:', res.status);
  console.log('Headers:', Object.fromEntries(res.headers.entries()));
}
testSealRedirect();
