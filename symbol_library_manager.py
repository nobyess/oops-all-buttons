"""Run: python symbol_library_manager.py [--library PATH]"""
import argparse
from pathlib import Path
import sys

try:
    from PySide6.QtCore import QByteArray, QSize, Qt
    from PySide6.QtGui import QFont, QIcon, QPainter, QPixmap
    from PySide6.QtSvg import QSvgRenderer
    from PySide6.QtWidgets import (QApplication, QComboBox, QFileDialog, QFormLayout,
        QHBoxLayout, QLabel, QLineEdit, QListWidget, QListWidgetItem, QMainWindow,
        QMessageBox, QPushButton, QSplitter, QVBoxLayout, QWidget, QAbstractItemView)
except ImportError:
    raise SystemExit('Install the manager dependencies first: python -m pip install -r requirements-symbol-manager.txt')
from hmi.symbol_library import SymbolLibrary


class Manager(QMainWindow):
    def __init__(self, root):
        super().__init__()
        self.setFont(QFont('Segoe UI', 10))
        self.library = SymbolLibrary(root)
        self.current = None
        self.setWindowTitle('Oops! All Buttons — Symbol Library Manager')
        self.resize(1050, 700)
        body = QWidget()
        self.setCentralWidget(body)
        layout = QVBoxLayout(body)
        layout.setContentsMargins(24, 24, 24, 24)
        layout.setSpacing(16)
        title = QLabel('Built-in Symbol Library')
        title.setStyleSheet('font-size:22px;font-weight:600')
        layout.addWidget(title)
        layout.addWidget(QLabel(str(self.library.root)))
        filters = QHBoxLayout()
        self.search = QLineEdit()
        self.search.setPlaceholderText('Filter symbols by name or category…')
        self.categories = QComboBox()
        filters.addWidget(self.search, 1)
        filters.addWidget(self.categories)
        layout.addLayout(filters)
        splitter = QSplitter()
        layout.addWidget(splitter, 1)
        self.grid = QListWidget()
        self.grid.setViewMode(QListWidget.ViewMode.IconMode)
        self.grid.setResizeMode(QListWidget.ResizeMode.Adjust)
        self.grid.setMovement(QListWidget.Movement.Static)
        self.grid.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.grid.setIconSize(QSize(112, 96))
        self.grid.setGridSize(QSize(170, 148))
        self.grid.setSpacing(8)
        self.grid.setWordWrap(True)
        splitter.addWidget(self.grid)
        details = QWidget()
        form = QVBoxLayout(details)
        self.preview = QLabel('Select a symbol')
        self.preview.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.preview.setMinimumSize(240, 240)
        self.preview.setStyleSheet('background:#ffffff;border:1px solid #bac5d1;border-radius:6px;color:#243447')
        form.addWidget(self.preview)
        fields = QFormLayout()
        self.name = QLineEdit()
        self.category = QComboBox()
        self.category.setEditable(True)
        fields.addRow('Name', self.name)
        fields.addRow('Category', self.category)
        form.addLayout(fields)
        self.save_button = QPushButton('Save Changes')
        self.save_button.clicked.connect(self.save_details)
        form.addWidget(self.save_button)
        self.source = QLabel()
        self.source.setWordWrap(True)
        form.addWidget(self.source)
        form.addStretch()
        splitter.addWidget(details)
        splitter.setSizes([680, 300])
        buttons = QHBoxLayout()
        for label, callback in [('Add Symbols…', self.add), ('Remove Symbol', self.remove), ('Reload', self.reload)]:
            button = QPushButton(label)
            button.clicked.connect(callback)
            buttons.addWidget(button)
        buttons.addStretch()
        layout.addLayout(buttons)
        hint = QLabel('SVG and basic 2D DXF • Changes are saved to this library • Commit static/symbols to Git')
        hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(hint)
        self.search.textChanged.connect(self.filter)
        self.categories.currentTextChanged.connect(self.filter)
        self.grid.currentItemChanged.connect(self.select)
        self.refresh()

    def report(self, error):
        QMessageBox.warning(self, 'Symbol Library', str(error))

    def pixmap(self, item, size):
        renderer = QSvgRenderer(QByteArray(self.library.asset_path(item).read_bytes()))
        if not renderer.isValid():
            raise ValueError('Cannot preview ' + item['name'])
        pixmap = QPixmap(size, size)
        pixmap.fill(Qt.GlobalColor.white)
        painter = QPainter(pixmap)
        try:
            painter.setRenderHint(QPainter.RenderHint.Antialiasing)
            from PySide6.QtCore import QRectF
            bounds = renderer.viewBoxF()
            ratio = min((size - 24) / max(bounds.width(), 1), (size - 24) / max(bounds.height(), 1))
            width, height = bounds.width() * ratio, bounds.height() * ratio
            renderer.render(painter, QRectF((size-width)/2, (size-height)/2, width, height))
        finally:
            painter.end()
        return pixmap

    def dirty(self):
        item = next((i for i in self.library.items if i['id'] == self.current), None)
        return item and (self.name.text() != item['name'] or self.category.currentText() != item['category'])

    def discard(self):
        return not self.dirty() or QMessageBox.question(self, 'Unsaved changes', 'Discard the name/category changes?',
            QMessageBox.StandardButton.Discard | QMessageBox.StandardButton.Cancel,
            QMessageBox.StandardButton.Cancel) == QMessageBox.StandardButton.Discard

    def refresh(self, identifier=None):
        category = self.categories.currentText()
        names = sorted({i['category'] for i in self.library.items}, key=str.casefold)
        self.categories.blockSignals(True)
        self.categories.clear()
        self.categories.addItems(['All categories', *names])
        self.categories.setCurrentText(category if category in names else 'All categories')
        self.categories.blockSignals(False)
        self.category.clear()
        self.category.addItems(names)
        self.grid.blockSignals(True)
        self.grid.clear()
        self.current = None
        for item in sorted(self.library.items, key=lambda x: (x['category'].casefold(), x['name'].casefold())):
            row = QListWidgetItem(item['name'] + '\n' + item['category'])
            row.setData(Qt.ItemDataRole.UserRole, item['id'])
            try:
                row.setIcon(QIcon(self.pixmap(item, 128)))
            except Exception as error:
                row.setToolTip(str(error))
            self.grid.addItem(row)
            if item['id'] == identifier:
                self.grid.setCurrentItem(row)
        self.grid.blockSignals(False)
        self.select(self.grid.currentItem(), None)
        self.filter()
        self.statusBar().showMessage(f'{len(self.library.items)} symbols')

    def filter(self, *_):
        query = self.search.text().casefold().strip()
        category = self.categories.currentText()
        for n in range(self.grid.count()):
            row = self.grid.item(n)
            item = next(i for i in self.library.items if i['id'] == row.data(Qt.ItemDataRole.UserRole))
            row.setHidden((category != 'All categories' and category != item['category']) or query not in (item['name']+' '+item['category']).casefold())

    def select(self, row, previous):
        if not self.discard():
            self.grid.blockSignals(True)
            self.grid.setCurrentItem(previous)
            self.grid.blockSignals(False)
            return
        self.current = row.data(Qt.ItemDataRole.UserRole) if row else None
        item = next((i for i in self.library.items if i['id'] == self.current), None)
        self.name.setEnabled(bool(item))
        self.category.setEnabled(bool(item))
        self.save_button.setEnabled(bool(item))
        self.name.setText(item['name'] if item else '')
        self.category.setCurrentText(item['category'] if item else '')
        self.source.setText('Imported from: '+item.get('source_name', '') if item else '')
        self.preview.clear()
        if item:
            try:
                self.preview.setPixmap(self.pixmap(item, 240))
            except Exception as error:
                self.preview.setText(str(error))
        else:
            self.preview.setText('Select a symbol or add your first SVG / DXF')

    def save_details(self):
        if self.current:
            try:
                self.library.update(self.current, self.name.text(), self.category.currentText())
                self.refresh(self.current)
            except Exception as error:
                self.report(error)

    def add(self):
        if not self.discard(): return
        files, _ = QFileDialog.getOpenFileNames(self, 'Add Symbols', '', 'Symbols (*.svg *.dxf)')
        identifier = None
        errors = []
        category = self.categories.currentText()
        for filename in files:
            try:
                identifier = self.library.add(filename, category if category != 'All categories' else 'Uncategorized')
            except Exception as error:
                errors.append(Path(filename).name + ': ' + str(error))
        if files: self.refresh(identifier)
        if errors: self.report('\n'.join(errors))

    def remove(self):
        if not self.current: return
        if QMessageBox.question(self, 'Remove Symbol', 'Remove this built-in symbol? The original source file is kept.',
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No) != QMessageBox.StandardButton.Yes: return
        try:
            self.library.remove(self.current)
            self.refresh()
        except Exception as error:
            self.report(error)

    def reload(self):
        if not self.discard(): return
        try:
            self.library.reload()
            self.refresh()
        except Exception as error:
            self.report(error)

    def closeEvent(self, event):
        if self.discard(): event.accept()
        else: event.ignore()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--library', type=Path, default=Path(__file__).resolve().parent / 'static' / 'symbols')
    args = parser.parse_args()
    app = QApplication(sys.argv[:1])
    app.setFont(QFont('Segoe UI', 10))
    app.setStyle('Fusion')
    app.setStyleSheet('QWidget{font-size:13px} QLineEdit,QComboBox,QPushButton{padding:8px;border:1px solid #8997a6;border-radius:6px} QListWidget{border:1px solid #8997a6;border-radius:6px} QListWidget::item:selected{background:#91d8ed;color:#152331;border-radius:6px}')
    try:
        window = Manager(args.library)
    except Exception as error:
        QMessageBox.critical(None, 'Cannot Open Symbol Library', str(error))
        return 1
    window.show()
    return app.exec()


if __name__ == '__main__':
    sys.exit(main())
