# The camera feeds: getting the author's render

On five themes, Ghostrunner, Cyberpunk Edgerunners, Initial D, Halo and Halo Dark, the Avatar pane shows a framed camera feed of a character, one per model. The author's feeds are cut from the games and the anime, so they are not in this repository: that footage belongs to its owners. Without it the first two draw their built-in characters and a mask, Initial D its four pixel cars, the Halo themes their figures in ASCII, and everything else (colours, Flow map, frames, working line, the other themes) is already identical to the author's.

What is shipped is the recipe of each feed: `footage/<slot>.json` names every loop, how many frames it has, how long a frame shows, what the loop shows in a few words, and the character's name and lines. With a video of your own and `bin/footage`, you rebuild the same feed.

(The Y2K themes are not part of this: their objects are drawn in ASCII by code, `avatar/hooks/chrome.ts`.)

## The fourteen feeds

| Slot | Theme | Model | Character | Loops | Frames |
|---|---|---|---|---|---|
| `ghostrunner-opus` | Ghostrunner | Opus | Jack | 9 | 186 |
| `ghostrunner-sonnet` | Ghostrunner | Sonnet | Hel | 11 | 231 |
| `ghostrunner-haiku` | Ghostrunner | Haiku | Mitra | 8 | 194 |
| `ghostrunner-fable` | Ghostrunner | Fable | Mara the Keymaster | 9 | 182 |
| `edgerunners-opus` | Cyberpunk Edgerunners | Opus | Lucy | 12 | 290 |
| `edgerunners-sonnet` | Cyberpunk Edgerunners | Sonnet | David Martinez | 12 | 252 |
| `edgerunners-haiku` | Cyberpunk Edgerunners | Haiku | Rebecca | 13 | 221 |
| `edgerunners-fable` | Cyberpunk Edgerunners | Fable | Adam Smasher | 9 | 184 |
| `initiald-opus` | Initial D | Opus | Takumi | 15 | 330 |
| `initiald-sonnet` | Initial D | Sonnet | Ryosuke | 11 | 246 |
| `initiald-haiku` | Initial D | Haiku | Keisuke | 9 | 199 |
| `initiald-fable` | Initial D | Fable | Bunta | 5 | 106 |
| `halo-opus` | Halo | Opus | Cortana | 12 | 222 |
| `halodark-opus` | Halo Dark | Opus | Master Chief | 12 | 250 |

The two Halo feeds have loops for kinds of tool call too, beside the four moods: a recipe's `moods` may name `scan` (a read), `edit`, `exec` (a shell command), `net` (the web), `call` (subagents), `load` (a skill), `ask` and `tool`, and such a loop plays while a call of that kind runs. Any slot's manifest may.

## Rebuild one

You need `ffmpeg`, `python3`, a terminal that draws pictures (kitty or Ghostty), and a video you are entitled to use: your own capture of the game, or a release of the anime you own.

1. List a slot's loops and what each shows:

   ```
   bin/footage edgerunners-opus
   ```

   ```
   edgerunners-opus  (LUCY)
     · idle     hood-rooftop          20 frames x 90 ms  ...
     · working  quickhack             24 frames x 90 ms  ...
   ```

2. Find that moment in your video and cut it, giving the time the loop starts:

   ```
   bin/footage edgerunners-opus quickhack ~/Videos/my-capture.mkv 0:12:31.5
   ```

   The script takes the loop's frames at its rate and fits each to 400 by 340 pixels, filled and cut at the centre. For a face in a wide shot, add an ffmpeg crop (`width:height:x:y`) as a last word: it is taken before the fit.

3. Repeat for each loop. `bin/footage <slot>` marks the ones that are cut. When the last one is, the script writes the slot's manifest and a running session starts the feed within a few seconds.

A loop of 22 frames at 90 ms is two seconds of video. A slot is 5 to 15 loops: about a quarter of an hour once you know where the scenes are.

`bin/footage` is in the installed copy too: `~/.claude/plugins/marketplaces/zokuzo/loadout/bin/footage`.

## Where the frames go

`~/.claude/plugins/cache/zokuzo/loadout/assets/<slot>/`, beside the installed copies of the plugin: an update of the plugin leaves that folder alone. Set `LOADOUT_ASSETS` to write elsewhere (in a clone: `LOADOUT_ASSETS=assets bin/footage ...`, a folder git ignores).

## Changing a feed

A recipe is a starting point. Copy `footage/<slot>.json` to the slot's folder as `manifest.json` and edit it: other loops, another name, other lines. `README.md`, "The characters", has the manifest's contract. Any character works in any slot.

Please keep what you cut on your own machine.
