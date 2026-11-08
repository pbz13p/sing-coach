# 唱两遍同一首歌：第一遍唱完 → 点"再唱一遍" → 第二遍唱完，看"跟上一遍比"卡片
# 用法同 walk.py：python3 tools/walk_again.py shots
import asyncio, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from walk import YT_STUB, async_playwright
OUT=sys.argv[1] if len(sys.argv)>1 else 'shots'; os.makedirs(OUT,exist_ok=True)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+os.path.abspath('tools/sing.wav'),'--autoplay-policy=no-user-gesture-required'])
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True,permissions=['microphone'])
    pg=await ctx.new_page(); logs=[]
    pg.on('pageerror',lambda e: logs.append('PAGEERROR '+str(e)))
    async def route(r):
      u=r.request.url
      if 'youtube.com/iframe_api' in u: await r.fulfill(body=YT_STUB,content_type='text/javascript')
      elif 'localhost' in u: await r.continue_()
      else: await r.abort()
    await pg.route('**/*',route)
    await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1200)
    ACAP = os.environ.get('ACAP') == '1'  # ACAP=1：走清唱（带歌名）这条路
    if ACAP:
      await pg.fill('#acapName', '我的祖国'); await pg.screenshot(path=f'{OUT}/c0_acap_home.png')
      await pg.click('#btnAcap'); await pg.wait_for_timeout(1500)
    else:
      await pg.click('#songList button[data-i="0"]'); await pg.wait_for_timeout(1500)
    pre = 'c' if ACAP else 'a'
    stats = []
    for k in range(int(os.environ.get('TAKES', 3))):
      await pg.screenshot(path=f'{OUT}/{pre}_take{k+1}_start.png')
      if not ACAP: await pg.click('#stageGo')
      await pg.wait_for_timeout(int(os.environ.get('SING', 26))*1000)
      await pg.click('#btnStop'); t0 = time.time()
      await pg.wait_for_selector('#result:not(.hide)',timeout=60000); dt = time.time() - t0; await pg.wait_for_timeout(1500)
      heap = await pg.evaluate('performance.memory ? Math.round(performance.memory.usedJSHeapSize/1e6) : -1')
      print(f'第 {k+1} 遍：出结果 {dt:.1f} 秒，内存 {heap} MB'); stats.append((dt, heap))
      if k < int(os.environ.get('TAKES', 3)) - 1:
        await pg.click('#again'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{OUT}/{pre}1_again_stage.png')
    vis = await pg.is_visible('#cmpCard')
    print('跟上一遍比卡片：', '有' if vis else '没有')
    if vis:
      await pg.locator('#cmpCard').scroll_into_view_if_needed(); await pg.wait_for_timeout(400)
      await pg.screenshot(path=f'{OUT}/{pre}2_compare.png')
      print(await pg.inner_text('#cmpCard'))
    await pg.evaluate('window.scrollTo(0,0)'); await pg.screenshot(path=f'{OUT}/{pre}3_result2.png')
    if len(stats) >= 3 and (stats[-1][1] > stats[0][1] + 40 or stats[-1][0] > stats[0][0] * 2 + 2): logs.append('连唱越来越慢/越占内存：' + str(stats))
    print('\n'.join(logs) or '无报错')
    await b.close()
asyncio.run(main())
