# 手机尺寸(390x844)走一遍：首页→选歌→唱 30 秒(假麦克风放 tools/sing.wav)→结果→记录，截图到 shots/
# 横屏：W=844 H=390 python3 tools/walk.py shots_land
# 用法：node tools/mkwav.js（先生成 sing.wav）；python3 -m http.server 8765 &；python3 tools/walk.py shots
import asyncio, sys, os
from playwright.async_api import async_playwright
OUT=sys.argv[1] if len(sys.argv)>1 else 'shots'; os.makedirs(OUT,exist_ok=True)
YT_STUB = r"""
window.YT={Player:function(el,o){var d=document.createElement('div');d.style.cssText='background:#222;color:#aaa;display:grid;place-items:center;font-size:14px';d.textContent='[伴奏视频·模拟]';el.replaceWith(d);var self=this,st=-1,base=0,at=0;
 this.playVideo=function(){at=Date.now();st=1;setTimeout(function(){o.events.onStateChange&&o.events.onStateChange({data:1,target:self})},800);};
 this.pauseVideo=function(){base=self.getCurrentTime();st=2};this.stopVideo=function(){st=0};this.getPlayerState=function(){return st};this.seekTo=function(x){base=x;at=Date.now()};this.destroy=function(){};this.mute=function(){};this.unMute=function(){};this.setVolume=function(){};this.getCurrentTime=function(){return st==1?base+(Date.now()-at)/1000:base};
 setTimeout(function(){o.events.onReady&&o.events.onReady({target:self})},300);}};
setTimeout(function(){window.onYouTubeIframeAPIReady&&window.onYouTubeIframeAPIReady()},50);
"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+os.path.abspath('tools/sing.wav'),'--autoplay-policy=no-user-gesture-required'])
    ctx=await b.new_context(viewport={'width':int(os.environ.get('W',390)),'height':int(os.environ.get('H',844))},device_scale_factor=1,is_mobile=True,has_touch=True,permissions=['microphone'])
    pg=await ctx.new_page()
    logs=[]; pg.on('console',lambda m: logs.append(f'{m.type}: {m.text}')); pg.on('pageerror',lambda e: logs.append('PAGEERROR '+str(e)))
    async def route(r):
      u=r.request.url
      if 'youtube.com/iframe_api' in u: await r.fulfill(body=YT_STUB,content_type='text/javascript')
      elif 'localhost' in u: await r.continue_()
      else: await r.abort()
    await pg.route('**/*',route)
    await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1200)
    await pg.screenshot(path=f'{OUT}/01_home.png')
    assert await pg.evaluate('document.getElementById("lastCard").classList.contains("hide")'), '第一次打开不该出现空的“上次唱的”卡片'
    await pg.screenshot(path=f'{OUT}/02_home_full.png',full_page=True)
    await pg.click('#songList button[data-i="0"]'); await pg.wait_for_timeout(1500)
    await pg.screenshot(path=f'{OUT}/03_stage.png')
    await pg.click('#stageGo'); await pg.wait_for_timeout(4000)
    await pg.screenshot(path=f'{OUT}/04_sing4s.png')
    for k in range(7):  # 第一句前的 3-2-1 倒数（月亮代表我的心 12.9 秒开唱）
      await pg.wait_for_timeout(1000); await pg.screenshot(path=f'{OUT}/04c_cd{k+5}s.png')
    seen, shot = [], False
    for i in range(44):  # 15 秒里记下大字提示的变化；第一次出现“这句…”评价就拍一张
      await pg.wait_for_timeout(500); t = await pg.inner_text('#liveSay')
      if not seen or seen[-1] != t: seen.append(t)
      if i == 13: await pg.screenshot(path=f'{OUT}/05_sing18s.png')
      if t.startswith(('这句偏', '这句有')) and not shot: await pg.screenshot(path=f'{OUT}/05b_phrase.png'); shot = True
    print('唱歌时的大字提示：', ' → '.join(seen))
    await pg.click('#btnStop'); await pg.wait_for_timeout(500)
    await pg.screenshot(path=f'{OUT}/06_busy.png')
    await pg.wait_for_selector('#result:not(.hide)',timeout=60000); await pg.wait_for_timeout(800)
    await pg.screenshot(path=f'{OUT}/07_result.png')
    await pg.screenshot(path=f'{OUT}/08_result_full.png',full_page=True)
    await pg.locator('#btnShare').locator('..').screenshot(path=f'{OUT}/08b_actions.png'); assert await pg.is_visible('#btnShare'), '结果页缺“发给家人听”'
    # 回放带混响：点"听我唱的"能放、开关能切
    await pg.click('#detMore summary'); await pg.wait_for_timeout(300)
    await pg.click('#btnPlay'); await pg.wait_for_timeout(1200)
    assert not await pg.evaluate("document.getElementById('aud').paused"), '“听我唱的”放不出来'
    await pg.click('#btnRev'); assert '关' in await pg.inner_text('#btnRev'), '混响开关不动'
    await pg.click('#btnRev'); assert '开' in await pg.inner_text('#btnRev')
    await pg.locator('#btnPlay').locator('..').screenshot(path=f'{OUT}/08c_replay.png')
    await pg.click('#btnPlay'); await pg.wait_for_timeout(200); await pg.click('#detMore summary')
    if await pg.is_visible('#btnWorst'):  # 只练这一句
      await pg.click('#btnWorst'); await pg.wait_for_timeout(3000)
      await pg.screenshot(path=f'{OUT}/07b_practice_sing.png')
      await pg.wait_for_selector('#practice:not(.hide)',timeout=60000); await pg.wait_for_timeout(800)
      await pg.screenshot(path=f'{OUT}/07c_practice_result.png')
      await pg.click('#prBack'); await pg.wait_for_timeout(800)
    await pg.click('#btnHome'); await pg.wait_for_timeout(800)
    await pg.screenshot(path=f'{OUT}/09_home_after.png')
    await pg.click('#btnHist'); await pg.wait_for_timeout(800)
    await pg.screenshot(path=f'{OUT}/10_hist.png')
    print('\n'.join(logs[-30:]))
    await b.close()
if __name__=='__main__': asyncio.run(main())
