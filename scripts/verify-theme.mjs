// Uses only the isolated local Auth/database fixture, never real accounts.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({executablePath:process.env.PERFORMANCE_CHROME_PATH});
const context = await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'});
const page = await context.newPage();
const errors = [];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!/WebSocket|realtime\/v1/.test(m.text())) errors.push(m.text());});
const base='http://localhost:3101';
async function ready(route) {
  await page.getByRole('heading',{name:route.includes('reset')?'Set your password':route.includes('view=board')?'Project tasks':route.includes('projects')?'Projects':'Admin Project Center',exact:true}).waitFor();
}
mkdirSync('docs/design',{recursive:true});
try {
  await page.goto(base);
  await page.getByRole('textbox',{name:'Email address'}).fill('projectadmin@fixture.test');
  await page.getByRole('textbox',{name:'Password',exact:true}).fill('fixture-password');
  await page.getByRole('button',{name:'Sign in'}).click();
  await page.getByRole('heading',{name:'Project tasks',exact:true}).waitFor();
  await page.goto(base+'/portal');
  await page.getByRole('heading',{name:'Admin Project Center',exact:true}).waitFor();
  const toggle=page.getByRole('button',{name:'Dark mode',exact:true});
  assert.equal(await toggle.getAttribute('aria-pressed'),'false');
  await page.screenshot({path:'docs/design/dashboard-light.png',fullPage:true});
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  await page.reload();
  await page.getByRole('heading',{name:'Admin Project Center',exact:true}).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.screenshot({path:'docs/design/dashboard-dark.png',fullPage:true});
  for (const route of ['/portal/projects','/?view=board','/auth/reset']) {
    await page.goto(base+route);
    await ready(route);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.screenshot({path:`docs/design/${route.includes('projects')?'projects':route.includes('reset')?'reset':'board'}-dark.png`,fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  for (const theme of ['dark','light']) {
    await page.goto(base+'/portal');
    if(await page.locator('html').getAttribute('data-theme')!==theme) await toggle.click();
    for(const route of ['/portal','/portal/projects','/?view=board','/auth/reset']) {
      await page.goto(base+route);
      await ready(route);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,`${theme} overflow ${route}`);
    }
    await page.goto(base+'/portal');
    await ready('/portal');
    await page.screenshot({path:`docs/design/mobile-${theme}.png`,fullPage:true});
  }
  // System preference applies when there is no explicit saved preference.
  const system = await browser.newContext({colorScheme:'dark'});
  const systemPage=await system.newPage();
  await systemPage.goto(base);
  assert.equal(await systemPage.locator('html').getAttribute('data-theme'),'dark');
  await systemPage.getByRole('button',{name:'Dark mode'}).click();
  await systemPage.reload();
  assert.equal(await systemPage.locator('html').getAttribute('data-theme'),'light');
  await system.close();
  assert.deepEqual(errors,[]);
  writeFileSync('docs/design/verification.json',JSON.stringify({passed:true,checks:['light/dark dashboard','persisted theme after reload and navigation','system preference and explicit override','390px dashboard/register/board/reset overflow','no runtime or hydration errors'],environment:'Isolated fixture; no live data changes'},null,2));
  console.log('PASS light/dark modes, persistence, system preference, mobile routes, runtime checks');
} finally { await browser.close(); }
