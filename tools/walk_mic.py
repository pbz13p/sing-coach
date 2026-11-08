# 麦克风有没有关：进唱歌页→返回首页，麦克风要关掉；再进来能正常唱；清唱中途返回也要关。
# 用法：python3 tools/walk_mic.py shots
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from walk import YT_STUB, async_playwright
OUT=sys.argv[1] if len(sys.argv)>1 else 'shots'; os.makedirs(OUT,exist_ok=True)
SPY = """(()=>{ window.__trk=[]; const g=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia=async c=>{ const s=await g(c); s.getTracks().forEach(t=>__trk.push(t)); return s; }; })()"""
LIVE = "__trk.filter(t=>t.readyState==='live').length"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+os.path.abspath('tools/sing.wav'),'--autoplay-policy=no-user-gesture-required'])
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True,permissions=['microphone'])
    await ctx.add_init_script(SPY)
    pg=await ctx.new_page(); bad=[]
    pg.on('pageerror',lambda e: bad.append('PAGEERROR '+str(e)))
    async def route(r):
      u=r.request.url
      if 'youtube.com/iframe_api' in u: await r.fulfill(body=YT_STUB,content_type='text/javascript')
      elif 'localhost' in u: await r.continue_()
      else: await r.abort()
    await pg.route('**/*',route)
    await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1200)
    await pg.click('#songList button[data-i="0"]'); await pg.wait_for_timeout(1500)
    if await pg.evaluate(LIVE) < 1: bad.append('进唱歌页没先拿麦克风')
    await pg.click('#stageBack'); await pg.wait_for_timeout(500)
    n = await pg.evaluate(LIVE); print('选歌后返回首页，还开着的麦克风：', n)
    if n: bad.append('返回首页后麦克风没关')
    await pg.click('#btnAcap'); await pg.wait_for_timeout(4000)
    await pg.evaluate('window.scrollTo(0,0)'); await pg.click('#stageBack'); await pg.wait_for_timeout(500)
    n = await pg.evaluate(LIVE); print('清唱中途返回首页，还开着的麦克风：', n)
    if n: bad.append('清唱中途返回后麦克风没关')
    await pg.click('#btnAcap'); await pg.wait_for_timeout(14000); await pg.click('#btnStop')
    await pg.wait_for_selector('#result:not(.hide)',timeout=60000)
    n = await pg.evaluate(LIVE); print('唱完出结果，还开着的麦克风：', n)
    if n: bad.append('唱完后麦克风没关')
    print('\n'.join(bad) or '全部通过')
    await b.close()
asyncio.run(main())
