# 锁屏回来时如果网站出了新版本：首页可以自动更新，看结果时绝不能刷新（结果会丢）
import asyncio, pathlib, sys
from playwright.async_api import async_playwright
ROOT=pathlib.Path('.').resolve()
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome'); pg=await b.new_page(viewport={'width':390,'height':844})
    async def h(route):
      u=route.request.url
      if 'version.txt' in u: return await route.fulfill(body='NEWVER')
      path=u.split('singokay.test/')[1].split('?')[0] or 'index.html'
      f=ROOT/path
      if f.exists(): return await route.fulfill(path=str(f))
      await route.abort()
    await pg.route('https://singokay.test/**', h)
    await pg.goto('https://singokay.test/', wait_until='domcontentloaded')  # 首页：应自动刷新到 ?v=NEWVER
    await pg.wait_for_timeout(1500); print('home ->', pg.url)
    await pg.evaluate('sessionStorage.clear()')
    await pg.evaluate("document.getElementById('stepIn').classList.add('hide');document.getElementById('result').classList.remove('hide')")
    await pg.evaluate("window.__keep=1");await pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    await pg.wait_for_timeout(1500); print('result ->', await pg.evaluate("window.__keep===1"), await pg.evaluate("!document.getElementById('result').classList.contains('hide')"))
    ok=pg.url.endswith('?v=NEWVER') and await pg.evaluate("window.__keep===1") and await pg.evaluate("!document.getElementById('result').classList.contains('hide')")
    await b.close()
    print('walk_ver', 'OK' if ok else 'FAIL'); sys.exit(0 if ok else 1)
asyncio.run(main())

