import puppeteer from 'puppeteer';
import http from 'http';

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
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
    // Assuming identifier is first, password is second
    inputs[0].value = 'gauravbeniwal30003@gmail.com';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    inputs[1].value = 'beniwal@12';
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('Welcome Back') || b.textContent.includes('Login') || b.textContent.includes('Submit'));
    if (btn) btn.click();
    
    // submit the form
    const form = document.querySelector('form');
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  
  await new Promise(r => setTimeout(r, 3000));
  
  const html = await page.evaluate(() => document.body.innerHTML);
  if (html.includes('Welcome Back')) {
    console.log('Failed to login, AuthModal still open');
    console.log('Error text:', await page.evaluate(() => document.querySelector('.text-red-500')?.textContent));
  } else if (html.includes('Dashboard')) {
    console.log('Login successful! Dashboard loaded.');
  } else {
    console.log('View changed to something else.');
  }
  
  await browser.close();
})();
