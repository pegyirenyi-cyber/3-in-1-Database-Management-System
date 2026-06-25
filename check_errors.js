import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER_ERROR:', msg.text(), msg.location().url);
    }
  });

  page.on('requestfailed', request => {
    console.log('REQUEST_FAILED:', request.url(), request.failure().errorText);
  });

  page.on('pageerror', error => {
    console.log('PAGE_ERROR:', error.message);
  });

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  
  // Wait a bit just in case
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  await browser.close();
})();
