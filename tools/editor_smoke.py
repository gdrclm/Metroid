"""Exercise the development editor and persistent map pins through their UI."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
URL = os.environ.get('BASE_URL', 'http://127.0.0.1:3000').rstrip('/')
Path('artifacts').mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL + '/?debug=1')
    page.wait_for_function('window.__game')
    page.locator('#play').click()
    page.keyboard.press('Backquote')
    page.locator('#debug-editor').click()
    panel = page.locator('#room-editor')
    panel.wait_for(state='visible')
    assert page.evaluate("__game.mode === 'editor'")
    frozen = page.evaluate('[__game.player.x, __game.player.y]')
    page.wait_for_timeout(150)
    assert frozen == page.evaluate('[__game.player.x, __game.player.y]')
    field = lambda name: panel.locator('[data-field=' + name + ']')
    action = lambda name: panel.locator('[data-do=' + name + ']').click()
    assert field('trajectory').is_checked()
    # Add, edit, drag and resize an optional platform, then undo every mutation.
    count = page.evaluate('__game.room.collisionLayers.length')
    action('add')
    assert page.evaluate('__game.room.collisionLayers.length') == count + 1
    field('object').select_option(str(count))
    field('x').fill('360')
    field('x').press('Tab')
    assert page.evaluate('__game.room.collisionLayers.at(-1).x') == 360
    field('y').fill('400')
    field('y').press('Tab')
    assert page.evaluate('__game.room.collisionLayers.at(-1).y') == 400
    def screen(x, y):
        return page.evaluate("""({x,y})=>{const c=document.getElementById('game'),r=c.getBoundingClientRect(),v=__game.viewport,s=Math.min(r.width/v.w,r.height/v.h);return{x:r.left+(r.width-v.w*s)/2+(x-__game.camera.x)*s,y:r.top+(r.height-v.h*s)/2+(y-__game.camera.y)*s}}""", {'x': x, 'y': y})
    start, end = screen(380, 407), screen(412, 383)
    page.mouse.move(**start)
    page.mouse.down()
    page.mouse.move(**end, steps=4)
    page.mouse.up()
    assert page.evaluate('[__game.room.collisionLayers.at(-1).x,__game.room.collisionLayers.at(-1).y]') == [392, 376]
    start, end = screen(552, 392), screen(584, 400)
    page.mouse.move(**start)
    page.mouse.down()
    page.mouse.move(**end, steps=4)
    page.mouse.up()
    assert page.evaluate('[__game.room.collisionLayers.at(-1).w,__game.room.collisionLayers.at(-1).h]') == [192, 24]
    action('undo')
    action('undo')
    assert page.evaluate('__game.room.collisionLayers.at(-1).x') == 360
    # Save/load and file export/import round trip without touching source files.
    action('save')
    action('remove')
    assert page.evaluate('__game.room.collisionLayers.length') == count
    action('load')
    assert page.evaluate('__game.room.collisionLayers.length') == count + 1
    with page.expect_download() as download:
        action('export')
    exported = Path('artifacts/editor-room.json')
    download.value.save_as(exported)
    room = json.loads(exported.read_text())
    assert room['roomId'] == 'P01' and len(room['collisionLayers']) == count + 1
    room['collisionLayers'][-1]['x'] = 400
    field('import').set_input_files({'name': 'room.json', 'mimeType': 'application/json', 'buffer': json.dumps(room).encode()})
    page.wait_for_function('__game.room.collisionLayers.at(-1).x===400')
    invalid = json.loads(json.dumps(room))
    invalid['spawnPoints']['start']['x'] = -100
    field('import').set_input_files({'name': 'bad.json', 'mimeType': 'application/json', 'buffer': json.dumps(invalid).encode()})
    page.wait_for_function("document.querySelector('[data-field=status]').textContent.includes('outside bounds')")
    assert page.evaluate('__game.room.spawnPoints.start.x') >= 0
    # Exit target and receiving spawn selectors update the actual data.
    field('kind').select_option('exits')
    field('target').select_option('P03')
    target = page.evaluate('__game.room.exits[0].targetRoomId')
    assert target == 'P03'
    action('undo')
    assert page.evaluate('__game.room.exits[0].targetRoomId') == 'P02'
    page.screenshot(path='artifacts/editor.png')
    action('close')
    assert page.evaluate("__game.mode==='playing'")
    # Select a marker, tap the centered player room, then reload the save.
    page.locator('#map-button').click()
    page.locator('#map-center').click()
    page.locator('#map-marker-type').select_option('secret')
    canvas = page.locator('#world-map')
    box = canvas.bounding_box()
    page.mouse.click(box['x'] + box['width']/2, box['y'] + box['height']/2)
    assert page.evaluate("__game.progress.markers.some(m=>m.roomId==='P01'&&m.type==='secret')")
    page.reload()
    page.wait_for_function('window.__game')
    assert page.evaluate("__game.progress.markers.some(m=>m.roomId==='P01'&&m.type==='secret')")
    assert not errors, errors
    Path('artifacts/editor-results.json').write_text(json.dumps({'editor': 'passed', 'dragResize': 'passed', 'undo': 'passed', 'importValidation': 'passed', 'mapPinPersistence': 'passed', 'pageErrors': errors}, indent=2)+'\n')
    print('EDITOR AND MAP PIN PASS')
    browser.close()
