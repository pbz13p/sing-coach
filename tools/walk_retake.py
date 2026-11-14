# 清唱连唱 4 遍，模拟苹果手机第二遍以后常见的问题：
#  第 2 遍：麦克风"假装在录"但全是 0（要能自己修好）
#  第 3 遍：唱完马上连点两下"再唱一遍"，同时正在放对比录音（不能开出两个录音）
#  第 4 遍：麦克风一直没声音（要弹出大白话卡片，点"重新开始"能唱）
import asyncio, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from walk import YT_STUB, async_playwright
DEAD = """
(() => { const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); window.__dead = 0;
  navigator.mediaDevices.getUserMedia = async (c) => { if (window.__dead > 0) { window.__dead--; const ac = new AudioContext(); const d = ac.createMediaStreamDestination(); return d.stream; } return orig(c); }; })();
"""
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
    await pg.route('**/*',route); await pg.add_init_script(DEAD)
    await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1200)
    await pg.fill('#acapName','我的祖国'); await pg.click('#btnAcap')
    async def finish(k):
      await pg.wait_for_timeout(20000); await pg.click("#btnStop")
      await pg.wait_for_selector('#result:not(.hide)',timeout=60000)
      sc = await pg.inner_text('#score') if await pg.query_selector('#score') else '?'
      n = await pg.evaluate('__t.hist()')
      print(f'第 {k} 遍：出分 {sc.strip()}，记录 {n} 条'); return n
    n1 = await finish(1); await pg.wait_for_timeout(6000)
    # 第 2 遍：前两次拿到的麦克风都是哑的
    await pg.evaluate('window.__dead=1'); await pg.click('#again')
    await pg.wait_for_timeout(5000); fixed = await pg.evaluate('__t.fix()')
    print('第 2 遍：哑麦克风自动修了', fixed, '次')
    n2 = await finish(2)
    if n2 != n1+1: bad.append('第 2 遍没存进记录')
    # 第 3 遍：在放对比录音时连点两下
    await pg.wait_for_timeout(6000)
    if await pg.is_visible('#abPrev'): await pg.click('#abPrev')
    await pg.evaluate('document.getElementById("again").click(); document.getElementById("again").click();')
    await pg.wait_for_timeout(1500)
    playing = await pg.evaluate('__t.ab()')
    if playing: bad.append('开始唱了，对比录音还在放')
    n3 = await finish(3)
    if n3 != n2+1: bad.append(f'第 3 遍记录数不对：{n3}')
    # 第 4 遍：麦克风一直哑
    await pg.wait_for_timeout(6000)
    await pg.evaluate('window.__dead=9'); await pg.click('#again')
    await pg.wait_for_selector('#intr:not(.hide)',timeout=20000)
    print('第 4 遍：卡片 →', (await pg.inner_text('#intrT')))
    await pg.screenshot(path='shots/r4_dead.png')
    await pg.evaluate('window.__dead=0'); await pg.click('#intrA')
    await pg.wait_for_timeout(1500)
    if not await pg.is_visible('#stepRec'): bad.append('点了重新开始没进录音')
    n4 = await finish(4)
    if n4 != n3+1: bad.append(f'第 4 遍记录数不对：{n4}')
    print('\n'.join(bad) or '全部通过')
    await b.close()
asyncio.run(main())
