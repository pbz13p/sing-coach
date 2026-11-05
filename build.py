# 把 analysis.js 塞进 page.html，生成 index.html
a=open('analysis.js').read().replace('if (typeof module !== "undefined") module.exports = SC;','')
open('index.html','w').write(open('page.html').read().replace('/*__ANALYSIS__*/',a))
