# 唱完却没听到歌声（麦克风录到一片安静）：要弹大卡片"没听清您的歌声"，点"再唱一遍"能回到同一首歌/清唱。
# 用法：python3 tools/walk_quiet.py shots
import asyncio, sys, os, wave
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from walk import YT_STUB, async_playwright
OUT=sys.argv[1] if len(sys.argv)>1 else 'shots'; os.makedirs(OUT,exist_ok=True)
SIL=os.path.abspath(os.path.join(OUT,'silence.wav'))
w=wave.open(SIL,'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000); w.writeframes(b'\0\0'*48000*30); w.close()
async def run(p, acap, bad):
  b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+SIL+'%noloop','--autoplay-policy=no-user-gesture-required'])
  ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True,permissions=['microphone'])
  pg=await ctx.new_page(); pg.on('pageerror',lambda e: bad.append('PAGEERROR '+str(e)))
  async def route(r):
    u=r.request.url
    if 'youtube.com/iframe_api' in u: await r.fulfill(body=YT_STUB,content_type='text/javascript')
    elif 'localhost' in u: await r.continue_()
    else: await r.abort()
  await pg.route('**/*',route)
  await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1200)
  if acap: await pg.click('#btnAcap')
  else: await pg.click('#songList button[data-i="0"]'); await pg.wait_for_timeout(1500); await pg.click('#stageGo')
  await pg.wait_for_timeout(20000); await pg.click('#btnStop'); await pg.wait_for_timeout(4000)
  tag='清唱' if acap else '伴奏'
  await pg.screenshot(path=f'{OUT}/q_{tag}.png')
  if '没听清' not in (await pg.text_content('#intrT') or '') or not await pg.is_visible('#intrA'): bad.append(tag+'：没弹"没听清"卡片')
  else:
    await pg.click('#intrA'); await pg.wait_for_timeout(1500)
    if not await pg.is_visible('#btnStop' if acap else '#stageGo'): bad.append(tag+'：点"再唱一遍"没回到唱歌')
  await b.close()
async def main():
  bad=[]
  async with async_playwright() as p:
    for acap in (False, True): await run(p, acap, bad)
  print('\n'.join(bad) or '全部通过')
asyncio.run(main())
