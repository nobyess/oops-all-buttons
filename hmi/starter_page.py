"""One-time project content made entirely from ordinary pages, tags and assets."""
import base64
from .pages import page_defaults
from .inline_text import bind_inline_text

DEMO_TAGS = [('demo-tank-level', 'DemoTankLevel', 'REAL', 65.0),
             ('demo-pump-enabled', 'DemoPumpEnabled', 'BOOL', False),
             ('demo-mode', 'DemoMode', 'INT', 1)]

OPERATOR_NOTES = """# Operator notes
## Before you connect equipment
Read a known tag value before configuring write actions. Check its address, data type, and engineering units.
> Keep this application on a trusted network. Use care around PLCs and equipment that can move or create hazards.
---
## Make these notes yours
This is an ordinary Markdown text asset. Open Assets, select Start Page Notes, and edit its text.
The Text Viewer displays this file. Its content is loaded when you open the page.
## Demo controls
Fill sets DemoTankLevel to 100%. Drain sets it to 0%. Click the numeric input to enter a level between 0 and 100%.
Start / Stop toggles DemoPumpEnabled. The symbol spins and its status changes while enabled.
The dropdown and listbox share DemoMode: Off = 0, Manual = 1, Automatic = 2.
These memory tags do not command any device. Their initial values return when the server restarts.
"""

PUMP_SVG = b'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="3"/><path d="M50 50 C25 12 65 5 61 31Z M50 50 C96 40 89 79 66 68Z M50 50 C30 94 0 64 25 54Z" fill="currentColor" data-symbol-fill-color="fore" stroke="none"/><circle cx="50" cy="50" r="6" fill="currentColor" data-symbol-fill-color="fore" stroke="none"/></svg>'''


