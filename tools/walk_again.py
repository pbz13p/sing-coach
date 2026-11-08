# 唱两遍同一首歌：第一遍唱完 → 点"再唱一遍" → 第二遍唱完，看"跟上一遍比"卡片
# 用法同 walk.py：python3 tools/walk_again.py shots
import asyncio, sys, os
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
    await pg.click('#songList button[data-i="0"]'); await pg.wait_for_timeout(1500)
    for k in range(2):
      await pg.click('#stageGo'); await pg.wait_for_timeout(int(os.environ.get('SING', 26))*1000)
      await pg.click('#btnStop')
      await pg.wait_for_selector('#result:not(.hide)',timeout=60000); await pg.wait_for_timeout(1500)
      if k == 0:
        await pg.click('#again'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{OUT}/a1_again_stage.png')
    vis = await pg.is_visible('#cmpCard')
    print('跟上一遍比卡片：', '有' if vis else '没有')
    if vis:
      await pg.locator('#cmpCard').scroll_into_view_if_needed(); await pg.wait_for_timeout(400)
      await pg.screenshot(path=f'{OUT}/a2_compare.png')
      print(await pg.inner_text('#cmpCard'))
    await pg.evaluate('window.scrollTo(0,0)'); await pg.screenshot(path=f'{OUT}/a3_result2.png')
    print('\n'.join(logs) or '无报错')
    await b.close()
asyncio.run(main())
