# 只哼几秒就停：不能给高分，要说"唱得太短了"；唱十几秒：分数要标"只是参考"
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from walk import YT_STUB, async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+os.path.abspath('tools/sing.wav'),'--autoplay-policy=no-user-gesture-required'])
    ctx=await b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,permissions=['microphone'])
    pg=await ctx.new_page(); bad=[]
    pg.on('pageerror',lambda e: bad.append('PAGEERROR '+str(e)))
    async def route(r):
      u=r.request.url
      if 'youtube.com/iframe_api' in u: await r.fulfill(body=YT_STUB,content_type='text/javascript')
      elif 'localhost' in u: await r.continue_()
      else: await r.abort()
    await pg.route('**/*',route)
    await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1200)
    await pg.click('#btnAcap'); await pg.wait_for_timeout(5000); await pg.click('#btnStop')
    await pg.wait_for_selector('#intr:not(.hide)',timeout=30000)
    t=await pg.inner_text('#intrT'); p_=await pg.inner_text('#intrP'); print('唱 5 秒：', t, '|', p_.replace('\n',' '))
    if '短' not in t: bad.append('5 秒没说太短')
    if await pg.is_visible('#result'): bad.append('5 秒也出了分')
    await pg.screenshot(path='shots/s1_short.png')
    await pg.click('#intrA'); await pg.wait_for_timeout(18000); await pg.click('#btnStop')
    await pg.wait_for_selector('#result:not(.hide)',timeout=60000)
    v=await pg.inner_text('#verdict'); sc=await pg.inner_text('#score'); print('唱 18 秒：', sc, v)
    if '参考' not in v: bad.append('18 秒没标参考')
    print('\n'.join(bad) or '全部通过'); await b.close()
asyncio.run(main())
