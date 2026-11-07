from pathlib import Path
import os
ROOT=Path(__file__).resolve().parent.parent
os.chdir(ROOT)
BASE_URL=os.environ.get('BASE_URL','http://127.0.0.1:3000').rstrip('/')
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(390,844),(844,390),(320,568)]:
  ctx=b.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True)
  page=ctx.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE_URL+'/?debug=1');page.wait_for_function('window.__game')
  assert page.locator('#tutorial').count()==0
  page.screenshot(path=f'artifacts/mobile-title-{w}.png')
  page.locator('#play').click();page.wait_for_timeout(600)
  print(w,h,'game',page.evaluate('({mode:__game.mode,view:__game.viewport,player:[__game.player.x,__game.player.y]})'),flush=True)
  for action in ['left','right','down','jump','attack','dash','interact']:
   box=page.locator('[data-action='+action+']').bounding_box()
   assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=w+1 and box['y']+box['height']<=h+1,(action,box)
  right=page.locator('[data-action=right]').bounding_box();jump=page.locator('[data-action=jump]').bounding_box()
  def point(r,i):return {'x':r['x']+r['width']/2,'y':r['y']+r['height']/2,'id':i}
  cdp=ctx.new_cdp_session(page)
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point(right,1)]})
  page.wait_for_timeout(180)
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point(right,1),point(jump,2)]})
  page.wait_for_timeout(200)
  assert page.evaluate('__game.player.x')>190
  assert page.evaluate('__game.player.y')<540
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  page.wait_for_timeout(400)
  page.screenshot(path=f'artifacts/mobile-play-{w}.png')
  page.locator('#pause-button').click();page.locator('#open-settings').click()
  page.locator('#close-settings').click();page.locator('#resume').click()
  if w==390:
   page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(300)
   assert page.evaluate('__game.viewport.h')==540
   assert page.evaluate('__game.player.x>=__game.camera.x && __game.player.x<__game.camera.x+__game.viewport.w')
  assert not errors,errors
  ctx.close()
 b.close()
