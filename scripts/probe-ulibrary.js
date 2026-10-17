async function testULib() {
  try {
    const res = await fetch('https://www.u-library.gov.my/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(10000)
    });
    console.log('u-library status:', res.status, 'url:', res.url);
    const text = await res.text();
    console.log('len:', text.length);
    const title = text.match(/<title[^>]*>(.*?)<\/title>/i);
    if (title) console.log('Title:', title[1].trim());
  } catch (err) {
    console.log('u-lib error:', err.message);
  }
}
testULib();
