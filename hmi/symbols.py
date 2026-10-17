"""Reduce SVG symbols to inert geometry and local clipping references."""
import base64
import re
import xml.etree.ElementTree as ET
from .images import prepare_image

NS = 'http://www.w3.org/2000/svg'
TAGS = {'svg','g','path','rect','circle','ellipse','polygon','polyline','line','text','tspan','defs','clipPath','mask','symbol','use','title','desc'}
DRAWABLE = {'path','rect','circle','ellipse','polygon','polyline','line','text','tspan','use'}
ATTRIBUTES = {'id','viewBox','preserveAspectRatio','x','y','x1','y1','x2','y2','dx','dy','width','height','rx','ry','cx','cy','r','d','points','transform','opacity','fill-opacity','stroke-opacity','fill-rule','clip-rule','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','vector-effect','clipPathUnits','maskUnits','maskContentUnits','text-anchor','dominant-baseline','font-size','font-family','font-weight','font-style','display','visibility'}
LOCAL = re.compile(r'url\(\s*#([A-Za-z_][\w:.-]*)\s*\)')
IDENTIFIER = re.compile(r'[A-Za-z_][\w:.-]*')


def declarations(text):
    return {key.strip().lower():value.strip() for part in text.split(';') if ':' in part for key,value in [part.split(':',1)] if key.strip().lower() in {'fill','stroke','stroke-width',*ATTRIBUTES,'clip-path','mask'}}


def prepare_symbol(data):
    if str(data.get('name','')).lower().endswith('.dxf'):
        try:raw=base64.b64decode(data['data'],validate=True)
        except (ValueError,KeyError,TypeError):raise ValueError('Invalid DXF data') from None
        # The browser's second pass contains the already-converted SVG.
        if not raw.lstrip().startswith(b'<'):
            from .dxf_symbol import dxf_to_svg
            data=dxf_to_svg(data)
    asset = prepare_image(data)
    if asset['mime'] != 'image/svg+xml':
        raise ValueError('Symbols require an SVG or basic 2D DXF file')
    root = ET.fromstring(base64.b64decode(asset['data']))
    rules = []
    for element in root.iter():
        if element.tag.split('}')[-1] == 'style':
            css = re.sub(r'/\*.*?\*/', '', element.text or '', flags=re.S)
            for selectors,body in re.findall(r'([^{}]+)\{([^{}]*)\}', css):
                for selector in selectors.split(','):
                    if re.fullmatch(r'(?:[\w-]+)?(?:[.#][\w-]+)?', selector.strip()):
                        rules.append((selector.strip(), declarations(body)))
    count = [0]
    def clean(element, inherited, depth=0):
        tag = element.tag.split('}')[-1]
        if tag not in TAGS or (element.tag.startswith('{') and not element.tag.startswith('{'+NS+'}')):
            return None
        count[0] += 1
        if depth > 32 or count[0] > 5000:
            raise ValueError('SVG symbol is too complex (maximum 5000 elements, 32 levels)')
        style = dict(inherited)
        style.update({key:value for key,value in element.attrib.items() if key in ATTRIBUTES or key in ('fill','stroke','clip-path','mask')})
        for selector,values in rules:
            match = re.fullmatch(r'([\w-]+)?(?:([.#])([\w-]+))?', selector)
            name,kind,key = match.groups()
            if (not name or name==tag) and (not kind or kind=='#' and element.get('id')==key or kind=='.' and key in element.get('class','').split()):
                style.update(values)
        style.update(declarations(element.get('style','')))
        attrs = {}
        for key,value in style.items():
            if key in ATTRIBUTES and 'url(' not in value.lower() and not any(char in value for char in '<>'):
                if key!='id' or IDENTIFIER.fullmatch(value):
                    attrs[key] = value
            elif key in ('clip-path','mask') and LOCAL.fullmatch(value):
                attrs[key] = value
        for key,value in element.attrib.items():
            if key.split('}')[-1]=='href' and value.startswith('#') and IDENTIFIER.fullmatch(value[1:]):
                attrs['href'] = value
        # Paint is flattened onto drawable elements, preserving intentional none.
        paint = None
        if tag in DRAWABLE:
            fill,stroke = style.get('fill','black'),style.get('stroke','none')
            paint = {'fill':fill.lower()!='none','stroke':stroke.lower()!='none'}
            attrs['fill'] = 'black' if paint['fill'] else 'none'
            attrs['stroke'] = 'black' if paint['stroke'] else 'none'
            if paint['stroke']:
                attrs['stroke-width'] = style.get('stroke-width','2')
        children = [item for child in element if (item:=clean(child,{key:style[key] for key in ('fill','stroke','stroke-width') if key in style},depth+1)) is not None]
        return {'tag':tag,'attributes':attrs,'paint':paint,'text':element.text or '' if tag in ('text','tspan','title','desc') else '', 'children':children}
    tree = clean(root, {})
    if tree is None or tree['tag']!='svg':
        raise ValueError('Invalid SVG symbol')
    if 'viewBox' not in tree['attributes']:
        def dimension(key):
            match = re.match(r'[0-9]+(?:\.[0-9]+)?', root.get(key,''))
            return max(1,float(match[0])) if match else 100
        tree['attributes']['viewBox'] = f"0 0 {dimension('width')} {dimension('height')}"
    def xml(item):
        element = ET.Element('{'+NS+'}'+item['tag'], item['attributes'])
        element.text = item['text']
        for child in item['children']:
            element.append(xml(child))
        return element
    safe = ET.tostring(xml(tree),encoding='utf-8')
    result = prepare_image({'name':asset['name'],'data':base64.b64encode(safe).decode('ascii')})
    result['symbol'] = tree
    return result
