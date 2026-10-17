"""Small image library stored separately from page definitions."""
import base64
import hashlib
import xml.etree.ElementTree as ET

MAX_IMAGE_BYTES = 5 * 1024 * 1024


def prepare_image(data):
    try:
        raw = base64.b64decode(data['data'], validate=True)
    except (ValueError, KeyError) as error:
        raise ValueError('Invalid image data') from error
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ValueError('Images must be between 1 byte and 5 MB')
    if raw.startswith(b'\x89PNG\r\n\x1a\n'):
        mime = 'image/png'
    elif raw.startswith(b'\xff\xd8\xff'):
        mime = 'image/jpeg'
    elif raw.startswith((b'GIF87a', b'GIF89a')):
        mime = 'image/gif'
    elif raw.startswith(b'RIFF') and raw[8:12] == b'WEBP':
        mime = 'image/webp'
    elif raw.startswith(b'BM'):
        mime = 'image/bmp'
    else:
        if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
            raise ValueError('SVG document declarations are not supported')
        try:
            root = ET.fromstring(raw)
        except ET.ParseError as error:
            raise ValueError('Choose an SVG, PNG, JPEG, GIF, WebP, or BMP image') from error
        if root.tag not in ('svg', '{http://www.w3.org/2000/svg}svg'):
            raise ValueError('Invalid SVG image')
        mime = 'image/svg+xml'
    return {'id': hashlib.sha256(raw).hexdigest(), 'name': str(data.get('name', 'Image'))[:200],
            'mime': mime, 'data': base64.b64encode(raw).decode('ascii')}
