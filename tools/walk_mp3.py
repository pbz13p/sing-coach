# 用自己 mp3 原唱的流程：选歌 → 从手机选（用 tools/sing.wav 当原唱）→ 唱 → 看大字提示有没有“这句…”评价、有没有报错
# 用法同 walk.py：python3 tools/walk_mp3.py shots
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
    await pg.set_input_files('#mpFile', 'tools/sing.wav'); await pg.wait_for_timeout(6000)
    await pg.screenshot(path=f'{OUT}/m1_stage_mp3.png')
    await pg.click('#stageGo')
    seen, shot = [], False
    for i in range(70):
      await pg.wait_for_timeout(500); t = await pg.inner_text('#liveSay')
      if not seen or seen[-1] != t: seen.append(t)
      if t.startswith(('这句', '连着')) and not shot: await pg.screenshot(path=f'{OUT}/m2_phrase.png'); shot = True
    print('大字提示：', ' → '.join(seen))
    print('\n'.join(logs) or '无报错')
    await b.close()
asyncio.run(main())
