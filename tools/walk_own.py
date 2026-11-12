# 合唱团的歌：首页“团里的歌存在手机里？”选一首（用 tools/sing.wav）→ 调低一档 → 跟着唱 → 出结果；刷新后歌和调子都还在
# 用法：python3 tools/walk_own.py shots
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
    await pg.screenshot(path=f'{OUT}/o0_home.png')
    assert await pg.is_visible('#btnAcapFile'), '首页要有“团里的歌”入口'
    await pg.set_input_files('#refFile', 'tools/sing.wav'); await pg.wait_for_timeout(400)
    await pg.locator('.acap').screenshot(path=f'{OUT}/o1_loading.png')
    for i in range(60):
      await pg.wait_for_timeout(500)
      if await pg.is_visible('#keyAcap'): break
    assert await pg.is_visible('#keyAcap'), '准备好后要出现调子'
    assert '跟着这首歌唱' in await pg.inner_text('#btnAcap')
    if os.environ.get('NOKEY'):
      await pg.click('#btnAcap'); await pg.wait_for_timeout(3000)
      for i in range(120):
        await pg.wait_for_timeout(500)
        if await pg.is_visible('#result'): break
      await pg.wait_for_timeout(800); print('原调分数', await pg.inner_text('#result .ring b, #result b')); await b.close(); return
    await pg.click('#keyAcap .kb[data-d="-1"]')
    for i in range(40):
      await pg.wait_for_timeout(300)
      if (await pg.inner_text('#keyAcap .kv')) == '低 1 档': break
    assert (await pg.inner_text('#keyAcap .kv')) == '低 1 档'
    await pg.locator('.acap').screenshot(path=f'{OUT}/o2_ready.png')
    await pg.click('#btnAcap')
    await pg.wait_for_timeout(3000); await pg.screenshot(path=f'{OUT}/o3_sing.png')
    title = await pg.inner_text('#recTitle')
    for i in range(120):
      await pg.wait_for_timeout(500)
      if await pg.is_visible('#result'): break
    ok = await pg.is_visible('#result')
    await pg.wait_for_timeout(800); await pg.screenshot(path=f'{OUT}/o4_result.png')
    # 用了“低一档”：点“原唱这一句”放出来的那段也要是变过调的（不是整首原调）
    refOk = None
    if await pg.locator('#phList [data-phr]').count():
      await pg.evaluate("document.querySelector('#phList [data-phr]').click()"); await pg.wait_for_timeout(2500)
      refOk = await pg.evaluate("(() => { const r = window.__sc.refPlay(); return !!(r && r.buffer && r.buffer !== window.__sc.REF.ab && r.buffer.duration < 30) })()")
      assert refOk, '变调后“原唱这一句”应该放变调的那一段'
    # 内置歌放了 mp3 再回首页，自己的歌要自动回来（以前要刷新）
    await pg.click('#btnHome'); await pg.wait_for_timeout(500)
    await pg.click('#songList button[data-i="0"]'); await pg.wait_for_timeout(1200)
    await pg.set_input_files('#mpFile', 'tools/sing.wav'); await pg.wait_for_timeout(6000)
    await pg.click('#stageBack'); await pg.wait_for_timeout(500)
    back = False
    for i in range(60):
      await pg.wait_for_timeout(500)
      if await pg.is_visible('#keyAcap') and '跟着这首歌唱' in await pg.inner_text('#btnAcap'): back = True; break
    print('原唱这一句变调', refOk, '| 用过内置歌 mp3 回首页后自己的歌回来', back)
    assert back, '回首页后自己导入的歌应自动回来'
    await pg.reload(); await pg.wait_for_timeout(1500)
    for i in range(60):
      await pg.wait_for_timeout(500)
      if await pg.is_visible('#keyAcap') and (await pg.inner_text('#keyAcap .kv')) == '低 1 档': break
    kept = (await pg.inner_text('#acapSongNm')), (await pg.inner_text('#keyAcap .kv'))
    await pg.click('#acapSongOff'); await pg.wait_for_timeout(300)
    gone = await pg.is_visible('#btnAcapFile') and '开始清唱' in await pg.inner_text('#btnAcap')
    print('标题', title, '| 出结果', ok, '| 刷新后', kept, '| 不用了后恢复清唱', gone)
    print('\n'.join(logs) or '无报错')
    assert ok and kept[1] == '低 1 档' and gone and not logs
    print('导入团里的歌走查通过')
    await b.close()
asyncio.run(main())
