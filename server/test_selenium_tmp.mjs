async function buildDriver() {
  try {
    const { Builder, Browser } = await import('selenium-webdriver');
    const chrome = await import('selenium-webdriver/chrome.js');
    const options = new chrome.Options();
    options.addArguments(
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800',
      '--disable-blink-features=AutomationControlled',
      '--user-agent=Mozilla/5.0 (compatible; AcademicResearchBot/1.0; academic research)'
    );
    const driver = await new Builder()
      .forBrowser(Browser.CHROME)
      .setChromeOptions(options)
      .build();
    await driver.manage().setTimeouts({ implicit: 5000, pageLoad: 20000 });
    return driver;
  } catch (err) {
    throw new Error(`selenium-webdriver no disponible: ${err.message}`);
  }
}

console.log('intentando construir driver...');
const start = Date.now();
try {
  const driver = await buildDriver();
  console.log('DRIVER OK en', Date.now() - start, 'ms');
  await driver.get('https://www.up.edu.pe/carreras-postgrado-idiomas/carreras-pregrado/marketing/Paginas/plan-estudios.aspx');
  const title = await driver.getTitle();
  const bodyText = await driver.executeScript('return document.body ? document.body.innerText.length : 0');
  console.log('title:', title, 'bodyTextLength:', bodyText);
  await driver.quit();
} catch (e) {
  console.log('DRIVER FALLO en', Date.now() - start, 'ms:', e.message);
}
process.exit(0);
