# Loadout

Loadout dresses Claude Code in one theme and shows, beside the conversation, what the session and its agents are doing. This glossary fixes the words used for what is shown.

## Language

### Where things are shown

**Pane**:
A view of Loadout in the dock beside the conversation. One pane is shown at a time; the others are its tabs.
_Avoid_: Panel, page, window, mode

**Avatar pane**:
The pane of the theme's mascot: the mascot and what it says, the agent count and the meters.
_Avoid_: HUD, Kirby pane

**Before /clear line**:
The one-line notice before a `/clear`, in the Avatar pane or, while that pane is not shown, in the band: it offers a handoff and a lesson.
_Avoid_: Card, toast, popup

**Flow map**:
The pane of the work in progress: the step plan, then the bubble map.
_Avoid_: Vision page, agents pane

**Tickets pane**:
The pane of the wayfinder map, alone and at full height.
_Avoid_: Wayfinder pane, map pane

**Band**:
The rows above the prompt, the only place that stays visible beside whichever pane is shown.

### The work in progress

**Step plan**:
The ordered list of steps Claude posts for a task of three steps or more.
_Avoid_: Step map, todo list

**Step label**:
The few words that name one step: five at most.

**Agent**:
A loop of the model at work in the session: the main session, a subagent it launched, or an agent of a run.
_Avoid_: Helper, worker

**Run**:
One execution of a workflow, holding its own agents.

**Bubble map**:
The drawing of the session and its agents as they stand now: the main session on top, one bubble per agent under it, an arrow per launch and per reply.
_Avoid_: Diagram, schema, graph

**Bubble**:
One agent's complete node in the bubble map: its name and model, the call in progress, the calls before it, the time elapsed, the calls and tokens counted, and its cache share.
_Avoid_: Agent card, box, node

**Chip**:
A finished agent's one-line mark in the bubble map: its name, how it ended and how long it took.
_Avoid_: Pill, tag

**Run zone**:
The dashed frame of the bubble map that holds one run's bubbles and chips, and names the phase the run is in.

**Launch**:
The arrow from an agent to the agent it started, drawn solid and numbered.

**Reply**:
The arrow from an agent back to the one that launched it, drawn dashed and numbered.

**Legend**:
The rows of the bubble map that say what each colour and each line style means.

### The prompt cache

**Cache share**:
Of the input an agent last sent, the part read from the prompt cache and the part written to it again.
_Avoid_: Cache hit rate, cache ratio

**Cache expiry**:
The time left before an agent's cached prompt is dropped, counted down from its last request.

### The wayfinder map

**Wayfinder map**:
The tickets of one effort and how they stand, as the wayfinder skill keeps them.

**Ticket**:
One unit of work on the wayfinder map, known by its number: in progress, next, blocked or resolved.
_Avoid_: Issue, task, card

**Blocker**:
A ticket another ticket waits for, cited by its number.

### The theme

**Theme**:
The whole kit one name picks: the colours, the terminal ground, the mascot, the look of each pane.

**Model colour**:
The colour pair, a pastel fill and a dark outline, that stands for one model everywhere in Loadout.
