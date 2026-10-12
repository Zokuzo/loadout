# Adding a theme

A theme is three pieces. The first two are data; the third is code and optional.

| Piece | Where | What it does |
|---|---|---|
| Claude theme | `colors/<slug>.json`, copied to `~/.claude/themes/<slug>.json` at a session's start | Claude Code's own colours (text, prompt border, diffs...). Loadout's frames draw from these keys and need nothing else; its picker shows the theme's `claude`, `text`, `success` and `warning` colours as a swatch. |
| Theme pack | `themes/<slug>.json` (this folder's `themes/`) | What Loadout's avatar and Flow map need: terminal background, which mascot, the Flow map palette, the look of the Steps list. |
| Avatar family | `avatar/hooks/` (code) | Only for a new mascot. A new theme can reuse `kirby`, `clawd`, `initial-d` or `cyber`. |

The active theme is the `theme` setting: `custom:<slug>` for a file of `~/.claude/themes/`, or a built-in name (`dark`, `light`, ...).

## Live theme files

A running session keeps the theme it started with, but repaints when the file of that theme changes. So Loadout does not change the setting at each switch: it rewrites a theme file of its own.

- `~/.claude/themes/loadout.json`: the theme of every terminal that follows the global setting (`"theme": "custom:loadout"`). `/loadout <theme>` rewrites it.
- `~/.claude/themes/loadout-<tag>.json`: one terminal's own (`<tag>` is its tty), given by `bin/loadout`. `/loadout <theme> here` rewrites it.

A live file is a copy of the theme picked, named `Loadout: <slug>`: `/theme` shows it under that name, and the plugin reads the slug back from it, so the pack, the avatar and the Flow map are the picked theme's. A live file is never a theme to pick. Adding a theme is unchanged: a source file `~/.claude/themes/<slug>.json` plus a pack, as below. `README.md` has the details and an optional shell alias.

## The plugin and its command

Loadout is one plugin with three parts: `avatar/`, `flow/`, `frames/`. `README.md` has the command table. For a theme:

| Typed | Does |
|---|---|
| `/loadout` | Opens the picker in the Avatar pane (a row per theme, digits 1-9) and lists the themes. |
| `/loadout <theme>` | That theme for every terminal, with no restart (the first time, terminals already running show it at their next start). The name is forgiving: `Cyberpunk Edgerunners`, `edgerunners`, `edge`, `cyberpunk`; `ghost`. Old names still work (see "Renamed themes"). |
| `/loadout <theme> here` | This terminal only: with no restart where `bin/loadout` started it; elsewhere it copies and prints the line that starts the session again through it (`bin/loadout <theme> --resume <id>`). |
| `/loadout follow` | The line that makes a terminal with its own theme follow the global one again. |
| `/loadout status` | Theme and what set it, pack in use, packs skipped, each character slot (found or missing), panes, frames. |

From a shell, `bin/loadout [<theme>] [claude arguments...]` starts Claude Code with a live theme file of that terminal's own.

## Renamed themes

| Was | Is now | Slug |
|---|---|---|
| Cyberpunk (`cyberpunk`, the red one) | Ghostrunner | `ghostrunner` |
| Cyberpunk Soft (`cyberpunk-soft`, the yellow one) | Cyberpunk Edgerunners | `cyberpunk-edgerunners` |

Renamed everywhere: the Claude theme files, the packs, the plugin's built-in tables. No rule reads the word "soft" any more: the red look is the Ghostrunner theme's, the yellow one Cyberpunk Edgerunners'.

In `/loadout` and `bin/loadout` the old names are aliases: `cyberpunk-soft` and `soft` give `cyberpunk-edgerunners`; `cyberpunk-classic` and `classic` give `ghostrunner`. So an old restart line (`bin/loadout cyberpunk-soft --resume <id>`) still works. `cyberpunk` alone is now a prefix of one theme, `cyberpunk-edgerunners`, and picks it. The aliases are for names a person types: a `theme` setting that still says `custom:cyberpunk` or `custom:cyberpunk-soft` names a file that is gone, and no pack serves it but `default`.

## Which pack serves a theme

The theme name is normalised: trimmed, lower case, a leading `custom:` removed, runs of spaces and `_` turned into `-`. Then, first hit wins:

1. the pack whose `slug` is that name;
2. the packs with a `match` string the name contains: the longest such string wins, then the slug first in alphabetical order;
3. `default`.

An empty name means the theme is not read yet: no pack; each part keeps what it shows.

`python3 themes/validate.py --resolve "custom:my-theme"` prints the answer.

## Pack fields

`themes/schema.json` is the reference. Every colour is `#rrggbb`. A "token" is the name of a `flow.palette` key.

| Field | On screen |
|---|---|
| `slug` | Nothing. The key, and the file name without `.json`. |
| `name` | Nothing yet. The name for a person. |
| `match` (optional) | Nothing. Other theme names served, as substrings (see above). |
| `isLight` | Avatar: the stage is by day (white clouds, sparkles), light sprites are drawn darker. |
| `terminal.background` | Avatar: the terminal's background (OSC 11, unless `/loadout background off`) and the Avatar pane's background, always the same colour. `null`: the terminal's own, no pane background. |
| `avatar.family` | The mascot: `kirby`, `clawd`, `initial-d` (a car per model, seen from the front, its headlights for eyes; `avatar/hooks/touge.ts`), or `cyber` (the text HUD with a character). Art, names and speech lines are code; a `cyber` theme's characters also come from footage folders (see `avatar.variant`). So do an `initial-d` theme's: its world is `initiald`, and where the slot `initiald-<form>` has footage and the terminal draws pictures, the pane is the camera feed of that driver in a HUD worded as a downhill stage; where the feed does not play (no footage, no pictures, `/loadout style text`) it is the cars; on a pane too small for the box, the HUD without a picture. Never the mask. |
| `avatar.variant` | `cyber` only, required. A `cyber` theme maps to a world, and the variant says which: `red` is the Ghostrunner world (and the red skin, the drawn ninja), `yellow` the Edgerunners world (the yellow skin, the drawn thief). The world and the session's model name the character shown: the slot `<world>-<form>` (`ghostrunner-sonnet`, `edgerunners-fable`), whose footage is `assets/<slot>/`. `README.md` has the cast and the folder's contract. Not allowed on the other families. |
| `avatar.skin` (optional) | `cyber` and `initial-d` only: the HUD's ten colours (on `initial-d`, of the HUD around the camera feed; the cars keep their own). `primary` frames and titles, `bright` lit edge, `body` and `shadow` the mask (`shadow` also the empty part of a bar), `dim` captions, `cyan` live or selected, `alert` alarms, `value` counts, `tint` recess background, `ink` text on a filled bar. Absent: the mod's own skin for the variant, or for `initial-d` its night skin. |
| `flow.palette` | Every colour of the Flow map pane, 20 tokens. `bg` pane background; `page` the ground around it; `fg`, `text2`, `text3`, `text4` text from strongest to faintest; `border` boxes and the pending rail; `cardBorder` a running agent's card; `track` empty bar; `select` selected row background; `cyan` box titles and gradient start; `green` done and gradient end; `yellow` what runs; `orange` over estimate; `red` failed or blocked; `blue` tokens and read tools; `violet` shell tools; `railDone`, `railRun` the rail under a done or running node; `tabActive` the active tab. |
| `flow.steps.header` | The Steps list's and wayfinder map's header. `style`: `boxed` (a box, title in the top border), `plain` (one title line), `banner` (title in `bg` colour on a full-width ground of `color`), `bracketed` (title in square brackets on a rule, no sides). `prefix` is written before the title (`"JOB // "`). `color` and `frame` are tokens. Optional: `upper` (title and the map's group names and captions in upper case), `corners` (`boxed` only: four characters, top left, top right, bottom left, bottom right; `"┌┐└╱"` is a square frame with a cut corner). |
| `flow.steps.layout` (optional) | `path` (default): a node and its label per step, a rail row down to the next: a map of stages. `list`: one row per step, no row between: a filled left edge, the node, the label: a list of objectives. |
| `flow.steps.meter` (optional) | The progress row under the header. `style` `bar`: `fill` cells coloured cyan to green, `empty` cells in `track`, the percent. `style` `pips`: one mark per step in its state's glyph and colour (the bar when they do not fit). Default: a bar of `■`. |
| `flow.steps.states` | One entry per state: `done`, `active`, `pending`, `blocked`. Each: `glyph` (the node), `color` (token, node and label), `bold`, `rail` (the character down to the next node), `railColor` (token). Optional: `labelColor` (the label, when not the node's colour), `strike` (label struck through), `edge` and `edgeColor` (list layout: the row's left edge; default the rail), `ground` (token: the row's background, `select` to band the active step). In the wayfinder map: done = resolved, active = here, pending = next, blocked = blocked; its tickets stand behind the state's rail (path) or edge (list). |
| `flow.steps.cycle` (optional) | Animates the active node: `glyphs` (2 to 8) in turn, `ms` each; none may be another state's glyph (for that frame the active step would read as done or pending). Absent: `states.active.glyph`, still. It turns while the model works (a turn is running) or a run is live, and stands still otherwise. |
| `flow.steps.captions` | `title` when the plan has none, `active` a word beside the active step's `i/n` (`""` for none), `blocked` the word beside a blocked step: 16 characters at most. Optional: `optional` (a step whose label opens with "optional" loses that word and gets this tag in brackets), `progress` and `idle` (the line under the title with and without an active step: 60 characters, with `{i}` the active step, `{n}` the steps, `{done}`, `{left}`; what stands before the first ` · ` is drawn strong). |
| `spinner` (optional) | The line that animates while Claude works (the frames part draws it). `verbs`: 1 to 40 phrases of 32 characters at most, one of which stands for Claude Code's own word for a whole turn (`Inhaling…`). `frames`: 1 to 8 one-cell characters shown in turn before the line, each for `ms` (100 to 2000), in the theme's `claude` colour: on the ribbon with the frames on, bare with them off. Claude Code's own mark, time and token count stay after it. Absent: Claude Code's own line. |

Glyphs, rails, edges, meter cells and corners are one character, one terminal cell wide, from the Basic Multilingual Plane.

What each of the six packs draws, and from what:

| Pack | Steps | Inspired by |
|---|---|---|
| `default` | The default box, rail and nodes; the active step on a band, done nodes in the rail's green, "N left". | The plugin's own default design. |
| `kirby` | A yellow plaque with the title; one star per cleared stage and a twinkling warp star (never the cleared star) on the current one, as a row of marks and down a double path; `<('.')>` beside the current stage. | Kirby's Adventure's hub (the plaque "LEVEL 1 : VEGETABLE VALLEY" and the row of health marks under it) and Kirby Super Star's Dyna Blade map (star badges on cleared stages, Kirby standing on the current one, a pale double path). |
| `kirby-pink` | The same at dusk, on a deep berry ground: a pink plaque, Kirby's pink ball pulsing on the current stage. | The same two screens. |
| `ghostrunner` | A square frame with a cut corner, an upper-case title after `JOB //`; objectives as rows with a filled left edge, the tracked one in light blue on a dark red band with `TRACKED`, done ones dim and struck, `[OPTIONAL]`, `LOCKED`. | Cyberpunk 2077's journal screen (red tab at the left of each job, light-blue titles, a filled row for the selected job, thin frames, small upper-case captions). |
| `cyberpunk-edgerunners` | No frame: a yellow upper-case title after `◆`, a thin line meter, objectives with diamond bullets, the current one cyan behind a yellow `▸`, `CURRENT`, `NO SIGNAL`. | Cyberpunk 2077's on-screen job tracker, from the screenshot "Cyberpunk 2077's primary HUD" (interfaceingame.com/articles/cyberpunk-2077-ux-ui-critique): the upper-case job name on a line of its own with no frame, the objective under it behind a yellow marker, tiny upper-case `CONNECTION` captions. The colours are the theme's, not the game's: there the job name is red and the objective yellow; here the title is yellow and the current objective cyan. |
| `initial-d` | A downhill course: an upper-case title after `STAGE //` between brackets on a guard-rail rule, a road-line meter, a flag on each corner cleared, a tyre that turns on the current one above `corner 3 of 6 · 4 to go`, `DRIFTING`, `ROAD CLOSED`, `[SIDE ROAD]`. | No screen: the look of a night mountain pass as the street-racing manga and anime have it, in the pack's own drawing (a teal-navy night, the street lamps' yellow-green, fog-light yellow, tail-light red, moonlit blue-greens). |

## What stays code

- A family's art, names, speech and worry lines; for `cyber`, the drawn character, the mask and their lines come from `variant`; for `initial-d`, the cars, the HUD's captions around its camera feed and its lines. (A slot's footage, name and speech are data: its `manifest.json`.)
- Built-in light themes: `default.json` has `isLight: false` and serves `light` too. The avatar keeps one name test: `isLight = pack.isLight || (pack.slug === 'default' && /^light/i.test(theme))`. A `light.json` pack with `"match": ["light"]` would remove it.
- Flow map colours tied to meaning rather than to a theme (tool kinds, wayfinder ticket types, the progress gradient cyan to green) are fixed uses of palette tokens.
- The Flow map's run view (summary box, phases, agent cards) and its group of plain subagents keep the default design on every theme: a pack changes their colours, not their shape. The wayfinder map's group names (here, next, blocked), ticket-type glyphs and fold arrows are code too.

## How the parts find and reload packs

- Folder: `<plugin root>/themes`; where that holds no pack, `<plugin root>/../themes` (`/loadout status` prints the folder the packs came from).
- A pack is any `*.json` there except `schema.json`.
- Read on session start and each time the `theme` config row changes; `/reload-plugins` reads again. The theme a pack is picked for is the one the terminal shows: for a live theme file, the theme it was written from, read again within a few seconds of the file changing.
- The Flow map also lists the folder again every 4 seconds (every 60 with no folder) and reads the files only when a name, size or time changed: an edited pack shows in its pane within a few seconds.
- A pack that does not parse or lacks a field is skipped, the others stand. With no pack for a theme (no folder, or no `default.json`) the Flow map draws from its built-in tables: the palette of the theme's name as before packs, and the built-in steps (`STEPS` in `flow/hooks/palette.ts`). The same holds for a theme named after one of the four built-in families (`kirby`, `kirby-pink`, `ghostrunner`, `cyberpunk-edgerunners`) while that family's own pack is missing or broken and no pack has the theme's exact slug: it keeps its built-in palette instead of taking another pack through `match` or `default` (a broken `kirby-pink.json` does not turn the light pink theme dark green). The mods do not validate; `validate.py` does.

Reading a pack (pseudo-code, both parts):

```ts
const norm = (theme: string) => theme.trim().toLowerCase().replace(/^custom:/, '').replace(/[\s_]+/g, '-')

function packOf(theme: string, packs: Pack[]): Pack | null {
  const name = norm(theme)
  if (name === '') return null
  const exact = packs.find(p => p.slug === name)
  if (exact) return exact
  const hits = packs.flatMap(p => (p.match ?? []).filter(m => name.includes(m)).map(m => ({ p, m })))
  hits.sort((a, b) => b.m.length - a.m.length || a.p.slug.localeCompare(b.p.slug))
  return hits[0]?.p ?? packs.find(p => p.slug === 'default') ?? BUILT_IN_DEFAULT
}
```

Avatar (`themed` in `avatar/hooks/families.ts`, the packs read by `avatar/hooks/packs.ts`):

```ts
const pack = packOf(theme, packs)
const ground = pack?.terminal.background ?? undefined        // OSC 11 and the pane's backgroundColor; undefined = leave
const family = pack === null ? KIRBY                          // theme unknown yet: as today
  : pack.avatar.family === 'cyber' ? cyber(pack.avatar.skin ?? SKINS[pack.avatar.variant], pack.avatar.variant)   // red: world 'ghostrunner'; yellow: 'edgerunners'
  : pack.avatar.family === 'initial-d' ? touge(pack.avatar.skin ?? SKINS.night)   // world 'initiald'; its `cars` are drawn wherever the feed does not play
  : FAMILIES[pack.avatar.family]
```

Flow map (`lookOf` and `toPack` in `flow/hooks/palette.ts`, the drawing in `flow/hooks/draw.ts`):

```ts
const { P, S } = lookOf(theme, packs)                        // the pack's palette and steps, else the built-in ones (also while a built-in family's own pack is missing)
const st = S.states[step.status]                              // 'done' | 'active' | 'pending' | 'blocked'
const node = step.status === 'active' && S.cycle ? S.cycle.glyphs[Math.floor(now / S.cycle.ms) % S.cycle.glyphs.length] : st.glyph
row  = S.layout === 'list'
  ? [s(st.edge, P[st.edgeColor]), s(` ${node} `, P[st.color], st.bold), s(step.label, P[st.labelColor], st.bold)]
  : [s(`${node}  `, P[st.color], st.bold), s(step.label, P[st.labelColor], st.bold)]   // then a row of s(st.rail, P[st.railColor])
```

## Validate

```
python3 themes/validate.py              # every pack; exit 1 on a failure
python3 themes/validate.py --self-test  # the validator catches broken packs
python3 themes/validate.py --sync       # after any pack change: rewrites flow/tests/packs.ts
```

It checks: the schema; file name = slug; no slug or `match` string used twice; `flow.palette.bg` and `page` equal `terminal.background` where set; `isLight` agrees with `bg`; one-cell glyphs, rails, edges, meter cells and corners; no cycle glyph that is another state's; caption templates use only `{i} {n} {done} {left}`; WCAG contrast on `bg` (`fg`, `text2..4`, the header's colour and every state's label colour at 4.5 or more, on the state's `ground` too; `cyan green yellow orange red blue violet tabActive` and every state's node colour at 3 or more); the skin's foreground colours at 3 or more on the terminal background.

`flow/tests/packs.ts` is a generated copy of the packs: a plugin's test can read no file outside the plugin, and no JSON. The validator fails while that copy is stale, and `--sync` rewrites it. Then run `claude plugin test .`, which draws every pack at every width from 34 to 96 columns.


## The copies

- Sessions run the installed copy of the plugin (`~/.claude/plugins/cache/zokuzo/loadout/<version>/`), packs and all, not a clone of the repository. To add or change a theme, work in a clone added as a marketplace (`README.md`, Install): after an edit, raise `version` in `.claude-plugin/plugin.json`, run `claude plugin update loadout@zokuzo` and restart.
- The colour files the plugin ships are in `colors/<slug>.json`. At a session's start each is copied to `~/.claude/themes/` where no file of that name is there; a file there is never written over. A new theme's colour file goes in `colors/` to be shipped, or straight in `~/.claude/themes/` to stay yours.
- `/loadout status` names the folder the packs came from.

## Worked example: "Kirby Night"

1. Claude theme: copy `colors/kirby.json` to `colors/kirby-night.json` (and to `~/.claude/themes/kirby-night.json`, to see it now), set `"name": "Kirby Night"`, change the colours.
2. Pack: copy `themes/kirby.json` to `themes/kirby-night.json`. Change:
   - `"slug": "kirby-night"`, `"name": "Kirby Night"`;
   - `"match": ["kirby-night"]`, or delete `match` (two packs may not share a string, and `kirby.json` has `"kirby"`);
   - `terminal.background`, then `flow.palette.bg` and `page` to the same colour;
   - the palette's other colours; the Claude theme's `text` is a good `fg`;
   - `flow.steps` if the list should look different;
   - `avatar` stays `{ "family": "kirby" }`.
3. `python3 themes/validate.py`; fix what it names (a contrast failure gives the colour, the ratio and the ratio needed). Then `python3 themes/validate.py --sync`.
4. Pick it: `/loadout night` (or `/loadout`, then its row in the picker). No reload: the pack is read within a few seconds, and the picker lists the new theme file by itself. (Colours changed later in `kirby-night.json` reach the terminals at the next `/loadout night`: they show the live copy.)

No code changes. A new mascot is the only case that needs one: add the family in `avatar/hooks/families.ts`, then its name to `avatar/hooks/packs.ts` (`PackFamily`, `FAMILIES`) and to `avatar.family` in `themes/schema.json`.

## Notes added after the packs were wired in

- Packs are re-read within about 4 seconds of a file change (name, size or modification time); no reload command is needed.
- For the four themes with built-in tables (kirby, kirby-pink, ghostrunner, cyberpunk-edgerunners; not initial-d), a pack that is missing or skipped as malformed falls back to that theme's built-in tables in each part, never to a sibling pack through its `match` string.
- `/loadout status` lists the packs loaded and any skipped, with the reason.
