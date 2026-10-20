import unittest
from hmi.inline_text import bind_inline_text, inline_path, inline_ids


class InlineFormatTests(unittest.TestCase):
    def test_bind_independent_formats_and_preserve_renamed_ids(self):
        a=r'Simulation\AirHandler\Temperature|dp=2;min=3;zeros=1'
        b=r'Simulation\AirHandler\Temperature|dp=0;min=1;zeros=0'
        control={'text':'@{'+a+'} / @{'+b+'}', 'events':[{'action':'set_content','content':'@{'+a+'}'}]}
        tags=[{'id':'temp','source':'sim','folder':'AirHandler','name':'Temperature'}]
        sources=[{'id':'sim','name':'Simulation'}]
        bind_inline_text([control],tags,sources)
        self.assertEqual(control['textRefs'],{a:'temp',b:'temp'})
        self.assertEqual(control['events'][0]['contentRefs'],{a:'temp'})
        tags[0]['name']='Renamed'
        bind_inline_text([control],tags,sources)
        self.assertEqual(inline_ids(control),{'temp'})

    def test_parameter_and_invalid_syntax(self):
        token=r'Parameters\PV|dp=raw;min=3;zeros=1'
        control={'text':'@{'+token+'}'}
        bind_inline_text([control],[],[],[{'id':'parameter:pv','name':'PV'}])
        self.assertEqual(control['textRefs'],{token:'parameter:pv'})
        for suffix in ('|dp=99;min=1;zeros=1','|dp=1;min=0;zeros=1','|dp=1;min=16;zeros=1'):
            self.assertEqual(inline_path('Tag'+suffix),'Tag'+suffix)

    def test_accidental_token_edits_do_not_break_binding(self):
        token = r'Parameters\PV|dp=2;min=3;zeros=1'
        text = '@{' + token + '}'
        variants = {text[:i] + text[i+1:] for i in range(len(text))}
        variants.update(text[:i] + char + text[i:] for i in range(len(text))
                        for char in '{}|;09-.\n')
        variants.update('@{Tag|dp=' + value + ';min=' + value + ';zeros=1}'
                        for value in ('', '-1', '99999999999999999999', 'Infinity', 'NaN', '2.5', '١'))
        for damaged in variants:
            with self.subTest(text=damaged):
                control = {'text': damaged + ' / ' + text,
                           'events': [{'action': 'set_content', 'content': damaged + ' / ' + text}]}
                bind_inline_text([control], [], [], [{'id': 'parameter:pv', 'name': 'PV'}])
                self.assertEqual(control['textRefs'][token], 'parameter:pv')
                self.assertEqual(control['events'][0]['contentRefs'][token], 'parameter:pv')
                self.assertEqual(inline_ids(control), {'parameter:pv'})
