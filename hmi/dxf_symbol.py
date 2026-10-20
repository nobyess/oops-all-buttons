"""Basic 2D ASCII DXF to inert SVG paths for the existing Symbol pipeline."""
import base64
import io
import math
import re
import xml.etree.ElementTree as ET
from .images import MAX_IMAGE_BYTES

SUPPORTED={'LINE','ARC','CIRCLE','ELLIPSE','SPLINE','LWPOLYLINE','POLYLINE','HATCH','SOLID','TRACE','INSERT'}
MAX_ENTITIES=4000
MAX_COMMANDS=100000


def dxf_to_svg(data):
    try:raw=base64.b64decode(data['data'],validate=True)
    except (ValueError,KeyError,TypeError):raise ValueError('Invalid DXF data') from None
    if not raw or len(raw)>MAX_IMAGE_BYTES:raise ValueError('DXF files must be between 1 byte and 5 MB')
    if raw.startswith(b'AutoCAD Binary DXF'):raise ValueError('Export an ASCII DXF file from LibreCAD; binary DXF is not supported')
    try:
        import ezdxf
        from ezdxf import path
        from ezdxf.tools.codepage import toencoding
    except ImportError:raise ValueError('Install DXF support: python -m pip install -r requirements-dxf.txt') from None
    match=re.search(rb'\$DWGCODEPAGE\s+3\s+([^\r\n]+)',raw)
    encoding=toencoding(match[1].decode('ascii','ignore').strip()) if match else 'cp1252'
    try:text=raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        try:text=raw.decode(encoding)
        except (UnicodeDecodeError,LookupError):raise ValueError('Could not decode DXF; export an ASCII DXF from LibreCAD') from None
    try:doc=ezdxf.read(io.StringIO(text,newline=None))
    except Exception as error:raise ValueError('Could not read DXF; export a valid ASCII DXF from LibreCAD') from error
    drawings=[];points=[];entities=0;commands=0
    unsupported=set()
    def coordinates(point):
        x,y,z=point
        if not all(math.isfinite(n) and abs(n)<=1e9 for n in (x,y,z)):raise ValueError('DXF has invalid or excessive coordinates')
        if abs(z)>1e-6:raise ValueError('Only flat 2D DXF drawings at Z=0 are supported')
        points.append((x,-y))
        return f'{x:.15g} {-y:.15g}'
    def svg_path(p,close=False):
        nonlocal commands
        if not len(p):return ''
        output=['M'+coordinates(p.start)]
        for command in p:
            commands+=1
            if commands>MAX_COMMANDS:raise ValueError('DXF is too complex (maximum 100000 path segments)')
            if command.type==path.Command.LINE_TO:output.append('L'+coordinates(command.end))
            elif command.type==path.Command.MOVE_TO:output.append('M'+coordinates(command.end))
            elif command.type==path.Command.CURVE3_TO:output.append('Q'+coordinates(command.ctrl)+' '+coordinates(command.end))
            elif command.type==path.Command.CURVE4_TO:output.append('C'+coordinates(command.ctrl1)+' '+coordinates(command.ctrl2)+' '+coordinates(command.end))
            else:raise ValueError('Unsupported DXF path command')
        if close or p.is_closed:output.append('Z')
        return ' '.join(output)
    def visible(entity):
        if entity.dxf.get('invisible',0):return False
        layer=doc.layers.get(entity.dxf.layer) if doc.layers.has_entry(entity.dxf.layer) else None
        return not layer or not (layer.is_off() or layer.is_frozen())
    def visit(entity,depth=0,inherited_layer=None):
        nonlocal entities
        entities+=1
        if depth>8 or entities>MAX_ENTITIES:raise ValueError('DXF is too complex (maximum 4000 entities and 8 block levels)')
        if not visible(entity):return
        layer=entity.dxf.layer
        if layer=='0' and inherited_layer is not None:layer=inherited_layer
        kind=entity.dxftype()
        if kind not in SUPPORTED:unsupported.add(kind);return
        if entity.dxf.hasattr('thickness') and entity.dxf.thickness:raise ValueError('Only flat 2D DXF geometry without thickness is supported')
        if kind=='INSERT':
            if any(visible(attribute) for attribute in entity.attribs):raise ValueError('DXF block text attributes are not supported; remove labels before export')
            block=entity.block()
            if block is None:raise ValueError('DXF contains a missing block')
            if block.block.dxf.flags & 12:raise ValueError('External-reference DXF blocks are not supported; explode them before export')
            if entity.mcount>1:
                if entity.mcount>MAX_ENTITIES:raise ValueError('DXF block array is too large')
                for instance in entity.multi_insert():visit(instance,depth+1,layer)
            else:
                skipped=[]
                for child in entity.virtual_entities(skipped_entity_callback=lambda e,reason:skipped.append(e.dxftype())):visit(child,depth+1,layer)
                if skipped:raise ValueError('Could not convert DXF block elements: '+', '.join(sorted(set(skipped)))+'. Explode the block before export')
            return
        if kind=='POLYLINE' and not entity.is_2d_polyline:raise ValueError('Only 2D DXF polylines are supported')
        if kind=='HATCH':
            if entity.gradient is not None:raise ValueError('DXF gradient hatches are not supported; use solid or patterned hatches')
            hatch=entity.copy();hatch.paths.paths=list(entity.paths.rendering_paths(entity.dxf.hatch_style))
            parts=[svg_path(p,True) for p in path.from_hatch(hatch)]
            drawing=' '.join(part for part in parts if part)
            filled=True
        else:
            drawing=svg_path(path.make_path(entity),kind in ('SOLID','TRACE'))
            filled=kind in ('SOLID','TRACE')
        if drawing:
            attrs={'d':drawing,'fill':'black' if filled else 'none','stroke':'none' if filled else 'black'}
            if filled:
                attrs['fill-rule']='evenodd'
                if kind!='HATCH' or entity.dxf.solid_fill:attrs['data-symbol-fill-color']='fore'
            else:attrs.update({'stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke'})
            drawings.append((layer,filled,attrs))
    try:
        for entity in doc.modelspace():visit(entity)
    except ValueError:raise
    except Exception as error:raise ValueError('Could not convert DXF geometry; use basic 2D entities or explode complex blocks') from error
    if unsupported:raise ValueError('Unsupported DXF entities: '+', '.join(sorted(unsupported))+'. Remove these or explode them into basic 2D geometry before export')
    if not points or not drawings:raise ValueError('DXF contains no supported visible model-space geometry')
    x=min(p[0] for p in points);y=min(p[1] for p in points)
    width=max(p[0] for p in points)-x;height=max(p[1] for p in points)-y
    if width==0:x-=.5;width=1
    if height==0:y-=.5;height=1
    root=ET.Element('svg',{'xmlns':'http://www.w3.org/2000/svg','viewBox':f'{x:.15g} {y:.15g} {width:.15g} {height:.15g}'})
    # LibreCAD sorts layer names; later names paint above earlier names.
    # Stable sorting keeps CAD entity order within each layer/paint role.
    drawings.sort(key=lambda item:(item[0],not item[1]))
    for _,_,attrs in drawings:ET.SubElement(root,'path',attrs)
    svg=ET.tostring(root,encoding='utf-8')
    if len(svg)>MAX_IMAGE_BYTES:raise ValueError('Converted DXF is too large; simplify the drawing')
    return {'name':str(data.get('name','Drawing.dxf'))[:200],'data':base64.b64encode(svg).decode('ascii')}
