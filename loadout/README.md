# Loadout

One theme picks the whole kit, as a loadout does in a game: Claude Code's colours, the terminal background, the avatar, the Flow map's style and the frames around conversation rows. One plugin, one command.

It is three parts in one plugin (they were the mods `kirby-hud`, `flow-map` and `color-rows`):

| Part | Folder | What it draws |
|---|---|---|
| Avatar | `avatar/` | The "Avatar" side pane: the theme picker, a mascot or character per theme, the agents on a stage, the usage meters. It also tints the terminal background per theme (and, on a light theme, sets the terminal's text colours to dark inks, so code stays readable). |
| Flow map | `flow/` | The "Flow map" pane: workflow runs, plain subagents, the step plan, the wayfinder map. Registers the tool `mcp__loadout__steps`. |
| Frames | `frames/` | A coloured frame around each conversation row, one hue per kind of action; and the working line in the theme's own words behind its own turning icon (a pack's `spinner`, `THEMES.md`). |

## The command

| Typed | Does |
|---|---|
| `/loadout` | Opens the picker in the Avatar pane and lists the themes, the current one marked. |
| `/loadout <theme>` | That theme for every terminal, with no restart (see "Live theme files" for the first time). |
| `/loadout <theme> here` | This terminal only. With no restart in a terminal the shell launcher started. In any other, nothing changes: it copies and prints the line that starts the conversation again through the launcher (press Ctrl+D, paste, Enter). |
| `/loadout follow` | The line that makes a terminal with its own theme follow the global one again. |
| `/loadout avatar` \| `flow` | Opens that pane. |
| `/loadout frames on\|off` | The frames around conversation rows. |
| `/loadout background on\|off` | Whether the theme tints the terminal background. |
| `/loadout style pixel\|text\|auto` | How a Ghostrunner or Edgerunners character is drawn: `text` shows no footage. |
| `/loadout status` | Theme and what set it, pack in use, packs skipped, each character slot (found, with its name and number of loops, or missing), panes, frames. |
| `/loadout help` | This list. |

A theme's name is forgiving: any case, spaces or dashes (`Cyberpunk Edgerunners`, `cyberpunk-edgerunners`), or a prefix or word that only one theme has (`ghost`, `edge`, `edgerunners`, `cyberpunk`, `pink`). An exact name wins over a prefix (`kirby` is Kirby, not Kirby Pink). An ambiguous or unknown name changes nothing and lists the candidates.

Two themes were renamed, and their old names still work, here and in the shell launcher: `cyberpunk-soft` and `soft` are `cyberpunk-edgerunners`; `cyberpunk-classic` and `classic` are `ghostrunner`. (The red theme was `cyberpunk`: that word now picks Cyberpunk Edgerunners, the one theme it begins.)

`/loadout` and `/loadout status` say what set the theme: "the global theme", "this terminal's own theme", "pinned to this terminal", "the theme this terminal started with" (the global one changed since and shows at its next start), a project's or a managed settings file. A session started in the home directory reads `~/.claude/settings.json` as its project file too: that is said as "set by your global settings", and `/loadout <theme>` changes it as anywhere else.

In the picker, each theme is a row: four of its own colours, a digit (1 to 9), its name, a mark on the one this terminal shows. Press the digit or click the row: it does what `/loadout <theme>` does, says so in a toast, and the picker folds to one line, `loadout: <name> [ change ]`. On a pane too short for the picker and the avatar, it stays folded, and `[ change ]` or `/loadout` says so in a toast: make the pane taller or type `/loadout <theme>`. At the one height where even the folded line would cost the pane its mascot, the line is not drawn.

`/avatar`, `/kirby`, `/flow` and `/colors` still work with their old arguments.

## Live theme files

A running Claude Code session keeps the theme it started with: changing the `"theme"` setting repaints nothing. But it watches the file of the theme it uses, and repaints within seconds when that file's content changes. So Loadout switches by rewriting theme files of its own, the "live" files:

| File | Used by | Rewritten by |
|---|---|---|
| `~/.claude/themes/loadout.json` | Every terminal that follows the global setting, which is `"theme": "custom:loadout"`. | `/loadout <theme>`, the picker. |
| `~/.claude/themes/loadout-<tag>.json` | The one terminal the shell launcher started on it (`<tag>` is its tty: `pts3`). | `/loadout <theme> here` in that terminal; `/loadout <theme>` too. |

A live file is a copy of a theme (its `base` and `overrides`) under the name `Loadout: <theme>`: Claude Code's own `/theme` lists it by that name. A built-in theme is `{ "base": "dark", "overrides": {} }`. Everything in the plugin (avatar, Flow map, terminal background, picker) reads the theme a live file was written from, and reads it again when the file changes. Live files are never listed as themes. A new theme is still a file in `~/.claude/themes` plus a pack (`THEMES.md`).