def seed_start_page(service):
    """Called only for a pristine application database, before polling starts."""
    def asset(kind, name, filename, raw):
        return service.assets.save({'kind': kind, 'name': name, 'filename': filename,
                                    'category': 'Getting Started', 'data': base64.b64encode(raw).decode()})
    notes = asset('text', 'Start Page Notes', 'start-page-notes.md', OPERATOR_NOTES.encode())
    pump = asset('symbol', 'Demo Pump', 'demo-pump.svg', PUMP_SVG)
    controls = []
    def control(kind, identity, x, y, width, height, **props):
        result = dict(id='start-'+identity, name=identity.replace('-', ' ').title(), type=kind,
                      left=x, top=y, width=width, height=height, fontFamily='default', fontSize=16,
                      backColor='#ffffff00', foreColor='#243247', visible=True, bold=False, italic=False,
                      textHorizontalAlignment='left', textVerticalAlignment='top', actions=[], events=[])
        result.update(props);controls.append(result);return result
    def label(identity, text, x, y, width, height, size=16, **props):
        return control('label', identity, x, y, width, height, text=text, fontSize=size, **props)
    def line(identity, y):
        control('square', identity, 32, y, 936, 1, strokeWidth=0, backColor='#dce2e8')
    def panel(identity, x, y, width, height):
        control('square', identity, x, y, width, height, strokeWidth=1, edgeDiameter=12,
                backColor='#f1f5f9', foreColor='#dce2e8')
    def action(identity, tag, kind, **props):
        return dict(id='start-action-'+identity, tag=tag, action=kind, trigger='click', enabled=True, **props)
    def event(identity, kind, **props):
        return dict(id='start-event-'+identity, tag='demo-pump-enabled', operator='=',
                    operand={'kind':'value','value':1}, action=kind, enabled=True, **props)
    def button(identity, text, x, y, width, actions, **props):
        return control('button', identity, x, y, width, 42, text=text, backColor='#ffffff',
                       textHorizontalAlignment='center', textVerticalAlignment='center', actions=actions, **props)

    label('brand', 'OOPS! ALL BUTTONS', 32, 28, 600, 22, 12, foreColor='#176985')
    label('welcome', 'Welcome. Make yourself at home.', 32, 64, 930, 48, 30, bold=True)
    label('welcome-description', 'Connect your devices, bring their values into tags, and build a page that makes them useful.', 32, 126, 900, 56, 18)
    label('welcome-hint', 'This is your Start Page. Try the examples below, edit them to see how they work, or remove this page when you are ready.', 32, 200, 900, 60, foreColor='#64748b')
    line('welcome-divider', 284)
    label('getting-started-title', 'From a device to your first screen', 32, 312, 920, 36, 23, bold=True)
    steps = [('01 / CONNECT', 'Add a data source', 'Open the menu → Data Sources & Tags. Add your device, choose its driver, enter the connection settings, and test the connection.'),
             ('02 / READ', 'Create a tag', 'Select the source and add a tag. Browse or enter its address, choose its data type, then read it to check the value.'),
             ('03 / BUILD', 'Place a control', 'Open Pages, add a page, and choose Edit Page. Place a Numeric Display, select your tag, then click Save & View.')]
    for index,(step,title,text) in enumerate(steps):
        x=32+index*320
        label('step-'+str(index), step, x, 372, 292, 22, 12, foreColor='#176985')
        label('step-title-'+str(index), title, x, 410, 292, 30, 18, bold=True)
        label('step-detail-'+str(index), text, x, 452, 292, 146, 15)
    label('no-device-needed', 'No device handy? Use System → Memory. The examples below use memory tags, so you can explore without connecting to equipment.', 32, 616, 930, 64, foreColor='#176985')
    line('setup-divider', 708)
    label('demo-title', 'Try a small control panel', 32, 738, 930, 36, 23, bold=True)
    label('demo-description', 'One set of demo tags. Several ways to see and change them. No device commands.', 32, 786, 930, 30, foreColor='#64748b')
    panel('tank-panel', 32, 844, 456, 356);panel('pump-panel', 512, 844, 456, 356)
    label('tank-title', 'Demo tank', 48, 860, 400, 28, 18, bold=True)
    control('level', 'tank-level', 56, 910, 106, 216, binding={'tag':'demo-tank-level'}, minimum=0, maximum=100,
            fillDirection='bottom_up', showValue=False, quietSurface=True, strokeWidth=2, edgeDiameter=0,
            backColor='#56b8d3', foreColor='#64748b')
    for value,y in [('100%',910),('50%',1008),('0%',1106)]:label('tank-scale-'+value, value, 174, y, 52, 22, 12, foreColor='#64748b')
    label('level-number-title', 'Level indicator + numeric display', 238, 910, 226, 48, 13, foreColor='#64748b')
    control('numeric', 'tank-reading', 238, 974, 220, 50, binding={'tag':'demo-tank-level'}, displayDigits=1,
            unitText='%', fontSize=30, textVerticalAlignment='center')
    button('fill', 'Fill', 238, 1044, 102, [action('fill','demo-tank-level','set',value=100)])
    button('drain', 'Drain', 348, 1044, 102, [action('drain','demo-tank-level','set',value=0)])
    label('tank-path', 'System\\Memory\\DemoTankLevel', 48, 1150, 420, 28, 12, foreColor='#64748b')
    label('pump-title', 'Pump command', 528, 860, 400, 28, 18, bold=True)
    control('symbol', 'pump-symbol', 542, 916, 88, 88, image=pump['url'], imageName=pump['name'],
            strokeWidth=2, events=[event('pump-spin','spin',rpm=12)], foreColor='#176985')
    label('pump-status', 'Stopped', 654, 918, 270, 34, 21, events=[event('pump-running','set_content',content='Running',contentStyle={'foreColor':'#16794b','backColor':'#ffffff00'})])
    label('pump-controls-hint', 'Symbol + label + icon button', 654, 962, 280, 44, 13, foreColor='#64748b')
    button('pump-toggle','Start pump', 528, 1032, 204, [action('pump-toggle','demo-pump-enabled','toggle')],
           buttonDisplay='both',buttonArtworkKind='icon',icon='power',iconSize=20,iconPosition='before',iconColor='#176985',
           events=[event('pump-button','set_content',content='Stop pump')])
    label('pump-path', 'System\\Memory\\DemoPumpEnabled', 528, 1092, 420, 24, 12, foreColor='#64748b')
    label('level-input-label', 'Set tank level (0–100%)', 528, 1146, 260, 28, 14)
    button('level-input', '@{System\\Memory\\DemoTankLevel|dp=1;min=1;zeros=1} %', 792, 1138, 156,
           [action('level-input','demo-tank-level','value_input',minimum=0,maximum=100,allowDecimal=True,promptText='Set tank level',unitText='%')])
    panel('dropdown-panel', 32, 1224, 456, 244);panel('listbox-panel', 512, 1224, 456, 244)
    label('dropdown-title', 'Dropdown', 48, 1240, 400, 28, 18, bold=True)
    label('dropdown-hint','Operating mode',48,1282,400,22,14)
    control('dropdown','mode-dropdown',48,1320,420,42,binding={'tag':'demo-mode'},elements=['Off','Manual','Automatic'],
            backColor='#ffffff',textVerticalAlignment='center')
    label('mode-path','System\\Memory\\DemoMode',48,1380,420,24,12,foreColor='#64748b')
    label('mode-index-hint','First element = 0',48,1418,420,24,12,foreColor='#64748b')
    label('listbox-title','Listbox',528,1240,400,28,18,bold=True)
    control('listbox','mode-listbox',528,1284,420,128,binding={'tag':'demo-mode'},elements=['Off','Manual','Automatic'],backColor='#ffffff')
    label('listbox-hint','Same Mode tag. Change either control.',528,1426,420,24,12,foreColor='#64748b')
    label('trend-title','See your changes on a live trend',32,1504,930,36,22,bold=True)
    control('trend','level-trend',32,1560,936,270,timespan=60,fontSize=13,backColor='#ffffff',
            series=[{'id':'start-level-series','tag':'demo-tank-level','color':'#176985','minimum':0,'maximum':100}])
    label('trend-hint','Tank level (%) · 60 seconds · Change the level above to add movement to the plot.',32,1842,930,42,13,foreColor='#64748b')
    line('demo-divider',1912)
    label('more-title','More building blocks',32,1942,930,36,23,bold=True)
    label('shapes-title','Text, icons, symbols, and shapes',32,2008,440,28,18,bold=True)
    label('shapes-description','Use labels for live tag values, buttons for actions, and symbols for equipment. Shapes and polylines help organize a screen or connect parts of a process.',32,2054,440,130)
    control('square','example-square',48,2204,80,56,strokeWidth=2,edgeDiameter=0,backColor='#e6f2f6',foreColor='#176985')
    control('circle','example-ellipse',164,2204,90,56,strokeWidth=2,foreColor='#176985')
    control('polyline','example-polyline',300,2198,150,68,points=[[0,1],[.3,1],[.3,0],[.7,0],[.7,.65],[1,.65]],
            strokeWidth=2,fillWhenClosed=False,foreColor='#176985')
    label('shapes-hint','Select an object in the designer to explore its Content, Layout, Colors, Actions, and Events.',32,2300,440,90,14,foreColor='#64748b')
    control('textviewer','operator-notes',512,2008,456,470,image=notes['url'],imageName=notes['name'],textMarkdown=True,
            backColor='#f1f5f9',fontSize=15)
    line('notes-divider',2510)
    label('tags-title','The tags behind the examples',32,2540,930,36,23,bold=True)
    label('tags-description','Editable tags directly under System → Memory. No extra Demo folder.',32,2588,930,36,foreColor='#64748b')
    for index,(_,name,kind,initial) in enumerate(DEMO_TAGS):
        y=2644+index*66
        label('tag-name-'+str(index),name,32,y,300,30,16,bold=True)
        label('tag-type-'+str(index),kind,352,y,120,30,14,foreColor='#64748b')
        label('tag-initial-'+str(index),'Initial value: '+str(initial),512,y,440,30,14)
    line('tags-divider',2854)
    label('yours-title','Make it yours',32,2884,930,36,23,bold=True)
    label('yours-description','Click Edit Page to inspect these connections. Try a different color, change a tag, or add a control. Save & View lets you try it; Back returns to editing.',32,2936,930,70)
    label('delete-description','When you no longer need this page, remove it from Pages like any other page. It will not be recreated after a restart or update. Demo tags and assets can be removed once their references are gone.',32,3028,930,80,15,foreColor='#64748b')
    page=page_defaults({'id':'main','name':'Start Page','starterPage':True,'width':1000,'height':3150,'backColor':'#ffffff',
                        'showBorder':True,'showBackground':True,'horizontalAlignment':'center','controls':controls})
    tags=[{'id':identity,'name':name,'source':'system','folder':'Memory','address':'Memory/'+identity,
           'writable':True,'data_type':kind,'initial_value':initial} for identity,name,kind,initial in DEMO_TAGS]
    bind_inline_text([page,*controls],tags,service.sources())
    service.store.set_many({'pages':[page],'tags':tags,'starter_content_version':1,'starter_content_pending':False})
