import { Builder, Browser } from 'selenium-webdriver';
import * as chrome from 'selenium-webdriver/chrome.js';
import fs from 'fs';

const options = new chrome.Options();
options.addArguments(
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  '--window-size=1280,800', '--disable-blink-features=AutomationControlled',
  '--user-agent=Mozilla/5.0 (compatible; AcademicResearchBot/1.0; academic research)'
);
const driver = await new Builder().forBrowser(Browser.CHROME).setChromeOptions(options).build();
await driver.manage().setTimeouts({ implicit: 5000, pageLoad: 20000 });

await driver.get('https://www.up.edu.pe/carreras-postgrado-idiomas/carreras-pregrado/marketing/Paginas/plan-estudios.aspx');
await new Promise(r => setTimeout(r, 3000));
const bodyText = await driver.executeScript('return document.body.innerText');
const bodyHtml = await driver.executeScript('return document.documentElement.outerHTML');
fs.writeFileSync('./sample_pacifico_selenium.txt', bodyText);
fs.writeFileSync('./sample_pacifico_selenium.html', bodyHtml);
console.log('bodyText length:', bodyText.length);
console.log('bodyHtml length:', bodyHtml.length);
console.log('--- bodyText ---');
console.log(bodyText);
await driver.quit();
process.exit(0);
