#!/usr/bin/env bash
# The shell launcher against a fake `claude` and a scratch themes folder: bash tests/launcher.sh
# (`claude plugin test` runs the *.test.ts files only: this one is run by hand.)
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/themes" "$tmp/bin"
printf '#!/bin/sh\nprintf "%%s\\n" "$@"\n' > "$tmp/bin/claude"; chmod +x "$tmp/bin/claude"
touch "$tmp/themes/kirby.json" "$tmp/themes/kirby-pink.json" "$tmp/themes/cyberpunk-edgerunners.json" "$tmp/themes/ghostrunner.json" \
  "$tmp/themes/my theme.json" "$tmp/themes/zed\",\"model\":\"evil.json" "$tmp/themes/Upper.json"
# (No tty named, as where there is none: the theme is pinned by --settings, as before live files. The live files are further down.)
run() { LOADOUT_TAG= CLAUDE_CONFIG_DIR="$tmp" PATH="$tmp/bin:$PATH" "$here/bin/loadout" "$@" 2>&1; }
bad=0
is() { # is <expected exit> <expected output substring> <args...>
  local code=$1 want=$2 out; shift 2
  out=$(run "$@"); local got=$?
  if [ "$got" -ne "$code" ] || ! printf '%s' "$out" | grep -qF -- "$want"; then
    echo "FAIL: loadout $*: exit $got, said: $out"; bad=1
  fi
}
is 0 '{"theme":"custom:kirby"}' kirby
is 0 '{"theme":"custom:cyberpunk-edgerunners"}' "Cyberpunk Edgerunners"
is 0 '{"theme":"custom:cyberpunk-edgerunners"}' cyberpunk-edgerunners
is 0 '{"theme":"custom:ghostrunner"}' Ghostrunner
# A unique prefix or word: "cyberpunk" is now the start of one theme alone.
is 0 '{"theme":"custom:cyberpunk-edgerunners"}' edgerunners
is 0 '{"theme":"custom:cyberpunk-edgerunners"}' edge --resume abc
is 0 '--resume' edge --resume abc
is 0 '{"theme":"custom:cyberpunk-edgerunners"}' cyberpunk
is 0 '{"theme":"custom:cyberpunk-edgerunners"}' cyber
is 0 '{"theme":"custom:ghostrunner"}' ghost
# The names from before the rename, as old restart lines spell them.
is 0 '{"theme":"custom:cyberpunk-edgerunners"}' cyberpunk-soft --resume abc
is 0 '{"theme":"custom:cyberpunk-edgerunners"}' "Cyberpunk Soft"
is 0 '{"theme":"custom:cyberpunk-edgerunners"}' soft
is 0 '{"theme":"custom:cyberpunk-edgerunners"}' custom:cyberpunk-soft
is 0 '{"theme":"custom:ghostrunner"}' cyberpunk-classic
is 0 '{"theme":"custom:ghostrunner"}' classic
is 0 '{"theme":"dark"}' dark
is 0 '{"theme":"custom:kirby-pink"}' pink
is 2 'say which' ki
is 2 'no theme "nope"' nope
is 2 'not a theme name' '../../etc'
# A file whose name the settings cannot spell is no theme: never injected, never an empty theme.
is 2 'no theme "zed"' zed
is 2 'no theme "my"' my
is 2 'no theme "theme"' theme
is 2 'no theme "upper"' upper
is 0 'custom:   cyberpunk-edgerunners ghostrunner kirby kirby-pink' --list
if run --list | grep -q 'evil\|my theme'; then echo "FAIL: the list names an unusable file"; bad=1; fi
is 0 '{"theme":"custom:kirby"}' kirby
[ "$(LOADOUT_TAG= CLAUDE_CONFIG_DIR="$tmp" PATH="$tmp/bin:$PATH" "$here/bin/claude-theme" kirby | head -2 | tail -1)" = '{"theme":"custom:kirby"}' ] || { echo "FAIL: claude-theme"; bad=1; }
# With no tty and no theme named it starts claude as it is: its arguments alone, nothing pinned, no file written.
[ "$(run --resume abc | tr '\n' ' ')" = '--resume abc ' ] || { echo "FAIL: no tty, no theme: $(run --resume abc)"; bad=1; }
[ -z "$(run)" ] || { echo "FAIL: no tty, no arguments"; bad=1; }
if ls "$tmp/themes" | grep -q '^loadout\|tmp$'; then echo "FAIL: a file written with no tty"; bad=1; fi
# An old name is an alias only: a theme file of that very name wins, and with the renamed theme gone it is no theme.
touch "$tmp/themes/soft.json"
is 0 '{"theme":"custom:soft"}' soft
rm "$tmp/themes/soft.json" "$tmp/themes/ghostrunner.json"
is 2 'no theme "classic"' classic

