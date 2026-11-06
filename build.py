# 把 analysis.js 塞进 page.html，生成 index.html；再写一个版本号，手机上旧页面会自己刷新
import time
v=str(int(time.time()))
a=open('analysis.js').read().replace('if (typeof module !== "undefined") module.exports = SC;','')
open('index.html','w').write(open('page.html').read().replace('/*__ANALYSIS__*/',a).replace('__BUILD__',v))
open('version.txt','w').write(v)
