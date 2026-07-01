import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  page.on('response', async (response) => {
    if (response.url().includes('/api/sync-user')) {
      console.log('SYNC USER STATUS:', response.status());
      try {
        console.log('SYNC USER BODY:', await response.text());
      } catch(e) {}
    }
  });
  
  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  console.log('Clicking Get Started...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('Get Started'));
    if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('Filling login form...');
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    const visibleInputs = Array.from(inputs).filter(i => i.tabIndex !== -1);
    
    visibleInputs[0].value = 'gauravbeniwal30003@gmail.com';
    visibleInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    visibleInputs[1].value = 'beniwal@12';
    visibleInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    
    const form = document.querySelector('form');
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  
  await new Promise(r => setTimeout(r, 5000));
  
  const html = await page.evaluate(() => document.body.innerHTML);
  if (html.includes('Welcome Back') || html.includes('Create Account')) {
    console.log('Error text:', await page.evaluate(() => document.querySelector('.text-red-600')?.textContent));
  } else if (html.includes('Overview') || html.includes('Dashboard')) {
    console.log('Login successful! Dashboard loaded.');
  }
  
  await browser.close();
})();
