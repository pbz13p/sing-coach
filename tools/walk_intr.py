# 被打断的情况：唱到一半锁屏/来电（模拟页面隐藏再回来）、耳机拔了（麦克风断开）、麦克风权限被拒。截图到 shots/
# 用法同 walk.py：先起 http.server 8765，再 python3 tools/walk_intr.py shots
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from walk import YT_STUB
from playwright.async_api import async_playwright
OUT=sys.argv[1] if len(sys.argv)>1 else 'shots'; os.makedirs(OUT,exist_ok=True)
HIDE="""(h)=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>h});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>h?'hidden':'visible'});document.dispatchEvent(new Event('visibilitychange'))}"""
async def page(b,perm):
  ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True,permissions=perm)
  await ctx.add_init_script("if(navigator.mediaDevices){const g=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.__st=[];navigator.mediaDevices.getUserMedia=c=>g(c).then(s=>{__st.push(s);return s})}")
  pg=await ctx.new_page(); logs=[]; pg.on('pageerror',lambda e: logs.append('PAGEERROR '+str(e)))
  async def route(r):
    u=r.request.url
    if 'youtube.com/iframe_api' in u: await r.fulfill(body=YT_STUB,content_type='text/javascript')
    elif 'localhost' in u: await r.continue_()
    else: await r.abort()
  await pg.route('**/*',route); await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1000)
  await pg.click('#songList button[data-i="0"]'); await pg.wait_for_timeout(1200)
  return pg,logs
async def main():
  async with async_playwright() as p:
    wav=os.path.abspath('tools/sing.wav')
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+wav,'--autoplay-policy=no-user-gesture-required'])
    # 1) 唱 16 秒后锁屏 3 秒再回来 → 提示 + 看结果
    pg,logs=await page(b,['microphone']); await pg.click('#stageGo'); await pg.wait_for_timeout(16000)
    await pg.evaluate(HIDE,True); await pg.wait_for_timeout(3000); await pg.evaluate(HIDE,False); await pg.wait_for_timeout(600)
    assert await pg.is_visible('#intr'), '锁屏回来没有提示'
    await pg.screenshot(path=f'{OUT}/11_interrupted.png')
    await pg.click('#intrA'); await pg.wait_for_selector('#result:not(.hide)',timeout=60000)
    print('锁屏回来→看结果 OK', logs)
    # 2) 唱 4 秒麦克风断开 → 从头再唱 → 回到开始唱
    pg,logs=await page(b,['microphone']); await pg.click('#stageGo'); await pg.wait_for_timeout(4000)
    await pg.evaluate("__st.forEach(s=>s.getAudioTracks().forEach(t=>t.onended&&t.onended()))"); await pg.wait_for_timeout(500)
    assert await pg.is_visible('#intr'); await pg.screenshot(path=f'{OUT}/12_mic_lost.png')
    await pg.click('#intrA'); await pg.wait_for_timeout(1500)
    assert await pg.is_visible('#stageGo'), '从头再唱后没回到开始唱'
    print('麦克风断开→从头再唱 OK', logs)
    await b.close()
    # 3) 麦克风权限被拒
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--deny-permission-prompts','--autoplay-policy=no-user-gesture-required'])
    pg,logs=await page(b,[]); await pg.click('#stageGo'); await pg.wait_for_timeout(1500)
    assert await pg.is_visible('#intr'), '麦克风被拒没有提示'
    await pg.screenshot(path=f'{OUT}/13_mic_denied.png')
    await pg.click('#intrB'); await pg.wait_for_timeout(800)
    assert await pg.is_visible('#songList'), '先不唱了没回首页'
    print('麦克风被拒 OK', logs)
    await b.close()
asyncio.run(main())