# --- live files: a terminal's own theme file, named after its tty ---------------------------------
touch "$tmp/themes/ghostrunner.json"
mkdir -p "$tmp/dev/pts"; touch "$tmp/dev/pts/7" "$tmp/dev/pts/8" "$tmp/dev/tty2"
printf '{\n  "name": "Kirby",\n  "base": "dark",\n  "overrides": { "claude": "#9be564", "text": "#f2f5e6" },\n  "note": "left behind"\n}\n' > "$tmp/themes/kirby.json"
printf '{ "name": "Ghostrunner", "base": "dark-ansi", "overrides": { "claude": "#ff003c" } }\n' > "$tmp/themes/ghostrunner.json"
printf '{ "theme": "custom:kirby" }\n' > "$tmp/settings.json"
live() { LOADOUT_TAG=${TAG-pts7} LOADOUT_DEV="$tmp/dev" CLAUDE_CONFIG_DIR="$tmp" PATH="$tmp/bin:$PATH" "$here/bin/loadout" "$@" 2>&1; }
same() { # same <what> <got> <expected>
  if [ "$2" != "$3" ]; then echo "FAIL: $1: got: $2"; bad=1; fi
}
flat() { python3 -I -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1])), sort_keys=True))' "$1" 2>&1; }
KIRBY='{"base": "dark", "name": "Loadout: kirby", "overrides": {"claude": "#9be564", "text": "#f2f5e6"}}'
GHOST='{"base": "dark-ansi", "name": "Loadout: ghostrunner", "overrides": {"claude": "#ff003c"}}'

# A theme named: this terminal's file is made from it (name, base and overrides, nothing else), and claude starts pinned to that file.
same 'a theme starts on the terminal file' "$(live kirby --resume abc | tr '\n' ' ')" '--settings {"theme":"custom:loadout-pts7"} --resume abc '
same 'the live file of a custom theme' "$(flat "$tmp/themes/loadout-pts7.json")" "$KIRBY"
# Named again: rewritten from the new source. A forgiving name, an old one.
live classic > /dev/null
same 'rewritten from another theme' "$(flat "$tmp/themes/loadout-pts7.json")" "$GHOST"
# A built-in theme: its own base, nothing overridden.
same 'a built-in starts on the terminal file' "$(live dark | tr '\n' ' ')" '--settings {"theme":"custom:loadout-pts7"} '
same 'the live file of a built-in theme' "$(flat "$tmp/themes/loadout-pts7.json")" '{"base": "dark", "name": "Loadout: dark", "overrides": {}}'
same 'the ansi one' "$(live 'Light Ansi' > /dev/null; flat "$tmp/themes/loadout-pts7.json")" '{"base": "light-ansi", "name": "Loadout: light-ansi", "overrides": {}}'
# The same theme again writes nothing: the file is the very one (its inode), and no temporary file is left.
live kirby > /dev/null; before=$(ls -i "$tmp/themes/loadout-pts7.json")
live kirby > /dev/null
same 'unchanged, not rewritten' "$(ls -i "$tmp/themes/loadout-pts7.json")" "$before"
live ghost > /dev/null
[ "$(ls -i "$tmp/themes/loadout-pts7.json")" != "$before" ] || { echo "FAIL: a change is not a rename over the file"; bad=1; }
if ls -a "$tmp/themes" | grep -q 'tmp$'; then echo "FAIL: a temporary file is left"; bad=1; fi
# No theme named (claude's own arguments, or none): this terminal's file as it is.
same 'claude arguments alone keep the file' "$(live --resume abc | tr '\n' ' ')" '--settings {"theme":"custom:loadout-pts7"} --resume abc '
same 'no argument keeps the file' "$(live | tr '\n' ' ')" '--settings {"theme":"custom:loadout-pts7"} '
same 'kept as it was' "$(flat "$tmp/themes/loadout-pts7.json")" "$GHOST"
# A terminal without a file yet takes the global look: the global theme's...
same 'a new terminal' "$(TAG=pts8 live --continue | tr '\n' ' ')" '--settings {"theme":"custom:loadout-pts8"} --continue '
same 'made from the global theme' "$(flat "$tmp/themes/loadout-pts8.json")" "$KIRBY"
# ...the shared live file's where the global theme is the live one, as it is...
live ghost > /dev/null; cp "$tmp/themes/loadout-pts7.json" "$tmp/themes/loadout.json"; rm "$tmp/themes/loadout-pts8.json"
printf '{ "theme": "custom:loadout" }\n' > "$tmp/settings.json"
TAG=pts8 live > /dev/null
same 'made from the shared live file' "$(flat "$tmp/themes/loadout-pts8.json")" "$GHOST"
# ...a built-in one's; and with `auto`, no theme or no settings file it starts as claude would, with no file.
rm "$tmp/themes/loadout-pts8.json"; printf '{ "theme": "light" }\n' > "$tmp/settings.json"
TAG=pts8 live > /dev/null
same 'made from a built-in global theme' "$(flat "$tmp/themes/loadout-pts8.json")" '{"base": "light", "name": "Loadout: light", "overrides": {}}'
for text in '{ "theme": "auto" }' '{}' '{ broken' '{ "theme": "custom:../../x" }' '{ "theme": ". " }' '{ "theme": "custom:nope" }' '{ "theme": 3 }'; do
  rm -f "$tmp/themes/loadout-pts8.json"; printf '%s\n' "$text" > "$tmp/settings.json"
  same "nothing to copy ($text)" "$(TAG=pts8 live --continue | tr '\n' ' ')" '--continue '
  [ ! -e "$tmp/themes/loadout-pts8.json" ] || { echo "FAIL: a file made from $text"; bad=1; }
