import base64
import unittest
from hmi.images import prepare_image, MAX_IMAGE_BYTES


class ImageTests(unittest.TestCase):
    def image(self, raw):
        return prepare_image({'name': 'example', 'data': base64.b64encode(raw).decode()})

    def test_svg_and_raster_types_and_deduplication(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
        self.assertEqual(self.image(svg)['mime'], 'image/svg+xml')
        self.assertEqual(self.image(svg)['id'], self.image(svg)['id'])
        for signature, mime in [(b'\x89PNG\r\n\x1a\n', 'image/png'), (b'\xff\xd8\xff', 'image/jpeg'),
                                (b'GIF89a', 'image/gif'), (b'RIFF0000WEBP', 'image/webp'), (b'BM', 'image/bmp')]:
            self.assertEqual(self.image(signature)['mime'], mime)

    def test_reject_invalid_or_oversized_uploads(self):
        for raw in (b'', b'<html/>', b'<svg', b'<!DOCTYPE svg><svg/>', b'x'*(MAX_IMAGE_BYTES+1)):
            with self.assertRaises(ValueError): self.image(raw)
        with self.assertRaises(ValueError): prepare_image({'data': 'not base64'})
