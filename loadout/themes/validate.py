#!/usr/bin/env python3
"""Checks every theme pack beside this file. No dependency: python3 themes/validate.py

  1. each pack against schema.json (the subset of JSON Schema that schema.json uses);
  2. file name = slug, a 'default' pack exists, no two packs share a slug or a match string;
  3. flow.palette.bg and page equal terminal.background where one is set; isLight agrees with bg;
  4. glyphs, rails, edges, meter cells and box corners take one terminal cell; the active node's cycle never shows
     another state's glyph; caption templates use only {i} {n} {done} {left};
  5. WCAG contrast on flow.palette.bg: text tokens and the steps' label colours 4.5 or more (on the row's ground too,
     where a state has one), accent tokens and the steps' node colours 3 or more; a skin's foreground colours
     3 or more on the terminal background.

  6. ../loadout/flow/tests/packs.ts, the copy the plugin's tests draw from, is what the packs say (`--sync` writes it).

Exits 1 on any failure. `--self-test` breaks a good pack on purpose and checks each break is caught.
`--resolve "<theme name>"` prints the pack that serves a theme: the rule the mods follow, in `resolve` below.
"""
import copy
import json
import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
NOT_PACKS = {'schema.json'}
TEXT = ['fg', 'text2', 'text3', 'text4']
ACCENT = ['cyan', 'green', 'yellow', 'orange', 'red', 'blue', 'violet', 'tabActive']
SKIN_FG = ['primary', 'bright', 'dim', 'cyan', 'alert', 'value']
TYPES = {'object': dict, 'array': list, 'string': str, 'boolean': bool, 'integer': int, 'null': type(None)}


COPY = HERE.parent / 'flow' / 'tests' / 'packs.ts'


def copy_of(files):
    """flow/tests/packs.ts of the Loadout plugin: each pack file's text, by slug."""
    rows = ''.join(f'  {json.dumps(path.stem)}: {json.dumps(path.read_text(encoding="utf-8"), ensure_ascii=False)},\n' for path in files)
    return ('// Generated from ../../../themes/*.json by `python3 themes/validate.py --sync`, which also fails when this file is stale. Do not edit.\n'
            '/** Each theme pack file\'s text, by slug: what the mod reads from the themes folder in a session. */\n'
            f'export const PACK_TEXT: Readonly<Record<string, string>> = {{\n{rows}}}\n')


def check(value, rule, root, at='pack'):
    """The errors of `value` against the schema `rule`: the keywords schema.json uses, no others."""
    if '$ref' in rule:
        target = root
        for part in rule['$ref'].removeprefix('#/').split('/'):
            target = target[part]
        return check(value, target, root, at)
    errors = []
    kind = rule.get('type')
    if kind is not None and (not isinstance(value, TYPES[kind]) or (kind == 'integer' and isinstance(value, bool))):
        return [f'{at}: expected {kind}, got {json.dumps(value, ensure_ascii=False)}']
    if 'enum' in rule and value not in rule['enum']:
        errors.append(f'{at}: {json.dumps(value, ensure_ascii=False)} is not one of {", ".join(map(str, rule["enum"]))}')
    if 'const' in rule and value != rule['const']:
        errors.append(f'{at}: must be {rule["const"]!r}')
    if isinstance(value, str):
        if 'pattern' in rule and not re.search(rule['pattern'], value):
            errors.append(f'{at}: {value!r} does not match {rule["pattern"]}')
        if len(value) < rule.get('minLength', 0) or len(value) > rule.get('maxLength', 10**9):
            errors.append(f'{at}: {value!r} must be {rule.get("minLength", 0)} to {rule.get("maxLength", "any")} characters')
    if isinstance(value, int) and not isinstance(value, bool) and not rule.get('minimum', value) <= value <= rule.get('maximum', value):
        errors.append(f'{at}: {value} is outside {rule.get("minimum")}..{rule.get("maximum")}')
    if isinstance(value, list):
        if len(value) < rule.get('minItems', 0) or len(value) > rule.get('maxItems', 10**9):
            errors.append(f'{at}: {len(value)} items, wants {rule.get("minItems", 0)} to {rule.get("maxItems", "any")}')
        for i, item in enumerate(value):
            errors += check(item, rule.get('items', {}), root, f'{at}[{i}]')
    if isinstance(value, dict):
        props = rule.get('properties', {})
        errors += [f'{at}.{key}: missing' for key in rule.get('required', []) if key not in value]
        if rule.get('additionalProperties') is False:
            errors += [f'{at}.{key}: unknown field' for key in value if key not in props]
        for key, sub in props.items():
            if key in value:
                errors += check(value[key], sub, root, f'{at}.{key}')
    if 'anyOf' in rule and all(check(value, sub, root, at) for sub in rule['anyOf']):
        errors.append(f'{at}: {json.dumps(value, ensure_ascii=False)} fits none of the allowed forms')
    if 'not' in rule and not check(value, rule['not'], root, at):
        errors.append(f'{at}: has a field this family does not take (variant is the cyber family\'s; skin the cyber, initial-d and y2k families\')')
    if 'if' in rule:
        branch = rule.get('then') if not check(value, rule['if'], root, at) else rule.get('else')
        if branch is not None:
            errors += check(value, branch, root, at)
    return errors


