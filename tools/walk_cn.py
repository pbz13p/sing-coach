# 模拟在国内：谷歌字体、YouTube 都连不上（请求一直挂着不回，跟国内一样）
# 要求：页面 3 秒内出来；首页说明连不上 YouTube；点歌单里的歌 → 卡片「清唱这首歌」→ 能唱、能出分；合唱链接照样能用
import asyncio, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from walk import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+os.path.abspath('tools/sing.wav'),'--autoplay-policy=no-user-gesture-required'])
    ctx=await b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,permissions=['microphone'])
    pg=await ctx.new_page(); bad=[]; hung=[]
    pg.on('pageerror',lambda e: bad.append('PAGEERROR '+str(e)))
    async def route(r):
      u=r.request.url
      if 'localhost' in u: await r.continue_()
      else: hung.append(u)   # 不回应：像在国内一样一直挂着
    await pg.route('**/*',route)
    t0=time.time()
    await pg.goto('http://localhost:8765/index.html?cn=1', wait_until='commit')
    await pg.wait_for_selector('#songList button, #songList .song, #btnAcap', state='visible', timeout=15000)
    dt=time.time()-t0; print(f'页面出来用了 {dt:.1f} 秒')
    if dt>3: bad.append('页面出来太慢')
    await pg.wait_for_timeout(7000)
    if not await pg.is_visible('#cnBan'): bad.append('首页没说连不上 YouTube')
    await pg.screenshot(path='shots/cn1_home.png')
    first = await pg.query_selector('#songList [data-i], #songList button')
    await first.click(); await pg.wait_for_timeout(600)
    if not await pg.is_visible('#intr'): bad.append('点歌没出卡片')
    print('卡片：', (await pg.inner_text('#intrT')))
    await pg.screenshot(path='shots/cn2_card.png')
    await pg.click('#intrA'); await pg.wait_for_timeout(2000)
    if not await pg.is_visible('#stepRec'): bad.append('清唱这首歌没进录音')
    print('录音标题：', await pg.inner_text('#recTitle'))
    await pg.wait_for_timeout(16000); await pg.click('#btnStop')
    await pg.wait_for_selector('#result:not(.hide)',timeout=60000)
    print('出分：', await pg.inner_text('#score'))
    print('挂着的国外请求：', sorted(set(u.split('/')[2] for u in hung)))
    print('\n'.join(bad) or '全部通过'); await b.close()
asyncio.run(main())
