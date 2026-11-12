# 清唱框里打歌名：歌单里有这首 → 冒出金边小卡"去唱 ›"，点了进这首歌的准备页；没有的不出现
# 用法：python3 tools/walk_hit.py shots（需要先 python3 -m http.server 8765 &）
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from walk import YT_STUB, async_playwright
OUT=sys.argv[1] if len(sys.argv)>1 else 'shots'; os.makedirs(OUT,exist_ok=True)
CASES=[('映山红','映山红'),('映山','映山红'),(' 映山红！','映山红'),('我的祖国','我的祖国'),('祖国','我的祖国'),('我爱你塞北的雪','我爱你，塞北的雪'),('东方红',None),('老朋友',None),('红',None)]
async def main():
  ok=True
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
    pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e: errs.append(str(e)))
    async def route(r):
      u=r.request.url
      if 'youtube.com/iframe_api' in u: await r.fulfill(body=YT_STUB,content_type='text/javascript')
      elif 'localhost' in u: await r.continue_()
      else: await r.abort()
    await pg.route('**/*',route)
    await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1200)
    for q,want in CASES:
      await pg.fill('#acapName',q); await pg.wait_for_timeout(100)
      vis=await pg.is_visible('#acapHit'); nm=(await pg.inner_text('#acapHitNm')).strip('《》') if vis else None
      good = nm==want; ok&=good; print(('✓' if good else '✗'), repr(q), '→', nm)
    await pg.fill('#acapName','映山红'); await pg.wait_for_timeout(100)
    await pg.evaluate("document.querySelector('.acap').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(200)
    await pg.screenshot(path=f'{OUT}/h1_hit.png')
    await pg.fill('#acapName','塞北的雪'); await pg.wait_for_timeout(100); await pg.screenshot(path=f'{OUT}/h1b.png')
    await pg.fill('#acapName','映山红'); await pg.click('#acapHit'); await pg.wait_for_timeout(800)
    st=await pg.is_visible('#stepRec') and not await pg.is_visible('#stepIn')
    body=await pg.inner_text('body'); good=st and '映山红' in body; ok&=good; print(('✓' if good else '✗'),'点小卡进准备页')
    if errs: ok=False; print('页面报错', errs)
    await b.close()
  print('找歌小卡：', '全部通过' if ok else '有问题'); sys.exit(0 if ok else 1)
asyncio.run(main())
