"""Bundle Pillow for tray icons rather than every supported image format.

ICO can contain either PNG or BMP images. Keep all three codecs, plus the
ordinary imports Pillow needs for image conversion and fallback text drawing.
Uploaded site images are served directly to the browser and do not use Pillow.
"""
hiddenimports = ['PIL.IcoImagePlugin', 'PIL.PngImagePlugin', 'PIL.BmpImagePlugin']
