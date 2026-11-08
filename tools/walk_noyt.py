# 伴奏视频打不开的两种情况：① 网断了（YouTube 加载不了）② 视频本身坏了（onError）
# 要求：弹大字卡片说清楚，不能让老人点“开始唱”干等；网好了点“再试一次”能恢复
# 用法同 walk.py：python3 tools/walk_noyt.py shots
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from walk import YT_STUB, async_playwright
OUT=sys.argv[1] if len(sys.argv)>1 else 'shots'; os.makedirs(OUT,exist_ok=True)
# video：第一个视频（伴奏版）坏了、原唱版好的；dead：所有视频都坏了
BAD1 = YT_STUB.replace("setTimeout(function(){o.events.onReady&&o.events.onReady({target:self})},300);", "window.__n=(window.__n||0)+1;var bad=window.__n==1;setTimeout(function(){bad?(o.events.onError&&o.events.onError({data:150})):(o.events.onReady&&o.events.onReady({target:self}))},300);")
STALL = YT_STUB.replace("this.destroy=function(){};", "this.destroy=function(){};self.__fire=function(d){st=d;o.events.onStateChange&&o.events.onStateChange({data:d,target:self})};")
BAD_ALL = YT_STUB.replace("setTimeout(function(){o.events.onReady&&o.events.onReady({target:self})},300);", "setTimeout(function(){o.events.onError&&o.events.onError({data:150})},300);")
async def main():
  ok = True
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+os.path.abspath('tools/sing.wav'),'--autoplay-policy=no-user-gesture-required'])
    for case in ('net', 'video', 'dead', 'stall'):
      ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True,permissions=['microphone'])
      pg=await ctx.new_page(); logs=[]; net={'up': False}
      pg.on('pageerror',lambda e: logs.append('PAGEERROR '+str(e)))
      async def route(r):
        u=r.request.url
        if 'youtube.com/iframe_api' in u and (net['up'] or case!='net'): await r.fulfill(body={'net':YT_STUB,'video':BAD1,'dead':BAD_ALL,'stall':STALL}[case],content_type='text/javascript')
        elif 'localhost' in u: await r.continue_()
        else: await r.abort()
      await pg.route('**/*',route)
      await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1200)
      await pg.click('#songList button[data-i="0"]')
      if case == 'stall':  # 唱到 16 秒网卡住，视频一直转圈
        await pg.wait_for_timeout(1500); await pg.click('#stageGo'); await pg.wait_for_timeout(16000)
        await pg.evaluate('window.__sc.YT_.player.__fire(3)')
      await pg.wait_for_selector('#intr:not(.hide)', timeout=16000); await pg.wait_for_timeout(400)
      await pg.screenshot(path=f'{OUT}/n_{case}.png')
      t = await pg.inner_text('#intrT'); a = await pg.inner_text('#intrA'); print(case, '卡片：', t, '/', a)
      if case == 'net':
        net['up'] = True; await ctx.set_offline(True); await ctx.set_offline(False)  # 网又连上了 → 应该自己重试
        await pg.wait_for_timeout(2500)
        vis = await pg.is_visible('#intr'); fr = await pg.inner_text('#recYtBox')
        print('  网又连上了，自动重试 →', '还是卡片' if vis else '视频出来了：' + fr.strip()[:20]); ok &= (not vis) and '模拟' in fr
        await pg.click('#stageGo'); await pg.wait_for_timeout(3000)
        ok &= await pg.is_visible('#btnStop') and not await pg.is_visible('#intr')
      elif case == 'video':
        await pg.click('#intrA'); await pg.wait_for_timeout(1500)
        vis = await pg.is_visible('#intr'); fr = await pg.inner_text('#recYtBox'); on = await pg.get_attribute('#seg [data-m="o"]', 'aria-checked')
        print('  换成原唱带唱 →', '原唱视频出来了' if (not vis and '模拟' in fr and on == 'true') else '没成功'); ok &= (not vis) and '模拟' in fr and on == 'true'
      elif case == 'stall':
        await pg.click('#intrA'); await pg.wait_for_selector('#result:not(.hide)', timeout=60000)
        print('  看刚才唱得怎么样 → 出结果了')
      else:
        await pg.click('#intrA'); await pg.wait_for_timeout(1500)  # 先换成原唱带唱，原唱也坏了 → 第二张卡片
        t2 = await pg.inner_text('#intrT'); print('  原唱也打不开 →', t2); ok &= t2 == '这首歌的视频打不开'
        await pg.screenshot(path=f'{OUT}/n_dead.png')
        await pg.click('#intrA'); await pg.wait_for_timeout(800)
        home = await pg.is_visible('#songList'); print('  换一首歌 → 回到首页' if home else '  没回到首页'); ok &= home
      if logs: print(logs); ok = False
      await ctx.close()
    await b.close()
  print('全部通过' if ok else '有问题'); sys.exit(0 if ok else 1)
asyncio.run(main())