The first `/loadout <theme>` writes `loadout.json` and sets the `"theme"` key of `~/.claude/settings.json` to `custom:loadout` (that key only; refused under a managed setting). Terminals already running on another theme keep it until they start again: the command says so and copies the line that restarts this one. From then on a switch is one line, `Loadout <theme>: every terminal.`

`auto` (light or dark by the terminal's ground) can be no theme file: `/loadout auto` sets the `"theme"` setting itself, and each terminal takes it at its next start. A theme picked with Claude Code's own `/theme` is followed as before.

## The shell launcher

```
loadout/bin/loadout [<theme>] [claude arguments...]
```

Starts Claude Code with a live theme file of this terminal's own, so `/loadout <theme> here` switches it alone, with no restart. With a theme, the file is written from it (the same forgiving names). Without one (no word, or claude's own arguments first: `--resume <id>`), the terminal's file is used as it was left, and made from the global look the first time. `--list` lists the themes. Before starting it removes the files of terminals that are gone (`loadout-<tag>.json` with no such tty), never `loadout.json`.

```
loadout/bin/loadout edge
loadout/bin/loadout dark --resume <id>
loadout/bin/loadout --resume <id>
```

Optional: to start every terminal through it, add an alias to your shell file, under a name of its own:

```
alias cl="$HOME/.claude/plugins/marketplaces/zokuzo/loadout/bin/loadout"
```

(Not as `claude` itself: the launcher reads a first word without a dash as a theme name, so `claude plugin list` or `claude "a prompt"` would be refused.)

`bin/claude-theme` is its earlier name and calls it. It takes only theme files named in lower case, digits and dashes (`<slug>.json`): any other file in `~/.claude/themes` is not listed and not started (in a session, `/loadout <that theme> here` hands the plain `claude --settings` line, which pins the theme with no live file). `auto`, and any theme where there is no tty to name a file after, is pinned the same way. Its check: `bash tests/launcher.sh`.

## Where things live

