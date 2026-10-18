"""Page layout defaults and validation, independent of the web editor."""
import math
import re

PAGE_ACTIONS = {'navigate', 'popup'}


def page_defaults(page):
    for key, value in {'width': 1000, 'height': 640, 'backColor': '#ffffff', 'showBorder': True, 'showBackground': True,
                       'horizontalAlignment': 'left', 'verticalAlignment': 'top', 'gridSize': 20, 'gridStyle': 'lines'}.items():
        page.setdefault(key, value)
    page.setdefault('actions', [])
    page.setdefault('events', [])
    page.setdefault('parameters', [])
    page.setdefault('groups', [])
    return page


def validate_page(page):
    page_defaults(page)
    groups = page['groups']
    if not isinstance(groups, list) or any(not isinstance(group, dict) for group in groups):
        raise ValueError('Groups must be a list of group objects')
    group_ids = set()
    control_ids = {control.get('id') for control in page.get('controls', [])}
    for group in groups:
        identity = group.get('id')
        if not isinstance(identity, str) or not identity or identity in group_ids or identity in control_ids:
            raise ValueError('Group IDs must be present and unique')
        group_ids.add(identity)
        if group.get('groupId') or group.get('actions'):
            raise ValueError('Groups cannot be nested or have actions')
        group['type'] = 'group'
        group.setdefault('name', identity)
        group.setdefault('visible', True)
        group.setdefault('events', [])
        if not isinstance(group['name'], str) or not group['name'].strip() or not isinstance(group['visible'], bool):
            raise ValueError('Groups need a name and boolean visibility')
        if not isinstance(group['events'], list) or any(not isinstance(event, dict) or event.get('action') not in ('show','hide') for event in group['events']):
            raise ValueError('Groups support Show and Hide events only')
    for control in page.get('controls', []):
        if control.get('groupId') and control['groupId'] not in group_ids:
            raise ValueError('Control refers to an unknown group')
    parameters = page['parameters']
    if not isinstance(parameters, list) or len(parameters) > 100:
        raise ValueError('A page supports up to 100 parameters')
    identities, names = set(), set()
    for parameter in parameters:
        if not isinstance(parameter, dict):
            raise ValueError('Invalid page parameter')
        identity, name = parameter.get('id', ''), str(parameter.get('name', '')).strip()
        if not isinstance(identity, str) or not identity.startswith('parameter:') or identity in identities:
            raise ValueError('Parameter IDs must be present and unique')
        if not name or re.search(r'[\\{}\r\n]', name) or name.casefold() in names:
            raise ValueError('Parameter names must be unique and contain no backslashes, braces, or line breaks')
        parameter['name'] = name
        parameter['description'] = str(parameter.get('description', ''))
        identities.add(identity); names.add(name.casefold())
    if isinstance(page['gridSize'], bool) or page['gridSize'] not in (0, 5, 10, 20):
        raise ValueError('Grid size must be Off, 5, 10, or 20')
    if page['gridStyle'] not in ('hide', 'lines', 'dots'):
        raise ValueError('Invalid grid style')
    if not isinstance(page['showBorder'], bool):
        raise ValueError('Show Border must be enabled or disabled')
    if not isinstance(page['showBackground'], bool):
        raise ValueError('Show Background must be enabled or disabled')
    for key in ('width', 'height'):
        value = page[key]
        if not isinstance(value, (int, float)) or not math.isfinite(value) or not 20 <= value <= 10000:
            raise ValueError('Page dimensions must be between 20 and 10000 pixels')
    if not re.fullmatch(r'#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?', page['backColor']):
        raise ValueError('Invalid page background color')
    if page['horizontalAlignment'] not in ('left', 'center', 'right'):
        raise ValueError('Invalid horizontal alignment')
    if page['verticalAlignment'] not in ('top', 'center', 'bottom'):
        raise ValueError('Invalid vertical alignment')