def luminance(color):
    channels = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    r, g, b = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    hi, lo = sorted([luminance(a), luminance(b)], reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def one_cell(text):
    # One UTF-16 unit too: the Flow map mod counts a cell per unit.
    return len(text) == 1 and ord(text) <= 0xFFFF and unicodedata.east_asian_width(text) not in 'WF' and unicodedata.category(text)[0] not in 'CM'


def beyond_schema(pack):
    """What the schema cannot say; only called on a pack the schema accepts."""
    errors = []
    palette = pack['flow']['palette']
    steps = pack['flow']['steps']
    bg = palette['bg'].lower()
    ground = pack['terminal']['background']
    if ground is not None:
        errors += [f'flow.palette.{key} {palette[key]} must equal terminal.background {ground}' for key in ('bg', 'page') if palette[key].lower() != ground.lower()]
    if (luminance(bg) > 0.4) != pack['isLight']:
        errors.append(f'isLight is {str(pack["isLight"]).lower()} but flow.palette.bg {bg} is {"light" if luminance(bg) > 0.4 else "dark"}')

    cells = [(f'states.{name}.{key}', state[key]) for name, state in steps['states'].items() for key in ('glyph', 'rail', 'edge') if key in state]
    cells += [(f'meter.{key}', steps['meter'][key]) for key in ('fill', 'empty') if 'meter' in steps]
    cells += [(f'header.corners[{i}]', corner) for i, corner in enumerate(steps['header'].get('corners', ''))]
    cells += [(f'cycle.glyphs[{i}]', glyph) for i, glyph in enumerate(steps.get('cycle', {}).get('glyphs', []))]
    errors += [f'flow.steps.{where}: {glyph!r} does not take exactly one terminal cell' for where, glyph in cells if not one_cell(glyph)]
    errors += [f'spinner.frames[{i}]: {glyph!r} does not take exactly one terminal cell' for i, glyph in enumerate(pack.get('spinner', {}).get('frames', [])) if not one_cell(glyph)]
    # The active node must never read as done, pending or blocked, not even for one frame of its cycle.
    errors += [f'flow.steps.cycle.glyphs[{i}]: {glyph!r} is the {name} glyph: for that frame the active step reads as {name}'
               for i, glyph in enumerate(steps.get('cycle', {}).get('glyphs', [])) for name, state in steps['states'].items() if name != 'active' and state['glyph'] == glyph]

    wanted = [(f'flow.palette.{key}', palette[key], 4.5) for key in TEXT] + [(f'flow.palette.{key}', palette[key], 3) for key in ACCENT]
    wanted.append((f'flow.steps.header.color ({steps["header"]["color"]})', palette[steps['header']['color']], 4.5))
    errors += [f'{where} {color} on bg {bg}: contrast {contrast(color, bg):.2f}, needs {least}' for where, color, least in wanted if contrast(color, bg) < least]
    # A step's label reads at 4.5, its node at 3: on the pane, and on the row's own ground where the state has one.
    for name, state in steps['states'].items():
        grounds = [('bg', bg)] + ([(f'ground {state["ground"]}', palette[state['ground']])] if 'ground' in state else [])
        label = state.get('labelColor', state['color'])
        for key, token, least in (('labelColor' if 'labelColor' in state else 'color', label, 4.5), ('color', state['color'], 3)):
            errors += [f'flow.steps.states.{name}.{key} ({token}) {palette[token]} on {where} {ground}: contrast {contrast(palette[token], ground):.2f}, needs {least}'
                       for where, ground in grounds if contrast(palette[token], ground) < least]
    for key in ('progress', 'idle'):
        unknown = [word for word in re.findall(r'\{(\w*)\}', steps['captions'].get(key, '')) if word not in ('i', 'n', 'done', 'left')]
        errors += [f'flow.steps.captions.{key}: {{{word}}} is not a number the mod fills ({{i}} {{n}} {{done}} {{left}})' for word in unknown]
    skin = pack['avatar'].get('skin')
    if skin is not None and ground is not None:
        errors += [f'avatar.skin.{key} {skin[key]} on terminal.background {ground}: contrast {contrast(skin[key], ground):.2f}, needs 3'
                   for key in SKIN_FG if contrast(skin[key], ground) < 3]
    return errors


def errors_of(pack, schema):
    return check(pack, schema, schema) or beyond_schema(pack)


def validate(folder):
    schema = json.loads((folder / 'schema.json').read_text(encoding='utf-8'))
    failed = 0
    seen = {}  # a slug or a match string -> the file that has it
    files = sorted(path for path in folder.glob('*.json') if path.name not in NOT_PACKS)
    for path in files:
        try:
            pack = json.loads(path.read_text(encoding='utf-8'))
            errors = errors_of(pack, schema)
        except (ValueError, OSError) as problem:
            pack, errors = None, [f'unreadable: {problem}']
        if not errors:
            if pack['slug'] != path.stem:
                errors.append(f'slug {pack["slug"]!r} must be the file name ({path.stem!r})')
            for key in [pack['slug'], *pack.get('match', [])]:
                if seen.setdefault(key, path.name) != path.name:
                    errors.append(f'{key!r} is already the slug or a match of {seen[key]}')
        if errors:
            failed += 1
            print(f'FAIL {path.name}')
            for error in errors:
                print(f'     {error}')
        else:
            palette = pack['flow']['palette']
            low = min(contrast(palette[key], palette['bg']) for key in TEXT)
            print(f'ok   {path.name:<22} lowest text contrast {low:.2f}, lowest accent {min(contrast(palette[key], palette["bg"]) for key in ACCENT):.2f}')
    # The plugin's Flow map tests draw from a generated copy (a test can read no file outside its mod, and no JSON).
    if COPY.exists() and COPY.read_text(encoding='utf-8') != copy_of(files):
        failed += 1
        print(f'FAIL {COPY} is not what the packs say: run python3 themes/validate.py --sync')
    if not (folder / 'default.json').exists():
        failed += 1
        print('FAIL default.json is missing: it is the pack of every theme no other pack serves')
    print(f'{len(files)} packs, {failed} failed')
    return failed


def normalise(theme):
    return re.sub(r'[\s_]+', '-', re.sub(r'^custom:', '', theme.strip().lower()))


def resolve(theme, packs):
    """The pack of a theme name: its slug, else the longest `match` string the name contains, else 'default'. None while the theme is unknown ('')."""
    name = normalise(theme)
    if name == '':
        return None
    by_slug = {pack['slug']: pack for pack in packs}
    if name in by_slug:
        return by_slug[name]
    hits = [(-len(m), pack['slug']) for pack in packs for m in pack.get('match', []) if m in name]
    return by_slug[min(hits)[1]] if hits else by_slug['default']


def self_test(folder):
    schema = json.loads((folder / 'schema.json').read_text(encoding='utf-8'))
    good = json.loads((folder / 'ghostrunner.json').read_text(encoding='utf-8'))
    assert errors_of(good, schema) == [], errors_of(good, schema)

    def broken(change):
        pack = copy.deepcopy(good)
        change(pack)
        return errors_of(pack, schema)

    breaks = {
        'a missing field': lambda p: p.pop('isLight'),
        'an unknown field': lambda p: p.update(extra=1),
        'a bad colour': lambda p: p['flow']['palette'].update(fg='red'),
        'an unknown token': lambda p: p['flow']['steps']['states']['done'].update(color='magenta'),
        'an unknown family': lambda p: p['avatar'].update(family='pikachu'),
        'cyber without a variant': lambda p: p['avatar'].pop('variant'),
        'a skin on a sprite family': lambda p: p['avatar'].update(family='kirby'),
        'bg off the terminal background': lambda p: p['flow']['palette'].update(bg='#130608'),
        'text too faint': lambda p: p['flow']['palette'].update(text4='#5a3a3a'),
        'an accent too faint': lambda p: p['flow']['palette'].update(blue='#301018'),
        'a two-cell glyph': lambda p: p['flow']['steps']['states']['done'].update(glyph='界'),
        'a two-cell edge': lambda p: p['flow']['steps']['states']['done'].update(edge='界'),
        'a cycle that shows the done glyph': lambda p: p['flow']['steps']['cycle'].update(glyphs=['◈', '✓']),
        'a three-corner box': lambda p: p['flow']['steps']['header'].update(corners='┌┐└'),
        'an unknown layout': lambda p: p['flow']['steps'].update(layout='grid'),
        'a label too faint on its ground': lambda p: p['flow']['steps']['states']['active'].update(labelColor='border'),
        'an unknown number in a caption': lambda p: p['flow']['steps']['captions'].update(progress='{step} of {n}'),
        'isLight on a dark ground': lambda p: p.update(isLight=True),
    }
    for name, change in breaks.items():
        assert broken(change), f'not caught: {name}'
    assert abs(contrast('#000000', '#ffffff') - 21) < 1e-9
    packs = [json.loads(path.read_text(encoding='utf-8')) for path in folder.glob('*.json') if path.name not in NOT_PACKS]
    served = {'custom:kirby-pink': 'kirby-pink', 'Kirby Pink': 'kirby-pink', 'custom:kirby': 'kirby', 'custom:kirby_night': 'kirby', 'custom:cyberpunk-edgerunners': 'cyberpunk-edgerunners',
              'custom:edgerunners-2': 'cyberpunk-edgerunners', 'custom:ghostrunner': 'ghostrunner', 'Ghostrunner II': 'ghostrunner',
              # The names from before the rename are no pack's: a theme still called so is served as any unknown one.
              'custom:cyberpunk-soft': 'default', 'custom:cyberpunk': 'default', 'dark': 'default', 'light-daltonized': 'default', 'custom:vaporwave': 'default'}
    for theme, slug in served.items():
        assert resolve(theme, packs)['slug'] == slug, (theme, resolve(theme, packs)['slug'])
    assert resolve('', packs) is None
    print(f'self-test ok: {len(breaks)} broken packs caught')


if __name__ == '__main__':
    if '--self-test' in sys.argv:
        self_test(HERE)
    elif '--sync' in sys.argv:
        COPY.write_text(copy_of(sorted(path for path in HERE.glob('*.json') if path.name not in NOT_PACKS)), encoding='utf-8')
        print(f'wrote {COPY}')
    elif '--resolve' in sys.argv:
        found = resolve(sys.argv[sys.argv.index('--resolve') + 1], [json.loads(path.read_text(encoding='utf-8')) for path in HERE.glob('*.json') if path.name not in NOT_PACKS])
        print('none: the theme is not known yet' if found is None else f'{found["slug"]}.json')
    else:
        sys.exit(1 if validate(HERE) else 0)
