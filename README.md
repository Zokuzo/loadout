# Loadout

A theme plugin for [Claude Code](https://claude.com/claude-code). One theme picks the whole kit, as a loadout does in a game:

- Claude Code's colours and the terminal background;
- an **Avatar** side pane: a mascot per theme and model, your subagents on a stage, the usage meters;
- a **Flow map** pane: workflow runs, subagents and the step plan, drawn in the theme's style;
- coloured **frames** around conversation rows, one hue per kind of action;
- the **working line**: the theme's own words and a turning icon while Claude works (`★ Inhaling…`).

![The six themes, drawn from their own colour files](docs/themes.png)

![The Initial D cars, one per model](docs/initial-d.png)

## Install

In Claude Code:

```
/plugin install loadout --marketplace Zokuzo/loadout
```

Restart Claude Code, then type `/loadout` and pick a theme. That is all: the colour files are installed at the first start.

## The themes

| Theme | Look | Mascot | While it works |
|---|---|---|---|
| `kirby` | Dream Land green, star yellow | Kirby, one copy ability per model | `★ Riding the Warp Star…` |
| `kirby-pink` | Dream Land at dusk: Kirby's pink on deep berry | Kirby | `♥ Napping on a cloud…` |
| `ghostrunner` | Red on near-black, a job journal | A cyber-ninja and a mask | `╱ Wall-running…` |
| `cyberpunk-edgerunners` | Yellow on near-black, a job tracker | A thief and a mask | `◆ Breaching ICE…` |
| `initial-d` | A mountain pass at night: panda white, fog-light yellow, tail-light red | One car per model | `◴ Running the gutter…` |
| built-in themes (`dark`, `light`, ...) | Claude Code's own colours | Clawd | `○ Scuttling…` |

## The command

| Typed | Does |
|---|---|
| `/loadout` | Opens the picker in the Avatar pane and lists the themes. |
| `/loadout <theme>` | That theme for every terminal, with no restart. Names are forgiving: `pink`, `ghost`, `edge`. |
| `/loadout <theme> here` | This terminal only. |
| `/loadout frames on\|off` | The frames around conversation rows. |
| `/loadout background on\|off` | Whether the theme tints the terminal background. |
| `/loadout status` | What is set, by what, and from which folder. |
| `/loadout help` | The full list. |

The full reference is [`loadout/README.md`](loadout/README.md).

## Make your own theme

A theme is two JSON files and no code: Claude Code's colours, and a "pack" (background, mascot family, Flow map palette, step style, the working line's words and icon). [`loadout/THEMES.md`](loadout/THEMES.md) walks through one, and `python3 loadout/themes/validate.py` checks it, contrast included.

## Good to know

- Pictures need a terminal with the kitty graphics protocol (kitty, Ghostty). Elsewhere a text version is drawn.
- The plugin is written against Claude Code's plugin hooks (`ui.render`, panes). It needs a recent Claude Code.
- No footage is shipped for the Ghostrunner and Edgerunners camera feeds; those themes draw their built-in characters. You can add your own (`loadout/README.md`, "The characters").

## Checks

```
cd loadout
python3 themes/validate.py
claude plugin validate .
claude plugin test .
bash tests/launcher.sh
```

## License and credits

The code is under the [MIT license](LICENSE). The pixel art is drawn for this project; where it depicts a character someone else owns, that grant covers the drawing, not the character.

This is an unofficial fan project. Kirby, Ghostrunner, Cyberpunk: Edgerunners, Cyberpunk 2077 and Initial D are the property of their respective owners, and Claude, Claude Code and Clawd are Anthropic's. This project is not affiliated with or endorsed by any of them, and ships none of their assets.