- Claude themes (colours): `~/.claude/themes/<slug>.json`, and the built-in ones. The plugin ships its own in `colors/` and copies them there at its first start (see Install). `loadout.json` and `loadout-<tag>.json` there are the live files, written by Loadout: do not edit them.
- Theme packs (background, mascot, Flow map look): `themes/<slug>.json`, in this folder. Without that folder the built-in tables answer.
- Pictures and footage: `assets/<slot>/`, one folder per character (below).
- What is kept between sessions (pet count, style, background switch, frames on or off, the Flow map's learned durations): this plugin's own store. At its first start it copies what the three old mods kept.

To add a theme, see `THEMES.md`.

## The characters: one per theme and model

The Ghostrunner, Cyberpunk Edgerunners and Initial D themes show a framed camera feed of a character where its footage is on the machine (none is shipped: see "The pictures"), and which one follows the session's model. A character's place is a slot, `<world>-<form>`: the world is the theme's, the form the model's.

| Model | Ghostrunner (`ghostrunner-…`) | Cyberpunk Edgerunners (`edgerunners-…`) | Initial D (`initiald-…`) |
|---|---|---|---|
| Opus (`…-opus`) | Jack | Lucy | Takumi |
| Sonnet (`…-sonnet`) | Hel | David Martinez | Ryosuke |
| Haiku (`…-haiku`) | Mitra | Rebecca | Keisuke |
| Fable (`…-fable`) | Mara the Keymaster | Adam Smasher | Bunta |

Footage for a slot is a folder, `assets/<slot>/`, with a `manifest.json` and one folder of frames per loop (`<clip>/000.png`, `001.png`, ...; every picture 400 by 340, so the feed's box is one size whoever is in it):

```json
{
  "name": "HEL",
  "speech": { "idle": "...", "working": "...", "happy": "...", "worried": "..." },
  "clips": { "watching": { "frames": 20, "ms": 90, "what": "watches the corridor" } },
  "moods": { "idle": ["watching"], "working": ["..."], "happy": ["..."], "worried": ["..."] }
}
```

- `name`: shown under the feed, before the model (24 characters at the most). Left out or unusable, the footage plays under the slot's own character's name from the cast above (`/loadout status` says so), never the mask's.
- `speech` (optional, each mood too): what the banner says in that mood (60 characters; the banner cuts what does not fit). A mood without a line keeps the theme's own; so does a manifest without `speech`.
- `clips`: a loop's name (lower case, digits, dashes) is its folder; `frames` how many pictures it has, `ms` how long each shows (30 to 1000, else 90). `what` is a note for people.
- `moods`: the loops of each mood, played in turn, each for about seven seconds. `idle` is required; a mood left out plays the idle loops.

To add or replace a character, drop its folder in `assets/`: nothing else. A running session looks for the manifests still missing every 15 seconds, so the feed starts within a few seconds of the folder landing (a manifest already read is kept until `/reload-plugins`). When the model changes mid-session, the feed switches within a few seconds. The pictures' clock is 90 ms; a slot with a loop cut finer than that is drawn every 45 ms, twenty-two frames a second, as the Y2K objects are.

The two Y2K themes have a cast of their own, and it is not footage: four objects of chrome, each turning in three dimensions and drawn in ASCII characters, computed in the pane a frame at a time (`avatar/hooks/chrome.ts`), twenty-two frames a second. Opus is Seraph, a ring with a bead looping through its hole; Sonnet is Lumen, a drop of liquid metal and two that circle it; Haiku is Spark, a four-point star; Fable is Halo, a core in three rings. Depth is drawn as weight: what is near and lit is a heavy character in the strongest colour, what is far a faint one, and a cell is left empty behind the edge of a part that passes in front. At work they turn twice as fast, pleased they bob among glints, worried they slow and redden. (Their worlds, `y2k` and `y2kdark`, take pictures as any other does: `python3 footage/y2k.py` renders the same objects as picture loops into `assets/`, and they then play in place of the ASCII where the terminal draws pictures. None is shipped.)

Where a slot has no manifest:

- Opus shows its still portrait frames if the folder has them (`assets/<slot>/<mood>-NN.png`, twelve per mood), else the drawn character: the ninja for Ghostrunner, the thief for Edgerunners.
- Sonnet, Haiku and Fable show Raijin, the mask, in that model's variant.
The two Halo themes are both dark. Halo Dark is the Master Chief: where its slot has footage (`halodark-opus`, `FOOTAGE.md`) the pane plays a camera feed of him like the other game themes, with a loop per kind of tool call beside the four moods; without it, his helmet is drawn in 3D ASCII, modelled after the Mark VI (a bill over a tall gold visor, a cheek guard with two lamps at each side, a chin guard rising to a point). Halo is Cortana, and always drawn in 3D ASCII, as the Y2K objects are (`avatar/hooks/halo.ts`; its pack says `"film": false`): a hologram of her bust on a violet-black ground, her head under its bob turning to where the work is. She looks down at a panel for a read or an edit, prompts run beside her for a shell command, she listens for the web, her fragments circle her while subagents run, an orb glows for a skill, a question mark for a question; her eyes and mouth tell the mood, and worried her picture tears. Their pane is the game's HUD (`avatar/hooks/halopane.tsx`): a comm line in a round box, the context left as a shield bar, a motion tracker with a blip per agent at work, each limit as the rounds left in a magazine, shaded in gradients.

- On Initial D, every model shows its pixel car (Eight-Six, Twin Rotor, Red Hatch, Night Coupe) in the pane the cars always had: never the mask or a drawn character, which belong to the other two worlds. The pane becomes the feed, in a HUD worded as a downhill stage, when the slot's folder lands (on a pane too small for the box, that HUD without a picture).

The same holds where the terminal draws no pictures (anything but kitty or Ghostty, or inside tmux) and with `/loadout style text`: no footage, the drawn character for Opus, the mask for the others, the cars on Initial D.

## Install

In Claude Code:

```
/plugin install loadout --marketplace Zokuzo/loadout
```

or from a shell: `claude plugin marketplace add Zokuzo/loadout`, then `claude plugin install loadout@zokuzo`. Restart Claude Code, type `/loadout` and pick a theme.

At its first start the plugin copies the colour files it ships (`colors/<slug>.json`) into `~/.claude/themes/`, where no file of that name is there: a file of yours is never written over. Delete one there and it comes back at the next start with the shipped colours.

An installed plugin is a copy, in `~/.claude/plugins/cache/zokuzo/loadout/<version>/`: sessions run that copy. To work on the plugin, clone the repository, add the clone as a marketplace (`claude plugin marketplace add <path to the clone>`), and after an edit raise `version` in `.claude-plugin/plugin.json`, then:

```
claude plugin update loadout@zokuzo
```

and restart Claude Code. `/loadout status` ends with `Plugin folder:`, the copy a session runs.

## Checks

```
npx -y -p typescript tsc -p .      # in a clone: once Claude Code has loaded it (claude --plugin-dir .), which writes .claude-plugin/types/
claude plugin validate .
claude plugin test .
bash tests/launcher.sh
python3 themes/validate.py
```

## The pictures

Everything in this repository is drawn in code or as data: the sprites, the text characters, the mask. The camera feed of the Ghostrunner, Cyberpunk Edgerunners and Initial D themes plays footage from `assets/<slot>/`, and no footage is shipped: it would be other people's work. Without it the first two draw their built-in characters and the mask, and Initial D its pixel cars. The Y2K themes need none: their objects are drawn in ASCII by code. `FOOTAGE.md` says how to rebuild the author's feeds from a video of your own: the recipe of each is shipped (`footage/<slot>.json`), and `bin/footage` cuts the frames. `assets/` is ignored by git.