done
rm -f "$tmp/settings.json"
same 'no settings file' "$(TAG=pts8 live --continue | tr '\n' ' ')" '--continue '
# `auto` is no file: pinned as before, and this terminal's file is left as it is.
same 'auto is pinned' "$(live auto | tr '\n' ' ')" '--settings {"theme":"auto"} '
same 'auto leaves the file' "$(flat "$tmp/themes/loadout-pts7.json")" "$GHOST"
# The tag is the tty's name in lower case letters, digits and dashes; anything else is no tty, and reaches no path and no JSON.
same 'a tty of another kind' "$(TAG=tty2 live kirby | tr '\n' ' ')" '--settings {"theme":"custom:loadout-tty2"} '
for odd in '../x' 'pts/7' 'a b' 'x","model":"evil' 'PTS7' '?'; do
  same "an unusable tag ($odd)" "$(TAG=$odd live kirby | tr '\n' ' ')" '--settings {"theme":"custom:kirby"} '
done
same 'no stray file' "$(ls "$tmp/themes" | grep -c '^loadout')" 3
[ ! -e "$tmp/x.json" ] || { echo "FAIL: a file outside the themes folder"; bad=1; }
# A live file is no theme to start on, to match or to list.
TAG=pts7 live kirby > /dev/null
for name in loadout loadout-pts7 custom:loadout load; do
  out=$(live "$name"); got=$?
  if [ "$got" -ne 2 ] || ! printf '%s' "$out" | grep -qF 'no theme'; then echo "FAIL: loadout $name: exit $got, said: $out"; bad=1; fi
done
if live --list | grep -q 'loadout'; then echo "FAIL: the list names a live file"; bad=1; fi
# A theme file that is no theme object is not started on, and the terminal's file stays.
printf '[1]\n' > "$tmp/themes/kirby-pink.json"
out=$(live pink); got=$?
if [ "$got" -ne 2 ] || ! printf '%s' "$out" | grep -qF 'could not be read as a theme'; then echo "FAIL: a broken theme: exit $got, said: $out"; bad=1; fi
same 'a broken theme leaves the file' "$(flat "$tmp/themes/loadout-pts7.json")" "$KIRBY"
# Housekeeping: the files of terminals that are gone are removed at a start; the shared one, a live terminal's and a file not named after a tty stay.
touch "$tmp/themes/loadout-pts99.json" "$tmp/themes/loadout-tty9.json" "$tmp/themes/loadout-mine.json" "$tmp/themes/loadout-pts9x.json"
live > /dev/null
same 'stale files swept' "$(ls "$tmp/themes" | grep '^loadout' | tr '\n' ' ')" 'loadout-mine.json loadout-pts7.json loadout-pts9x.json loadout-tty2.json loadout.json '
# --list and --help start nothing and sweep nothing.
touch "$tmp/themes/loadout-pts99.json"
live --list > /dev/null; case "$(live --help)" in *'loadout --list'*) ;; *) echo "FAIL: --help"; bad=1 ;; esac
[ -e "$tmp/themes/loadout-pts99.json" ] || { echo "FAIL: --list swept"; bad=1; }

[ "$bad" -eq 0 ] && echo "launcher: all passed"
exit "$bad"
