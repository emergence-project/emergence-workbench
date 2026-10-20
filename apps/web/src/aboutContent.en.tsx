import type { ReactNode } from 'react'
import type { AboutPart, ColorRow, SymbolRow } from './aboutContent'
import { DocKindsTable, DocMapFigure, FeedbackFlowFigure, FeedbackTagsTable, HomeMarksTable, NoteSyntaxTable, NoteToolbarFigure, StatesTable, TaskFlowFigure, TurnFigure } from './aboutFigures'

/**
 * English version of the About pages (aboutContent.tsx holds the Korean and picks one by `lang`).
 * Same shape as the Korean: same part ids, same section order, same item count per section,
 * same unsure/ask flags. When the Korean text changes, change this file too.
 */

const c = (s: string) => <code>{s}</code>

export const ABOUT_PARTS_EN: AboutPart[] = [
  { id: 'intro', title: 'At a glance', sub: 'What this app is, how the screen is divided, and how to read this About page.' },
  {
    id: 'principles', title: 'Definitions and principles',
    sub: 'What the words in this app mean, and the principles followed when building and fixing it.',
    sections: [
      {
        title: 'Definitions',
        figure: <><DocMapFigure /><DocKindsTable /></>,
        items: [
          { text: <><b>Project</b>: one piece of research, paired with its repository. Its kind is either Research or Work.</> },
          { text: <><b>Topic</b>: a subtopic inside a project. It only groups notes and has no body of its own, and topics are not nested. A note can belong to several topics, and its membership is written in the note's front matter, not by folder. Notes without a topic gather under "Loose notes".</> },
          { text: <><b>Note</b>: the smallest self-contained document inside a topic. What used to be research notes, calculation notes and single-claim notes ({c('workbench/blocks/')}) are all called notes now, and their files stay where they were. Manuscripts, concept notes and literature notes are separate.</> },
          { text: <><b>Statement</b>: a numbered definition or theorem card. A note carries its proof.</> },
          { text: <><b>Reference materials</b>: PDFs and files you actually have. Paper details a note cites (bib) and PDFs in the paper library are seen separately.</> },
          { text: <><b>Work</b>: decisions and delegated tasks for work handed to agents, plus the work journal that collects what was done.</> },
          { text: <><b>Records</b>: the project's memos, to-dos, questions and instructions grouped by what they are about (this project, notes, topics, flow dots). "See all ›" in the right sidebar's records comes here.</> },
          { text: <><b>Delegated task</b>: one calculation, derivation or comparison handed to an agent. You write completion criteria when delegating, and you decide on the result.</> },
          { text: <><b>Workbench data</b>: what the app keeps in a research repository's {c('workbench/')} (project info and topics, notes, delegated tasks, journal, records, figures).</> },
        ],
      },
      {
        title: 'Status and turns',
        figure: <><StatesTable /><TurnFigure /></>,
        items: [
          { text: <>Status is shown as a colored dot and a short name, not a text symbol. Notes, delegated tasks and projects use the same colors: blue In progress, orange Blocked, gray ring Dropped, teal Solved (Done for projects).</> },
          { text: <>Orange also means "your turn". Anything you need to look at, such as Awaiting decision or Needs review, looks the same everywhere: an orange pill with a count or a single orange dot. Things waiting on an agent are neutral gray.</> },
        ],
      },
      {
        title: 'Working principles',
        items: [
          { text: <><b>The repository is in charge.</b> The app does not reshape a research repository to suit itself, and everything the app keeps goes only in {c('workbench/')}.</> },
          { text: <><b>The source of truth is on GitHub.</b> The folder on the Mac is a copy, and {c('workbench/')} content that exists only on the Mac is pushed to a private backup repository every hour.</> },
          { text: <><b>Manuscripts are never lost.</b> If the same file changes somewhere else, the app stops instead of overwriting.</> },
          { text: <><b>Fixes ship right away.</b> An agent makes the fix and merges it once checks (CI) pass; the Mac app pulls and builds new versions every 10 minutes and restarts on its own after 5 minutes without input. To use it right away, press "New version · Restart" in the top bar.</> },
          { text: <><b>A person closes delegated tasks.</b> The agent sets completion criteria first and fills in the result as a report; only you approve.</> },
          { text: <><b>What you leave turns into records.</b> Feedback, comments and questions are saved as files, and how each was handled is written in one place, {c('feedback/status.yaml')}. Approved feedback moves into this About page as a description, and the original is deleted.</> },
          { text: <><b>Ask when unsure, otherwise just do it.</b> Only things that cannot be undone or that change the goal are asked about; otherwise the agent goes ahead with a sensible default and says what it chose. Anything you would answer with "next step" gets built right away.</> },
          { text: <><b>A person does the physics and math review.</b> Automatic checks and matching numbers do not replace your review.</> },
        ],
      },
      {
        title: 'Design principles',
        items: [
          { text: <><b>Neutral by default, color only for status.</b> Status shows as a colored dot and a short name: blue In progress · orange Blocked · gray ring Dropped · teal Solved. Your turn is orange, the agent's turn is gray. The accent color is used only for the primary button and for selection.</> },
          { text: <><b>One name and one symbol per action.</b> Add ＋, Edit pencil, Delete trash can, Remove/Close ×, Compile ▶, Export ⤓, Comment speech bubble, and Approve / Revise as a check in a circle / a return arrow. <a className="a" href="#/about/design">Screen standards ›</a></> },
          { text: <><b>One place for each job.</b> To-dos are edited in the Work screen, author details on the person's page. The pencil on the project home screen and on the project info screen opens the same edit dialog.</> },
          { text: <><b>Buttons sit next to what they act on.</b> An item's Edit and Delete sit at its top right, and a button that opens or closes a side area sits on that area's side.</> },
          { text: <><b>Clean and clear at a glance.</b> The same name is not shown large twice on one screen, and cards carry only a title and a one-line description.</> },
          { text: <><b>Plain words.</b> No newly coined terms; buttons say what they do with a verb.</> },
          { text: <><b>"What am I asking" over "where is it".</b> Screens are divided by the question you are asking, not by where files live.</> },
        ],
      },
    ],
  },
  {
    id: 'home', title: 'Home',
    sub: 'The screen that shows all projects at a glance. The project list (or cards) is on top, and a calendar of this week\'s work is below.',
    open: [{ label: 'Open Home', to: { page: 'home' } }],
    sections: [
      {
        title: 'Project list and cards',
        items: [
          { text: <>At the top right you choose between the <b>List</b> view (default) and the <b>Cards</b> view. Your choice is remembered. Clicking anywhere on a project opens its home screen.</> },
          { text: <>Each project has a <b>kind</b> (Research or Work), <b>fields</b> (several tags chosen from the concept note subjects), and a <b>progress status</b> (In progress · Blocked · Done). The left filter is kind (All · Research · Work) and the right filter is progress status. Fields are only shown. All three are chosen in the edit dialog opened by the pencil on the project home screen or the info screen, and are kept only in this computer's settings (an old "업무" (work) tag is read as kind Work, and other tags are read as fields).</> },
          { text: <>Status symbols (see the table under "Work calendar" below): an orange dot means <b>Needs review</b> (notes to review and delegated tasks to decide, the same count as on the rail), a circular arrow means <b>Update available</b> (new commits to pull from GitHub), and when both apply an orange dot sits at the arrow's top right. The symbol legend is also at the bottom right of the list. Every 10 minutes the app checks GitHub and pulls on its own when it can (fast-forward only). If the arrow stays, click it to pull now, or see the reason in its tooltip.</> },
          { text: <>A card has the project's color area on the left with the project image in the middle (the "Card image" in the project edit dialog; color only if none), and on the right the name, a one-line description, [kind] and fields on one line, and the last activity time with status symbols.</> },
          { text: <>Drag a card's color area (in the list, the initials square) to reorder. The list, cards and rail all share the same order.</> },
          { text: <>The "＋ Register project" at the end of the cards (or ＋ on the rail) offers two ways. "From GitHub" lets you search and pick from your GitHub repositories; the app clones it to this computer and registers it (ones already registered show "Registered"). "Folder on this computer" takes a folder path. Or press "Choose in Finder" to pick it in the Mac folder dialog (it is checked right away); the clone folder has the same button. The register card shows only in the "In progress" list (new projects are registered as in progress).</> },
          { text: <>The GitHub list is read with the GitHub login already on the Mac (the keychain used by gh or git), and the app stores no login details of its own. If the list does not show, run <code>gh auth login</code> in a Mac terminal, or paste the GitHub address. The Google account is used only for Calendar and Drive, not for repositories.</> },
        ],
      },
      {
        title: 'Work calendar',
        figure: <HomeMarksTable />,
        items: [
          { text: <>Shows one week (Sun to Sat); move between weeks with ‹ · This week · ›. Past days show finished to-dos, note edits, status changes and memos; future days show only deadlines ⚑. The calendar in the Work tab uses the same symbols.</> },
          { text: <>"Copy briefing" copies this week's work as text, grouped by project.</> },
          { text: <>If you connect Google in Settings › Accounts, Google Calendar events also appear, in neutral gray (read only).</> },
        ],
      },
      {
        title: 'Screens outside projects',
        items: [
          { text: <>Home, Knowledge, Papers, Figures, Networking, Feedback, About and Settings are screens outside projects. Your current location shows at the very top. Knowledge, Papers, Figures and Networking put their own lists, and About and Settings their list of parts, in the app's left sidebar.</> },
        ],
      },
    ],
    left: ['Writing to-do deadlines to Google Calendar is a next step.', 'The Google connection starts only after a "Desktop app" client made in Google Cloud is entered in Settings (your turn).'],
  },
  {
    id: 'project', title: 'Project screen',
    sub: 'The screen you see when you open one project. In one place you see what the research is about, how far it has come, and what comes next.',
    sections: [
      {
        title: 'Screen layout',
        items: [
          { text: <>Below Home on the rail, each project has an initials button that takes you straight there.</> },
          { text: <>An orange count on a rail button means there is something to review: on a project button, the sum of notes needing review, delegated tasks to decide, agent edits to review and your-turn records (an agent asked and waits for your answer); on Networking, suggested people you have not seen yet (gone once you open Networking); on Settings, a new version (a single orange dot instead of a count); on Feedback, Needs review (an orange dot instead of a count when nothing needs review but some feedback is not yet registered on GitHub); on About, places to review. Hover to see what is counted.</> },
          { text: <>The <b>left sidebar</b> is where you go inside a project: Project info · Work · Records (the orange count is agent questions waiting for your answer) · Edit review (the orange count is notes to review) · Flow · <b>Topics</b> (a topic › note tree) · "Loose notes" (notes without a topic) · Materials (manuscripts · reference materials). The tree expands only the topic of the note you have open, and each note has a status dot. Click a topic name to go to that topic's screen. Concept notes, literature notes and the map are under "Knowledge" on the rail.</> },
          { text: <>The top of the left sidebar always has the tabs <b>Project | Contents</b> (Knowledge | Contents in Knowledge). Open a note or a delegated task's report and click "Contents" to see its section outline using the full sidebar height. A vertical bar marks the section you are reading and follows as you scroll; click to jump to a section. On screens without an outline (one section or none), "Contents" is faded. The chosen tab stays when you open another note, and while you view the outline, your-turn counts hidden in the list show as an orange pill next to "Project". The right sidebar's Info | Records tabs have the same place and shape.</> },
          { text: <>In the middle are the <b>main pane</b> (the chosen screen) and the <b>side pane</b> (a PDF or paper to view alongside), and at the far right is the <b>right sidebar</b> (info and records for the note you have open). Each pane always has a tab bar on top. Opening something from the sidebar or a link replaces the current tab with it (like a browser); ⌘/Ctrl+click opens it in a new tab. Drag a tab to move it to the other pane. Drag an empty spot of the tab bar onto the other pane to swap the two panes. The layout is remembered per project. A note always opens in the left pane and its PDF in the right pane (a note that was on the right moves to the left). When the current tab switches to another note, the replaced note's PDF tab closes; switching between chapters of a manuscript keeps the manuscript PDF.</> },
          { text: <><b>Top bar</b>: at the far left, toggle left sidebar (⌘\) · Back · Forward; in the middle, the location "Project › Topic" (for a note, its main topic; click a name to go there); on the right, Search · Two panes · Feedback ("New version" before them when there is one); at the far right, toggle right sidebar (⌥⌘\). They are icons only; hover to see the name and shortcut. Turned-on buttons have a gray background. Theme is in Settings › Display, and a quick memo is the M key or "Records" in the right sidebar.</> },
          { text: <><b>Search</b> opens from any screen with the magnifier at the right of the top bar, or the "/" key when you are not typing. It searches, in one dialog, the names of cards, manuscripts, chapters, notes and statements across all registered projects, concept notes (name, other names and body), literature notes, people in Networking, and app screens; pick with ↑↓ and open with Enter (Esc closes). ⌘K is the command menu in the concept note editor, so it is not used for search. Memo and journal text, manuscript and note bodies, the paper and figure libraries, and delegated tasks are not searched yet.</> },
        ],
      },
      {
        title: 'Home screen (overview)',
        items: [
          { text: <>The default screen shown when no tab is open. It is not a separate tab.</> },
          { text: <>At the top, the left has the title, description, kind and fields, and the right has <b>Work</b>. Below them, <b>Topics</b> and <b>Notes</b> cards sit four to a row (they shrink a little when sidebars are open). On a narrow screen everything goes into one column, with Work below the title and description and above Topics. Manuscripts open from "Manuscripts" in the left sidebar.</> },
          { text: <>The work panel takes the height of the header beside it, so the card row starts at the same place however many to-dos there are. Pick one of <b>All</b> · Review · Edits · Blocked · To-do in the one-line control at the top to see only that list. The names match the row tags, and only your-turn choices (Review, Edits) carry a count, as an orange pill (other counts show on hover). It starts on All: your turn first, in group order, with the group as a tag at the right of each row. The column before the rows appears only when a blocked note's status dot or a to-do's done box is shown. Rows that do not fit are counted right under the last row, in the tag column, as in "+3", which opens that group's screen (the Work tab for All). "See all ›" at the top right opens the Work tab.</> },
          { text: <>The pencil at the right of the toolbar opens the <b>Edit project</b> dialog. On the left you edit the name (80 characters), description (300 characters), kind (Research · Work), fields, progress status and start date; right under the card preview on the right you pick the card image and color (Save ⌘↵, Cancel Esc). The color is used for the rail button and the Home card; "Auto" picks a color no other project uses. The chosen color is saved in this computer's settings. Only notes in Work projects can choose the note kind "Design".</> },
          { text: <><b>Topics</b>: topic cards (preview, description, kinds of its notes, note count by status, last activity) sit in one row, sorted by recent work, status or name. Click a card to open the topic screen, and star it with ☆. The dashed card "＋ New topic" at the start of the row takes just a name, creates the topic and opens the Edit topic dialog. If there are notes without a topic, "Loose notes n" next to the heading opens that group.</> },
          { text: <><b>Notes</b>: recently touched notes are shown as note cards. Next to the heading you choose a period (Today · This week (from Monday) · All, each with a count), and on the right a sort (Newest · Name). At first only one row shows; "Show n more notes ▾" expands it. A note made with the dashed card "＋ New note" at the start of the row goes into "Loose notes" without a topic. Deleted notes (kept for 15 days) can be restored by expanding the "Deleted notes" row at the bottom.</> },
          { text: <>Clicking the done box at the start of a to-do row marks it done right away (no confirmation; reopen it under Done in the Records tab). Clicking the rest of the row shows that item in the Records tab's to-dos. Blocked note rows have a Reopen. Writing to-dos is done in the Records tab.</> },
        ],
      },
      {
        title: 'Project info',
        items: [
          { text: <>"Project info" at the top of the sidebar has four pages. Clicking the name opens <b>Overview</b>; <b>Status</b> · <b>Rules</b> · <b>Repository</b> are always listed under it.</> },
          { text: <><b>Overview</b> is what this project is and what it holds: progress status · start date · kind · fields · card image, and counts of topics · manuscripts · notes · statements. The one pencil next to the title opens the same edit dialog as on the home screen. Name, description, start date and card image are written to {c('workbench/research.yaml')}; kind, fields and progress status to this computer's settings.</> },
          { text: <><b>Status</b> splits into sections the same content agents read in {c('STATUS.md')} and over MCP: your turn (delegated work waiting for your decision), delegated work counts, note counts by status for each topic, and the last 7 days of journal. Click a row to go to that task or topic. Open "Show the text agents read" at the bottom to see the {c('STATUS.md')} text. Its rules sections (common rules, folder and editing rules, project rules) are left out here and shown on the <b>Rules</b> page. When the flow has dots, the text also carries "Flow summary" (the five newest dots, open dots, dots awaiting human approval) and "Flow map" (one line per dot), so agents also know the open questions and dropped branches.</> },
          { text: <><b>Rules</b> is what agents read first in this repository: the repository's {c('AGENTS.md')} · {c('CLAUDE.md')}, the rule sections of {c('STATUS.md')} (including the common rules), and <b>Decisions</b> below ({c('workbench/decisions/')}, newest first, reversed decisions faded). Read only; to change them, edit the files in the repository. The common rules are edited in Settings › Common rules.</> },
          { text: <><b>Repository</b> shows the folder, git branch, GitHub address, last commit (short hash, title, when), counts of uncommitted changes and new files, and whether it matches GitHub. "Check" asks GitHub right then whether there are new commits (git fetch), without pulling or pushing. If GitHub has new commits, "Update" next to it (same as the circular arrow on Home) pulls them. The app also pulls on its own every 10 minutes under the same conditions. It only fast-forwards, so if this computer has commits of its own, or uncommitted changes touch the same files as the new commits, it does not pull and points you to git pull in a terminal. If there is no internet or no remote, it says so. Below it are the material locations ({c('sources:')} in {c('research.yaml')}).</> },
        ],
      },
      {
        title: 'Work and records (decisions · delegated tasks · to-dos · memos · questions · instructions)',
        figure: <TaskFlowFigure />,
        items: [
          { text: <>The filter at the left of the Work tab's toolbar is <b>To decide</b> (the default when opened, with an orange count) · <b>Delegated tasks</b>, and on the right is "＋ Delegate". To-dos, memos, questions and instructions are in the separate <b>Records</b> tab (10/15). At the bottom the <b>work journal</b> (finished to-dos, status changes) builds up by date.</> },
          { text: <><b>To decide</b>: on top, a one-line briefing (n awaiting decision · in progress · due this week · last result) and a week calendar (click a date to see that day in detail); below, decision cards. A card shows the conclusion, what was done, requests for your review, open problems and "Open report", and at the bottom right Approve · Revise · ⋯ (leave as blocked · drop).</> },
          { text: <>In the <b>Delegate</b> dialog you write the title, topic, agent (Claude Code · Codex), task description, completion criteria (the agent proposes first / write them yourself), reference materials, and what not to do. Each task is one file, {c('workbench/tasks/<date>-<name>.md')}, and that file is the report. The work runs outside the app (Claude Code or Codex on the Mac); hand it over with "Copy prompt for agent".</> },
          { text: <>The <b>Delegated tasks</b> list is grouped by status; click a row to open its report in a tab. A report has conclusion, review requests, open problems, next instructions and grounds, and its section outline attaches to the left sidebar. Approving the next instructions turns them into a new task as is.</> },
          { text: <>In the Records tab you pick <b>To-dos, memos, questions or instructions</b> and write in the input below. The list is grouped by what each record is about (this project, a note, a topic, a flow dot). Starting the text with a date such as "10/20까지 —" (by 10/20) sets a deadline. To-dos, memos, questions and instructions all go in the records ({c('workbench/comments/')}), and Claude on this Mac answers questions. To-dos have one source, the records, so the Records tab, the work panel on the project home, the sidebar count, calendar deadlines and the STATUS that agents read all show the same list (10/16). Each to-do is grouped with where it belongs (a note, a topic, a flow dot), and checking it off logs it as done in the work journal. To-dos from the quick memo (M key) go to the records too.</> },
          { text: <>Project records ({c('workbench/comments/')}) are pushed to GitHub by this Mac about 30 seconds after you write them (only that folder is committed and pushed). So agents in the cloud can read and answer them too, and their answers come back with automatic pulls. If a push fails, a small notice appears at the bottom of the screen, and the Records tab (opened from "Records" in the left sidebar) shows the reason and "Push again" at the top (it stays after restarting the app). The app also tries again every 10 minutes without a new write. Work-log files changed on GitHub too are merged entry by entry.</> },
          { text: <>Kinds differ by who acts: nobody acts on a <b>memo</b>, you do a <b>to-do</b>, an agent answers a <b>question</b>, and an agent does an <b>instruction</b> and then answers (a request closed by one answer, such as fixing, checking, finding or drawing). Settings › Agents chooses who carries out instructions and when: <b>When asked</b> (the default: the next agent session picks them up with the MCP tool {c('list_records')}, does them and answers with {c('answer_record')}), <b>Right away</b> (Claude on this Mac does it when you leave or follow up on an instruction) or <b>Once a day</b> (at the chosen time, for every project). Claude on the Mac runs one at a time and does not edit files; note changes come in the answer for you to apply with "Apply to note". Bigger work with an end condition and a report goes to delegated tasks.</> },
          { text: <>A record row has <b>kind · who wrote it</b> on top ("Question · claude-code", "User" for you; Claude's get a grey Claude mark before the name, as does the "Answer · claude" line in the right sidebar) with actions at the right end, the text in the middle, and below, where it is attached on the left (click to go there) and when on the right (the time for today, the date before; hover for both). Records in the right sidebar have a kind picker on top (All · Memo · To-do · Question · Instruction) and <b>In progress | Done</b> below it; only records in progress show at first, your turn on top, then the newest. An open record with selected text keeps that text painted in the note like a highlighter (the paint goes when it is done), and choosing the record outlines it. In the Records tab, click the name of what a record is about (this project, a note, a topic, a flow dot) to open it, and answers read like a <b>conversation</b> in order (yours on the right, the agent's on the left). Under a question or instruction, "Follow up" lets you ask more or add to it, which makes it the agent's turn again. "Follow up" sits at the bottom of the conversation and its box closes with "Cancel"; while your own question or instruction has no answer yet, edit it with the pencil instead. "Ask the agent" under a to-do lets you ask about it (question) or hand it over (instruction); the conversation stacks under that to-do, and the agent receives the to-do text with it. A repository path in backticks in a record (e.g. <code>docs/reviews/guide.md</code>) becomes a link that opens the file in a read-only workspace tab. A file moved from that path is found through git history and marked "Moved"; a deleted file shows its last version and is marked "Deleted". In a moved file's tab, "Update the path in the record" rewrites the path in the record.</> },
          { text: <>When an agent writing a note wants you to check something, it leaves an <b>agent question</b> (MCP {c('add_record')}). That is your turn: the record row and its place in the note body are orange, and it counts in the orange numbers of the sidebar's Records and the rail. Answer with "Follow up" and it becomes answered.</> },
          { text: <>Memos and to-dos you wrote are edited and deleted with the pencil and trash can that always show at their top right. Completion records can be deleted but not edited, and status records stay as they are. Clicking a note name in the Work screen opens that note.</> },
        ],
      },
      {
        title: 'Edit review', id: 'edits',
        items: [
          { text: <>"Edit review" in the left sidebar. The upper table lists the notes to review, one row each (note · topic · agent · edited · changes); click a row and the lower table shows that note's changed places (paragraphs) with before and after. The icon next to a note name opens the note, and the arrow icon on a change opens the note at that paragraph. Changed words are painted, and you can expand the paragraphs around a change. Edits to concept notes are in the library's edit review.</> },
          { text: <>For each change: <b>Approve</b> (accept; the file stays as is) · <b>Ask</b> (ask why, or ask for another edit; the agent's answer appears in place) · under ⋯, <b>Edit</b> · <b>Revert</b> (this part only, back to the text before). The one-line reason the agent gave is shown with it.</> },
          { text: <>Agents do not write to notes you have confirmed; they leave an "edit request for a confirmed note" instead. If you allow it in that conversation, the agent writes again.</> },
        ],
      },
      {
        title: 'Flow', id: 'flow',
        items: [
          { text: <>"Flow" in the left sidebar. A chart of the project's research as <b>steps of thinking</b> (dots) and the lines between them. One dot is one step of thinking, not one calculation run, and left to right is the order of thinking. Each project has one flow, and each dot is one file, {c('workbench/flow/<id>.yaml')}.</> },
          { text: <>A dot's <b>mark is its kind</b> (statements: question ? · finding · theorem T; actions: numerical calculation π · analytic calculation ∫ · proof ∴ · literature §) and its <b>color is its state</b> (open · in progress · paused · done; when done, a result: solved/succeeded · refuted/failed · dropped). Lines are origin · support · refutes · uses. Like a metro map, lines run only horizontally and at 45° with rounded bends. A line stays straight on its row when no other dot is in the way, and only steps between rows when it would pass through a dot. Between two rows there are two lanes, at one third and two thirds of the gap; overlapping lines take different lanes (lines from the same dot share one). Papers attached as evidence show as a small § after the dot's name (§3 when there are several); the list is in the details' evidence table. A theorem is not chosen directly: a finding whose evidence has a human-approved proof shows as a theorem. A start dot (no earlier dot) gets a ▶ on the chart's left wall, so every start begins from one vertical line.</> },
          { text: <>The left of the toolbar has the dot count and the <b>topic filter</b> (the chosen topic's dots in bold, the rest still shown), the middle width and height, <b>Names</b> (show or hide dot names; the selected dot and its lineage still show) and "Fit", and the right "＋ Dot". Drag the bar under the chart to change its height; double-click it to reset. Dragging a dot never adds rows: add one with <b>＋ Row</b> at the top or bottom edge of the chart, and remove an empty top or bottom row with the × at its left. There are never fewer rows than the project's topics, and rows with dots and the center line stay.</> },
          { text: <>Hover a dot to see its kind and name (for example "Finding · name"). Click a dot to open its details below (kind · state · description · evidence table · records · links before and after); the selected dot gets a tight accent-color outline (dashed for the dots a new dot will follow). Double-click to center it; drag it to another cell (positions are in {c('flow/layout.yaml')}). The pencil and trash can at the top right of the details edit in place or delete. A deleted dot's file and its records move to {c('workbench/flow/.trash/')}. A new dot comes three ways: ＋ in the details <b>follows this dot</b>; "Choose several earlier dots…" under the ▾ next to it lets you click several earlier dots on the chart, then Done; and <b>＋ Start</b> in the toolbar starts fresh with no earlier dot, placed in the leftmost column on a new bottom row. No dialog opens: a dashed dot appears on the chart and you fill in the same fields as editing right below, then press Create (choose the line type under "Earlier dots"). The edit form keeps the fields where the details show them, all as underline fields; save and cancel are only in the head row. Descriptions take math and figures like notes, and a preview appears under a field that has math or a figure. "Figure ▾" at the top right of each description field picks a figure from the computer or the figure library; you can also paste (⌘V) or drop one into the field. New figures are saved to {c('workbench/figures/')} and show in the figure library.</> },
          { text: <>The evidence table has an AI check and a <b>human approval</b> circle for each note and paper. Only a person approves, and clicking the circle again revokes (records are only appended). A note's right sidebar Info shows the dots that use it as evidence, and the topic screen shows that topic's dot count and "View in flow".</> },
        ],
      },
    ],
  },
  {
    id: 'notes', title: 'Notes',
    sub: <>Open notes from the topic › note tree in the left sidebar. Concept notes, literature notes and the map are under "Knowledge" on the rail.</>,
    sections: [
      {
        title: 'Kinds of writing and how to write them',
        figure: <NoteSyntaxTable />,
        items: [
          { text: <>A <b>manuscript</b> is the LaTeX file named in {c('sources.manuscript')} of {c('research.yaml')}. Manuscripts cover personal research up to a first draft; co-writing and submission happen in Overleaf. A single-file manuscript (for example a paper's PRB.tex) shows one chapter per {c('\\section')}.</> },
          { text: <>A <b>note</b> is one folder ({c('note.md')} + {c('note.yaml')}) under {c('workbench/notes/')} or, for calculations, {c('workbench/calc/')}, or a single-claim {c('workbench/blocks/<id>.md')}. Calculation code (.py, .ipynb) goes in the note folder too. For concept notes and literature notes, see the table in "Definitions and principles".</> },
          { text: <>Only manuscripts are LaTeX; notes are <b>Markdown + KaTeX</b>, like concept notes. Reading is the default, and the pencil (Edit) opens the same editor as concept notes ("/" and ⌘K commands, {c('[[')} concept links, {c('[@')} sources). On a list line, Tab and Shift-Tab indent and outdent (• ◦ ▪), and {c('[@')} searches by key, author, title or year words. Sections are split with {c('## Title')}, and when a note grows, make a separate "follow-up note" and link to it instead of sub-notes.</> },
          { text: <>Click a figure in the reading view or in a flow dot description to see it large over the screen; ← → step through the other figures in that text. For a figure from the figure library, "Open in figure screen" is at the top.</> },
          { text: <>Numbering and references are written as in LaTeX (table above). Put {c('\\label{…}')} at the end of a heading, inside a {c('$$')} equation or in a figure caption, and call it with {c('\\ref{…}')} or {c('\\eqref{…}')}; the reading view and the PDF get the same number. The PDF gets a reference list from the note folder's .bib (or the project bib if there is none).</> },
          { text: <>Definitions used across several notes that are not specific to the research move into concept notes, and notes only link to them. The PDF is built at compile or export time using the project's LaTeX template (the note file stays as it is). Old LaTeX notes ({c('main.tex')}) still open.</> },
          { text: <>"Copy into a note" on a manuscript row copies only the manuscript's body and the chapters, figures and bib it uses. The manuscript stays as it is. The dashed card "＋ New note" at the start of a row on the topic screen or home screen makes an empty note.</> },
          { text: <>LaTeX note files hold <b>only the body</b>. The preamble ({c('\\documentclass')}, packages, title, authors) is added by the app at compile or export time from the project template (Settings › LaTeX templates) and the author order in Networking. Project-specific symbols go in one file, {c('workbench/macros.tex')}. Notes that already have a preamble can have it stripped with "Keep body only for all".</> },
        ],
      },
      {
        title: 'Manuscript screen',
        items: [
          { text: <>Clicking "Manuscripts" in the left sidebar opens the manuscript screen and expands the list of manuscripts. Each manuscript is one card (chapter count, appendix count); the chapter list is in the outline once you open the manuscript.</> },
          { text: <>On the manuscript screen you set the manuscript or add another with "＋ Add manuscript", remove one from the list (the file stays), and use "Copy into a note". Exporting several selected notes at once, View map, "＋ New note" and the statement list are here too.</> },
          { text: <>A note has four statuses: In progress · Blocked (waiting on something, back soon) · Dropped (given up) · Solved. Click the colored dot and name at the left of the toolbar and pick from the menu. When you change a note to Blocked or Dropped, you write the condition for reopening it.</> },
        ],
      },
      {
        title: 'Topic screen',
        items: [
          { text: <>Clicking a topic name in the left sidebar opens the <b>topic screen</b>. Its header has the topic name, a pencil (Edit topic), ★ (favorite, toggles right away) and the description. Below, the notes in this topic show as <b>note cards</b>. A note in several topics shows as a card on every one of those topic screens.</> },
          { text: <>A note card has, in small text above the title, its kind (Proof · Calculation · Verification · Summary · Exploration · No kind), then the title, the first two lines of the description, one line of topic tags it belongs to (with … and +n when it overflows), and its status and last activity. For a blocked note, hover over the status to see the reopen condition. Click a card to open the note; star it with ☆ to put it first in any sort.</> },
          { text: <>Sort by recent work, status or name. Solved and Dropped notes gather in a collapsed area below; when sorting by status they sit together with the rest. The dashed card at the start of the card row has two parts: "＋ New note" makes a new note in this topic, and "Assign notes" picks notes from other topics or "Loose notes" and assigns them to this topic too (their current topics and main topic stay). Topics that once grouped manuscript chapters open the chapter list with "n manuscript chapters" below.</> },
          { text: <>In the <b>Edit topic</b> dialog (pencil) you edit the name (80 characters), description (300 characters, "- " lists), card preview text (30 characters, math inside {c('$…$')}), image and background color (default = the project color, or one of five preset colors). The image and background sit right under the topic card on the right, so the card changes as you pick. Note kind is only shown as "Auto", gathered from its notes' kinds; you choose it in a note's right sidebar. Cancel is Esc, Save is ⌘↵. If {c('research.yaml')} changed elsewhere, it does not save and tells you.</> },
          { text: <>"Loose notes" (notes without a topic) is the same kind of screen. Choosing a topic in a note's right sidebar moves it to that topic.</> },
        ],
      },
      {
        title: 'Note screen',
        figure: <NoteToolbarFigure />,
        items: [
          { text: <>Every note uses the same screen. From the top: top bar › tab bar › <b>note toolbar</b> › body. While reading, the body starts with the title and ends with the cited papers. Status sits at the left of the toolbar.</> },
          { text: <>While reading, the toolbar has <b>status on the left</b> and <b>save status · Comment · pencil · ▶ · ⋯ on the right</b>. Comment (speech bubble) opens the right sidebar on Records, and ▶ opens the compiled PDF in the side pane. ⋯ has View PDF · Reload file · Show in Finder, and for folder notes also choose template · Export · Delete.</> },
          { text: <>Pressing the pencil brings a title input up into the toolbar. While editing, the toolbar has <b>the title input and status on the left</b>, <b>Source · Source | Preview · Live preview in the middle</b>, and <b>save status and "Done" on the right</b>. The Markdown body turns into an editor and saves on its own. Finish with "Done" (Esc). A LaTeX body is always an editor, and the pencil edits the name.</> },
          { text: <>Save status ("Saved · 3 min ago") always sits just left of the actions on the right. When space is tight the time hides first; hover the pencil or "Done" to see it. Saving, conflict and failure states and their fix buttons never hide. If the PDF is older than the note, "PDF is from before" is added.</> },
          { text: <>The <b>right sidebar</b> (the button at the far right of the top bar) has Info and Records. In Records you leave memos, to-dos, questions and instructions; the first kind, Auto, saves as an unsorted memo. If you write a question in a note such as "change it like this", Claude on this Mac (read only) answers with the text to replace and the replacement, and pressing "Apply to note" makes the app replace just that text in the note (only when that text appears exactly once in the note). When no note is open, entries go to the project, and the project's note records show as well. On a topic screen they go to that topic, and on the flow screen to the selected dot; "Saved to" on the row below the input shows where (it follows the screen you are on; there is nothing to choose). After the target button (Point), click a part of the screen and its name and text attach to the record, as in feedback mode (Esc cancels). The sidebar stays open while you edit the body.</> },
          { text: <>Info has status and reopen condition, kind (choose), topics (tags; the first is the main topic; Add · Remove · ↑ move up), description (multi-line, "- " lists, 200 characters), concept notes used in the body, notes that cite this note (up to 5; the rest under "Show N more"), and the file name at the bottom (hover for the full path). The two lists are gathered by the app from {c('[[links]]')} in the body. For a single-claim note, the statement it proves, the notes it relies on, other approaches and next steps are also edited here.</> },
          { text: <>A note always opens in the left pane, and its PDF opens in the right pane alongside only if it already exists. If not, the note fills the whole pane, and compiling opens the PDF on the right. Tabs and layout are remembered, but notes and PDFs chosen before are not reopened.</> },
          { text: <>Compile runs right away with the project template defaults. Next to ▶ you can change template, authors (include or not, and the order if included) and date (none · today · set) or reset them to defaults, and your choices are remembered per project. Export opens the same "Export settings" box (manuscripts start with authors included, notes without).</> },
          { text: <>Turn on <b>Include records</b> in the compile settings (off at first; open only · done too) to put the note's records into the PDF as annotations: selected text becomes a highlight (click it for the record and its answers), and records on display math or a heading, or without selected text, become a note at that place. The note file does not change, and they show in Preview and Acrobat too. Highlights need XeLaTeX, and records go only into body-only notes. If records make the compile fail, the PDF is made again without them and you are told.</> },
          { text: <>Export one note at a time, or pick several on the manuscript screen and export them together.</> },
        ],
      },
      {
        title: 'Single-claim notes and statements',
        items: [
          { text: <>A note holding one claim (a lemma, derivation, calculation or open problem) is {c('workbench/blocks/<id>.md')} (older ones are {c('.tex')}). It shows grouped under the chapter written in {c('grounds:')} in its front matter (older ones use a {c('% 근거:')} line). Its status is In progress · Blocked · Dropped · Solved. Under "Open problems" in a manuscript chapter, only In progress and Blocked show at first; Dropped and Solved are collapsed.</> },
          { text: <>Research questions stay in the body as an "open question" note, and the side memo holds only to-dos.</> },
          { text: <>A blocked note has its reopen condition written down.</> },
          { text: <>From "/" in the note editor, "Blocked record (optional)" inserts prompts for the goal and assumptions, the grounds for blocking (equations, counterexamples, places in the literature) and the reopen condition. "Calculation and result grounds (optional)" is for writing the result files, code commit, main inputs and the range checked. All of this is optional, and empty items and prompts do not appear in the reading view or the PDF.</> },
          { text: <>Statements are numbered definition and theorem cards; statements connect to each other by "uses", and to notes by "proves".</> },
        ],
      },
      {
        title: 'Map',
        items: [
          { text: <>Open it with "View map" on the manuscript screen. There is a focus view, with the chosen note in the middle, what it relies on to the left and where it is used to the right, and a list that shows in order how far things have got. A free-layout graph helps less in reading proof structure, so it is not used.</> },
        ],
      },
      {
        title: 'Citations',
        items: [
          { text: <>Cite with {c('[@key]')} in Markdown notes and {c('\\cite{key}')} in LaTeX manuscripts and notes, and keep entries in {c('references.bib')} ({c('[@key]')} becomes {c('\\cite')} in the PDF). Keys not in the project bib are looked up in the shared library's {c('references.bib')}. At compile time the references section includes only what was cited (entries found in the library are copied into {c('library-refs.bib')}), and keys found nowhere give a warning.</> },
          { text: <>At the bottom of the reading body, expand "Cited papers N · from file name" to see the papers the note cites. It scrolls with the body, and whether it is expanded is remembered per note. In LaTeX it sits below the editor, and you drag its top edge to change the height. From here you download the arXiv PDF or make a literature note. Papers from the shared library open in the paper library with "Open in the library".</> },
        ],
      },
    ],
    left: ['\\ref autocomplete and dragging in figures are not in the note editor yet (searching citations with [@ is).'],
  },
  {
    id: 'knowledge', title: 'Concept notes',
    sub: 'The book icon "Knowledge" on the rail. A screen to find, read and edit concept notes regardless of project.',
    open: [{ label: 'Open Knowledge', to: { page: 'library' } }, { label: 'Open knowledge map', to: { page: 'library', view: 'map' } }],
    sections: [
      {
        title: 'Library home (Knowledge · Papers · Figures)',
        items: [
          { text: <>Knowledge, Papers and Figures share the same home layout: <b>Recent</b> (with a create/add row first), <b>Check</b> (things for you to look at, orange dot), <b>Stats</b> (click to list those items), and on the right <b>Library info</b> (storage location and Git and cloud status; toggle with ⌥⌘\). Section headings use the subheading size.</> },
          { text: <>The Knowledge check lists notes your research uses (concept notes linked from project notes or manuscripts, plus one level of their prerequisites) that are not reviewed yet or changed since review, and drafts written by an agent. "＋ New concept note" lets you choose between writing it yourself and delegating a draft to an agent.</> },
          { text: <>The Knowledge list is a table sorted and filtered from the index, 50 at a time. The sidebar has only the subject tree; choosing a subject shows its info on the right (rename · add subsection · papers n · figures n in this subject). The map opens from the "Map" row in the Knowledge sidebar.</> },
          { text: <>Subjects are the tree in the shared library's {c('subjects.yaml')} (up to three levels), and concept notes, figures and papers write 1 to 3 {c('subjects:')} IDs in their front matter or list. Changing subjects leaves the note body bytes unchanged.</> },
          { text: <>The Papers home check is set the PDF folder · answered questions, and its stats are no PDF · available from arXiv · not linked to a project. The Figures home check is tikz that could not be turned into a figure. Table and card lists are under "List" in the sidebar. Shared figures go in the shared library's {c('figures/')}, a single project's in that repository's {c('workbench/figures/')}, and notes insert them with {c('![[name]]')} or a figure paragraph {c('![caption](name)')}.</> },
        ],
      },
      {
        title: 'Where they live',
        items: [
          { text: <>Concept notes live in the shared library's {c('concepts/')} as Markdown + KaTeX (math). The 171 concept notes from Obsidian Study were moved over, and the app is now the source of truth. Obsidian is left as it is and no longer edited.</> },
          { text: <>Study notes not moved yet show read only at the bottom of the Knowledge sidebar.</> },
          { text: <>Concept notes a note uses through {c('[[links]]')} gather under "Concept notes used in the body" in that note's right sidebar Info.</> },
        ],
      },
      {
        title: 'Finding',
        items: [
          { text: <>From the top, the sidebar has the "Knowledge library" (home), "List" and "Map" rows, the subject tree, old-format LaTeX concept notes, and Study notes not moved yet. Finding is handled by the filters on the list screen and by the top bar search.</> },
          { text: <>So it stays fast even with tens of thousands of notes, the app keeps a separate index (SQLite) rebuilt from the .md files and loads the list 50 at a time.</> },
          { text: <>"Incomplete" is added by the app: empty sections, TODO or "작성 중" (in progress) marks, notes that are only a title or skeleton. The one thing a person presses is "Reviewed ✓", and if the body changes after review, it is marked for review again.</> },
        ],
      },
      {
        title: 'Reading and editing',
        items: [
          { text: <>The reading view is the default. Pressing "Edit" in the toolbar opens a live editor like Obsidian (Live preview · Source | Preview); "/" at the start of a line or after a space, or ⌘K, opens the command menu, "[[" finds concepts and "[@" finds sources. Edits save on their own; ⌘S saves right away and keeps editing. Finish with "Done" (Esc).</> },
          { text: <>Each note has an "edit lock"; locked notes are not edited by the app or by agents.</> },
          { text: <>The body holds only concept content unrelated to any research (definitions, properties and proofs). Questions tied to a research project, key references and working instructions go in <b>records</b> outside the body.</> },
          { text: <>The right sidebar's <b>Records</b> works like project note records (10/18): kind choice (All · Memo · To-do · Question · Instruction), In progress | Done, record rows and the input below. Select text in the body to highlight it or attach a record; the lower left of a record row shows the section it is attached to (hover for the line number) and takes you to that spot. Instructions are carried out by Claude on this Mac in the library folder. Records are kept in the library's {c('workbench/comments/concept-<id>.md')} and pushed on their own like research-repo records.</> },
          { text: <><b>Default template</b>: the body and section names are in English. The first section, {c('## Definition')} ({c('## Model')} or {c('## Statement')} for a model or theorem), says in a sentence or two what the concept is. Then come {c('## Properties')} (each followed by its {c('**Proof.** … ∎')}, folded in the reading view) and {c('## Examples')}, and {c('## Remarks')} when needed. The "Concept note template" command under "/" inserts this. The rules live in the shared library's {c('README.md')}.</> },
          { text: <>The right sidebar's Info has "Concepts that use this concept" and "Concepts this note points to". Sources are written as {c('[@key]')}, show in the body like [1], and lead to the source list below the body.</> },
        ],
      },
      {
        title: 'Organizing rules',
        items: [
          { text: <>A definition is written in only one place. If only one research project uses it, it goes in that project's notes; if two or more use it, in a concept note. One note per concept; other names are aliases.</> },
          { text: <>To view as PDF, choose one of the LaTeX templates in Settings. The choice is remembered per note.</> },
        ],
      },
    ],
    left: ['Chapter notes for textbooks and lectures (48) and paper notes will be moved later.', 'Figures in concept notes (tikz, quantum circuits), attaching hand drawings, and LaTeX export are the next step for concept notes.', 'When several people share a library, each memo gets an author and visibility field. Records for every reader (corrections, open questions) stay in the library memo; personal memos and to-dos go in your personal repository under the concept ID, and the app shows both together.'],
  },
  {
    id: 'reading', title: 'Reference materials and reading papers',
    sub: 'The sidebar\'s "Reference materials" holds only PDFs and files you actually have. Open a paper in the pane next to a note, read it, and leave comments and questions.',
    sections: [
      {
        title: 'Reference materials',
        items: [
          { text: <>Expand "Reference materials" in the sidebar to see the PDFs and files you have ({c('workbench/materials/')} and the {c('sources.materials')} folder); click to open. Drag and drop a file to add it. Paper PDFs in the paper library are not kept here; "N papers" at the top goes to the paper library.</> },
          { text: <>Papers a note only cites are not added here; see them in "Cited papers" on that note's screen. "＋ Literature note" on a file row makes a literature note for that paper.</> },
        ],
      },
      {
        title: 'Paper library',
        items: [
          { text: <>"Papers" on the rail is the list of papers shared by all projects. Its home has recently added papers · Check (set the PDF folder · answered questions) · Stats, and "List" in the sidebar is a Table | Cards view; choosing a paper shows its info on the right.</> },
          { text: <>Opening a paper shows the PDF together with info and comments on the right. Highlights, comments and questions work as in notes, and each is saved as one file in the shared library's {c('comments/<key>/<id>.md')}. PDFs go in the iCloud or Google Drive folder chosen in Settings › Library.</> },
          { text: <>The figure library ("Figures" on the rail) has the same layout: shared figures go in the shared library's {c('figures/')}, a single project's in that repository's {c('workbench/figures/')}, and names and descriptions are written in {c('figures.yaml')}.</> },
          { text: <>Clicking a figure card or table row opens the figure screen: the figure large in the main area, the list you came from as one row below, and its info on the right (description · subjects · text to embed in a note · notes using it · edit source). ← → go to the previous or next figure, Esc returns to the list.</> },
        ],
      },
      {
        title: 'Asking while reading',
        items: [
          { text: <>Opening a paper, statement or concept note while writing a note opens it in the side pane, so you read it on the same screen without switching windows.</> },
          { text: <>Dragging to select text in a note, the editor or a PDF brings up the selection menu: four highlight colors and Comment. Clicking a highlight offers change color · add comment · delete.</> },
          { text: <>Comment (speech bubble) in the toolbar at the top middle of the PDF pane opens Records in the right sidebar. Dragging to select text attaches that spot, and records build up in {c('workbench/comments/<target>.md')}.</> },
          { text: <>Writing a question or pressing "Ask Claude" makes Claude Code on this Mac ({c('claude -p')}, read only) read that PDF and append an answer to the same file. Pending questions written outside can also be answered by the next agent that works.</> },
        ],
      },
    ],
    left: ['Pulling comments into notes is not there yet.', 'Zotero integration comes later (keeping citations as bib entries prepares for it).'],
  },
  {
    id: 'network', title: 'Networking',
    sub: 'The person icon on the rail. See the people you research with and your own author details in one place.',
    open: [{ label: 'Open Networking', to: { page: 'network' } }],
    sections: [
      {
        title: 'People',
        items: [
          { text: <>At the top of the left sidebar is "Me" (the author matching your Google account) on its own; click it to go to your research profile page (affiliation, email, choosing note authors). Login is handled separately in Settings › Accounts. Below it is the list of people, with ★ on favorites.</> },
          { text: <>The home screen shows people cards grouped by institution and by field. A card shows a circle with initials, the name, and "institution · main field". No icons that guess gender are used.</> },
          { text: <>The list of people puts favorites (★) first, then alphabetical order (decided 10/4). A card shows only one main field tag and the count of the rest ("+2"; hover for names).</> },
          { text: <>People who appear in more than two papers in your notes' references show as small suggestion cards with a dashed border (name, paper count and latest year, latest paper title), up to six. Add with ＋, and × removes them from these suggestions only. Whether two entries are the same person is judged by surname and first initial.</> },
        ],
      },
      {
        title: 'Person page',
        items: [
          { text: <>Each person's page gathers papers they authored from the shared library and project bibs. You can also add other forms of their name used in references (for example A. E. Example).</> },
          { text: <>The profile card has large initials, affiliations (main and secondary), emails (several, one per line), homepage, main field, memo, other names, and arXiv and Google Scholar search links. It is normally read only; the pencil at the card's top right opens the <b>Edit person</b> dialog, the same dialog as editing a topic or project. Name, affiliations, emails, homepage, other names and memo are on the left; a person card preview is on the right (with Corresponding author below it for note authors). Affiliations take one box per line (the first is the main one), and as you type, affiliations already given to other people and manuscript authors are suggested below (pick with ↑↓ and Enter). All authors are not edited in one form on the home screen.</> },
          { text: <>Under "Co-authors" at the bottom of a person page, co-authors who are in Networking show as the same person cards, with the number of papers written together.</> },
          { text: <><b>Photo</b>: click the large circle to pick an image file (shrunk and kept in the app settings folder). To remove it, use the pencil › "Remove photo".</> },
          { text: <><b>New papers</b>: papers from the last 90 days are looked up once a day. If you pick an author under the pencil › "Semantic Scholar author", that author ID is used (no namesakes mixed in); otherwise arXiv is searched by the name and other names. Papers you have not seen get a blue dot, and the person's row in the sidebar shows the count. "Add to paper library" adds one right away, and "Not this person" hides a namesake's paper.</> },
          { text: <><b>Appears in</b>: for each project, the number of this person's papers in that project's references and the records that mention their name.</> },
        ],
      },
      {
        title: 'Author details',
        items: [
          { text: <>Note authors are chosen as person cards in the "Note authors" box inside the profile card on your page ("Me") (＋ Add author, × Remove; the corresponding author gets a "Corresponding" tag). The order is set at export. On export, {c('\\author')}, {c('\\email')} (first email) and {c('\\affiliation')} lines are added automatically. They are stored in {c('~/.config/research-workspace/config.yaml')}.</> },
        ],
      },
    ],
    left: ['Collecting new arXiv papers by the people you research with comes later.'],
  },
  {
    id: 'settings', title: 'Settings',
    sub: 'The gear at the bottom of the rail. Choose a part in the left sidebar.',
    open: [{ label: 'Open Settings', to: { page: 'settings' } }],
    sections: [
      {
        title: 'Parts',
        items: [
          { text: <><b>About this app</b>: name, current version (number, date, commit), the GitHub source, the app folder and settings file, and update history (PR · version · content · time). Version numbers look like 1.11, and the last number goes up by one each time a change is merged into main. Below it, <b>Update</b> pulls what was merged into main. The Mac service pulls and builds on its own every 10 minutes and restarts while you are idle (5 minutes without input, nothing left to save, no compile or question running). When pulling, it also shows the feedback that this update addresses.</> },
          { text: <><b>Accounts</b>: GitHub uses the Mac's existing login to read the repository list (Settings only shows the connection status). Google is used to read Calendar events and to keep display settings and the project list in an app-only space in Google Drive. The content of research files is not sent to Google.</> },
          { text: <><b>Backup</b>: pushes each project's {c('workbench/')}, which exists only on the Mac, to a private repository every hour.</> },
          { text: <><b>Sync</b> — For pushing records and feedback, pulling research repositories and the library, and checking for app updates, choose <b>Manual | Auto</b> for each; with Auto, pick one of three intervals (push 30 s · 5 min · 30 min later, pull 5 · 10 · 30 min, update 10 min · 1 h · 1 day) or a <b>Custom</b> value. Changes apply right away. When records are not pushed yet, "n not pushed in this project · Push now" shows at the top of the Records tab, so you can push at once even with Auto. Updates download and build only when a new version exists.</> },
          { text: <><b>Agents</b>: when Claude on this Mac carries out instructions from records (when asked, right away, or once a day at a chosen time). Each instruction uses Claude usage.</> },
          { text: <><b>Common rules</b>: the rules agents in every research repository read first ({c('rules/research.md')} in your personal repository). The rows under it in the left sidebar are its sections. The pencil opens the source in place. Saving counts as your confirmation, so the status becomes "accepted" with today's date, and only this file is pushed to your personal repository. If it changed elsewhere in the meantime, it is not saved and "Reload" appears. Each project's {c('STATUS.md')} and the MCP {c('rules')} tool carry the new rules the next time they are written.</> },
          { text: <><b>Display</b>: theme, text size, density, accent color (only ones that do not clash with status colors), default highlight color.</> },
          { text: <><b>Library</b>: library folder (path, Git status), Knowledge (concept note count, Obsidian Study source), Papers (add or remove PDF folders, marked iCloud · Google Drive · this Mac), Figures (figure count in Git; linking a photo folder is only a placeholder).</> },
          { text: <><b>LaTeX</b>: three parts. <b>Editor</b>: font, size, line spacing and a preview. <b>Macros</b>: {c('concepts/macros.tex')}, shared by concept notes and note compiling (a project's own {c('workbench/macros.tex')} takes precedence). <b>Templates</b>: keep several templates and choose one: basic document (article), PRB and PRL (revtex), talk (beamer). For each template you edit the name, kind, document class line and packages, and you can copy it into a new one, delete it, or make it the export default.</> },
          { text: <><b>Open as an app</b>: open it with the "연구 작업대" (workbench) icon on the desktop. To keep it in the Dock on its own, in the Chrome window running the app choose ⋮ › Cast, save, and share › "Install page as app", then keep it in the Dock.</> },
        ],
      },
    ],
  },
  {
    id: 'agents', title: 'Agents and safety',
    sub: 'This app reads and edits each repository\'s files directly, and works on the same files as coding agents. The first thing it protects is never losing a manuscript.',
    sections: [
      {
        title: 'The repository is in charge',
        items: [
          { text: <>The only thing the app creates is one folder, {c('workbench/')}, in each repository. The sources of truth a project already has (manuscript, task list, bib, materials folder, review documents) are listed under {c('sources:')} in {c('research.yaml')} and read where they are.</> },
          { text: <>The app does not change the bytes of parts it did not edit. When a file changes outside, it notices and rereads it, and when saves collide it tells you instead of overwriting.</> },
        ],
      },
      {
        title: 'Keeping real research safe',
        items: [
          { text: <>Development happens in sample mode ({c('pnpm dev')}, a copy in {c('.sandbox/')} inside the repository). The banner at the top of the screen marks sample mode.</> },
          { text: <>Real research repositories change only after you have reviewed the change. A manuscript linked to Overleaf is never pushed by the app.</> },
        ],
      },
      {
        title: 'Agents picking up the work',
        items: [
          { text: <>The app writes a summary (where the sources of truth are, task list, manuscript and last compile, last 7 days) to each project's {c('workbench/STATUS.md')}. Agents read this first. It is not a source of truth.</> },
          { text: <>The rules for delegated tasks are in one file, {c('docs/agent-delegated-work.md')}, and one line at the top of each {c('STATUS.md')} points to it. The agent that produced a result does not approve its own result.</> },
          { text: <>Without the app, {c('pnpm agent:status <research repository folder>')} shows the same summary (to-dos · delegated tasks · questions · awaiting review · recent records).</> },
          { text: <>A web app for phone and iPad (PWA) reads and writes the same {c('workbench/comments/')} through GitHub.</> },
        ],
      },
    ],
    left: ['A history screen to review and undo each change an agent made is not there yet.'],
  },
  {
    id: 'feedback', title: 'How feedback gets in',
    sub: 'The path from something you said while using the app to a fixed screen coming back to you.',
    open: [{ label: 'Open feedback overview', to: { page: 'feedback' } }],
    sections: [
      {
        title: 'Leaving feedback',
        figure: <FeedbackFlowFigure />,
        items: [
          { text: <>Turn on feedback mode with the Feedback button in the top bar (a location pin with text lines), and click a part of the screen to leave a comment. Before posting, choose Fix, Question or Suggestion at the bottom left (you cannot post without choosing, so a question is not read as a request). The Feedback button still works while a dialog (such as Register project, search or quick memo) is open, and you can leave feedback on parts inside the dialog. The speech bubble is used only for comments on research content.</> },
          { text: <>Each comment saves a picture of the screen at that moment in {c('feedback/pictures/')}, so Claude sees the same screen. The picture is taken when you submit, so the box opens right away when you click a part and typing never stalls (submitting takes a moment). 30 seconds after the last comment it is pushed to GitHub automatically. An app update first commits any feedback not yet pushed and then pulls the new version, so the two do not collide. Only when an agent has just deleted approved originals and the same date file has comments not yet pushed does the update stop with "nothing was changed" (the app keeps running).</> },
        ],
      },
      {
        title: 'Overview',
        items: [
          { text: <>Click "Feedback" on the rail (pin with text lines) to see it all. Choose a filter at the left of the toolbar, and group by time · screen · theme · kind in the middle. On the right is "Add feedback" (pushes straight to GitHub). The time view is one table: time, state, content, screen, part, app version, fix commit. "In the app" next to the fix commit means the fix is in the app now; "App update needed" means it comes in once you get the new version (on Home, "Update available" means the research repository has commits to pull). Click a row to expand the original, the understood request and the handling.</> },
          { text: <>In an expanded item, the location text itself is a link to that spot. It is clickable only when there is a screen to go to; on hover it shows an underline and a "Go to that spot" tooltip.</> },
          { text: <>The same point raised more than once is merged into the latest item and shown as "+N". Comments you left are edited and deleted with the pencil and trash can that appear at the top right on hover.</> },
          { text: <>"Needs review" and the orange count on the rail are items where the agent asks you to decide (asked, agreed, or an answer with a question), plus items that were handled but not yet approved or revised.</> },
          { text: <>An opened item shows a handling summary at the top (understood request, cause and handling with their times, plus earlier versions) and the conversation between you and the maintainer below it. The bottom always has three buttons, named by the kind of answer. When the agent reports a result (applied, answered, declined, later) they are Ask · Revise · Approve: with the box empty only Approve is on, and typing turns on Ask and Revise. When the agent asks you to decide (asked, agreed, or an answer with a question) they are Ask · Stop · Proceed: Proceed has Claude go ahead, Stop ends it as is, and any text you type is saved with it. Ask leaves the handling as is, so the maintainer only answers. Revise and Proceed send the item back to waiting so Claude handles it again. Edit your own messages with the pencil at their top right, and "Undo" takes back your last answer.</> },
        ],
      },
      {
        title: 'Handling and shipping',
        items: [
          { text: <>The handling record is kept in one place, {c('feedback/status.yaml')}: the corrected sentence, the understood request, the cause, the handling, and the commit.</> },
          { text: <>The agent puts its fix up as a PR and merges it itself once the checks (type check, tests, build, screenshots) pass. You only press Update in Settings › About this app.</> },
          { text: <>Approved items move into this About page as descriptions, and their originals and handling records are deleted. So the Feedback screen keeps only what is not finished.</> },
        ],
      },
      {
        title: 'This About page',
        items: [
          { text: <>The place where what Claude understood and built is written down, following the layout of the screens. Choosing a part and a section under it in the left sidebar opens that one section on its own (instead of scrolling), and the "‹ Previous" · "Next ›" boxes at the bottom move to the previous or next section. Clicking a part's name opens its first section. If you edit the text directly with the pencil at the right of a section heading and send it, it is applied at the next round of feedback handling.</> },
          { text: <>Sentences that are not certain get "Needs review", and the questions gather at the top of that page. The count also shows in the list on the left and on the About button on the rail.</> },
        ],
      },
    ],
  },
  {
    id: 'design', title: 'Screen standards',
    sub: <>The design rules every screen follows. The reference document is {c('docs/design-system.md')}.</>,
    sections: [
      {
        title: 'Values and components',
        items: [
          { text: <>Six principles (hierarchy, consistency, structure that does not draw attention, foundation tokens first, one family, refine bit by bit) taken from Apple, Linear and Atlassian.</> },
          { text: <>Color, text size, weight, corner radius and spacing are chosen only from fixed steps (tokens), and breaking this fails a test. Neutral is the default and color is only for status; text buttons and links are neutral too.</> },
          { text: <>Faint text (dates, kinds, empty states) is a gray with at least 4.5:1 contrast (WCAG AA) on white and on sunken cells (on selected rows 4.7:1 light, 4.4:1 dark), and editor comments use the same gray. The teal for Solved is dark enough for white text at 4.5:1. Buttons are as tall as inputs and follow the text scale, and menus, dialogs and tooltips stack in fixed steps.</> },
          { text: <>Parts that several screens share (small buttons, small icon buttons, menus, tooltips, empty states, cards, dashed create cards, the orange your-turn pill and dot) are defined in one place. An empty state is one faint line without a box on every screen, and the dashed "＋ Create / Add" card has the same dashed border everywhere. Tooltips with a button's name or shortcut look the same everywhere and appear below (beside, on the rail).</> },
        ],
      },
      {
        title: 'Symbols and actions',
        items: [
          { text: <>One name and one symbol per action: Add ＋, Edit pencil, Delete trash can, Remove/Close ×, Compile ▶, Export ⤓, Comment speech bubble, Order ↑↓. If a button label uses a different word for the same action (in Korean, words like 삭제·추가·편집 instead of the chosen ones), a test fails.</> },
          { text: <>Delete (it is gone) uses the trash can, and Remove (only taken out here) uses ×. The rule is to ask for delete confirmation only when it cannot be undone, saying what disappears and what stays.</> },
          { text: <>Status shows only as a colored dot (Dropped is a hollow ring) and its name. Compile results are ✓ success and ! error.</> },
          { text: <>Symbols on tabs, note rows and file rows are the same line drawings as the sidebar. Icons must read at once (Settings is a gear).</> },
          { text: <>An item's pencil and trash can sit at its top right. In wide body lists they show on hover or keyboard selection; in narrow areas like the right sidebar and on touch screens they always show.</> },
          { text: <>When you type a name or title, a small app-styled dialog appears instead of the browser's default prompt.</> },
          { text: <>The tables of colors and symbols are on the <a className="a" href="#/about/symbols">Symbols and meanings</a> page.</> },
        ],
      },
      {
        title: 'Screen rules',
        items: [
          { text: <>A toolbar is target on the left · view in the middle · actions on the right. A note's save status sits just left of the actions on the right. The project work panel starts at the top even when the description gets long.</> },
          { text: <>Markdown notes read by default and are edited with the pencil. The LaTeX source editor is always open. Projects and topics, which edit several values, use dialogs of the same shape. Detailed layout and narrow-width rules are in section 6 of {c('docs/design-system.md')}.</> },
        ],
      },
    ],
  },
  {
    id: 'symbols', title: 'Symbols and meanings',
    sub: 'The colors and symbols the app uses, in one place. A symbol means the same on every screen.',
    sections: [
      { title: 'Colors', id: 'colors', items: [{ text: <>Neutral is the default, and color is used only for the meanings below. Text buttons and links are neutral. Color is never the only cue: a status always has its name next to it, and in narrow places hovering the dot shows the name. The four status colors were chosen to stay distinct for red-green color-blind eyes.</> }] },
      { title: 'Actions', id: 'actions', items: [{ text: <>Symbols you press. Always neutral; one name and one symbol per action.</> }] },
      { title: 'Screen icons', id: 'screens', items: [{ text: <>Icons on the rail, the left sidebar and the top bar that take you to a screen. Hover to see the name.</> }] },
      { title: 'Flow', id: 'flow', items: [{ text: <>Dots and lines on the flow screen. A dot's mark is its kind and its color is its state. Circles are statements, rounded squares are actions. <a className="a" href="#/about/project/flow">Flow screen ›</a></> }] },
      { title: 'Record marks', id: 'marks', items: [{ text: <>Marks you do not press. They are line drawings like the other icons, not text characters.</> }] },
      {
        title: 'Conversation tags', id: 'tags',
        figure: <FeedbackTagsTable />,
        items: [
          { text: <>The tags at the head of each message in an opened item on the feedback screen. The tags used in that conversation also appear in the "Tags" line below it; the circled question mark right after "Tags" brings you to this table.</> },
        ],
      },
    ],
  },
  { id: 'reference', title: 'Shortcuts and file locations', sub: 'Common actions, and where the files the app reads and writes are.' },
  { id: 'next', title: 'What comes next', sub: 'Where this app is headed, features not there yet, and what is waiting for your answer.' },
]

export const COLOR_ROWS_EN: ColorRow[] = [
  { status: 'in-progress', color: 'Blue', name: 'In progress', meaning: 'Work being done', where: 'Notes, delegated tasks, projects, statement proofs' },
  { status: 'blocked', color: 'Orange', name: 'Blocked', meaning: 'Waiting on something, back soon. The condition for restarting is written with it. Awaiting decision on delegated tasks uses the same color (named Awaiting decision)', where: 'Notes, delegated tasks, projects, statement proofs' },
  { status: 'stopped', color: 'Dark gray ring', name: 'Dropped', meaning: 'Work given up (not deleted). It is a hollow ring, so it is distinct even when color cannot be seen', where: 'Notes, delegated tasks' },
  { status: 'solved', color: 'Teal', name: 'Solved', meaning: 'Finished ("Done" for projects and feedback). The ✓ mark is neutral, not this color', where: 'Notes, delegated tasks, projects, statements' },
  { status: 'none', color: 'Light gray', name: 'No proof work', meaning: 'A statement with no proof attached yet', where: 'Statements' },
  { token: '--s-blocked', color: 'Orange', name: 'Your turn', meaning: 'Something for you to answer or review. Marks waiting on an agent\'s answer or handling are gray', where: 'Rail badge, Needs review on Home, Needs review in Feedback, To decide in the Work tab, library Check, deadline ⚑' },
  { token: '--text-2', color: 'Gray', name: 'Agent\'s turn and handling state', meaning: 'Things waiting on an agent\'s answer or handling, and feedback handling states', where: 'Questions waiting on an agent, feedback state tags, ✓ done and reviewed' },
  { token: '--primary', color: 'Black (the accent color in Settings)', name: 'Primary button and selection', meaning: 'The single most important button on the screen, and what is selected now', where: 'All screens' },
  { token: '--danger', color: 'Red', name: 'Delete and error', meaning: 'Gone once deleted, or failed (!)', where: 'Delete confirmation, compile errors, this compile failed' },
  { token: '--focus-line', color: 'Yellow', name: 'Where you are pointing now', meaning: 'The line or PDF spot you just moved to, highlights', where: 'Manuscripts, PDFs, Home calendar' },
  { token: '--proj-1', color: 'Various colors', name: 'Project marker', meaning: 'A different color per project (not a status)', where: 'Home calendar' },
  { token: '--banner-bg', color: 'Yellow', name: 'Sample mode', meaning: 'You are looking at the sample research for development', where: 'Banner at the very top' },
]

export const SYMBOL_GROUPS_EN = (g: { icons: Record<'pencil' | 'trash' | 'play' | 'download' | 'comment' | 'approve' | 'sendBack' | 'memo' | 'feedback' | 'panelLeft' | 'more' | 'reopen' | 'search' | 'plus' | 'x' | 'up' | 'down' | 'todo' | 'ask' | 'send' | 'spark' | 'star' | 'check' | 'unchecked' | 'flag' | 'swap' | 'claude', ReactNode> }): { title: string; note: string; rows: SymbolRow[] }[] => [
  {
    title: 'Actions', note: 'Always neutral. One name and one symbol per action.',
    rows: [
      { mark: g.icons.plus, name: 'Add', meaning: 'Create or insert something new', where: 'Every list' },
      { mark: g.icons.pencil, name: 'Edit', meaning: 'Open the item\'s input', where: 'Item top right (always shown in narrow areas)' },
      { mark: g.icons.trash, name: 'Delete', meaning: 'Gone. A delete that cannot be undone says what stays and asks for confirmation', where: 'Item top right (always shown in narrow areas)' },
      { mark: g.icons.x, name: 'Remove/Close', meaning: 'Taken out only here; the file stays', where: 'Tags, lists, dialogs' },
      { mark: g.icons.play, name: 'Compile', meaning: 'Make the PDF', where: 'Note and manuscript toolbar' },
      { mark: g.icons.download, name: 'Export', meaning: 'Save as a file', where: 'Notes and manuscripts' },
      { mark: g.icons.comment, name: 'Comment · Records', meaning: 'Leave a remark on research content (notes, PDFs). The speech bubble is the picture for records as a whole', where: 'Note toolbar, Records in the left sidebar, Records tab' },
      { mark: g.icons.memo, name: 'Memo', meaning: 'Record kind: something jotted next to a project or note (M key)', where: 'Start of a record row, record kind picker, calendar' },
      { mark: g.icons.todo, name: 'To-do', meaning: 'Record kind: something to do. In the row it is a checkbox you click to finish', where: 'Start of a record row, record kind picker' },
      { mark: g.icons.ask, name: 'Question', meaning: 'Record kind: something you ask (? in a speech bubble)', where: 'Start of a record row, record kind picker' },
      { mark: g.icons.send, name: 'Instruction', meaning: 'Record kind: work sent to an agent (paper plane)', where: 'Start of a record row, record kind picker' },
      { mark: g.icons.feedback, name: 'Feedback', meaning: 'A remark left on this spot of the app screen (feedback mode, feedback overview)', where: 'Top bar, rail' },
      { mark: g.icons.panelLeft, name: 'Toggle sidebar', meaning: 'A box with the side that opens filled in. The button sits at that side\'s end', where: 'Both ends of the top bar' },
      { mark: g.icons.more, name: 'More', meaning: 'Less frequent actions (template · View PDF · Export · Delete …)', where: 'Note toolbar' },
      { mark: <>{g.icons.up}{g.icons.down}</>, name: 'Order', meaning: 'Move one place up or down', where: 'Authors to export' },
      { mark: g.icons.reopen, name: 'Reopen', meaning: 'A blocked note back to In progress, a finished question back to waiting', where: 'Work panel, Records' },
      { mark: g.icons.spark, name: 'Ask Claude', meaning: 'Send a record as a question for Claude on this Mac to answer. Sparkles are used only for things Claude does', where: 'Top right of a record row' },
      { mark: g.icons.search, name: 'Search', meaning: 'Find by name across the whole app (/ key)', where: 'Right of the top bar' },
      { mark: g.icons.approve, name: 'Approve', meaning: 'The result is right', where: 'Decision cards in the Work tab' },
      { mark: g.icons.sendBack, name: 'Revise', meaning: 'Not right; send it back to be done again (not deleted)', where: 'Decision cards in the Work tab' },
      { mark: <><span className="star-ico on">{g.icons.star}</span> <span className="star-ico">{g.icons.star}</span></>, name: 'Favorite', meaning: 'Show first (filled star) / unset (empty star)', where: 'Cards, topics, people' },
    ],
  },
  {
    title: 'Record marks', note: 'Marks that are not clicked.',
    rows: [
      { mark: g.icons.check, name: 'Done and reviewed', meaning: 'Compile succeeded, concept note reviewed, feedback approved, to-do finished (neutral). Solved as a research status is a teal dot, not ✓', where: 'Compile result, concept notes, feedback, calendar' },
      { mark: '!', name: 'Error', meaning: 'Failed (red). Used only for this', where: 'Compile result' },
      { mark: g.icons.flag, name: 'Deadline', meaning: 'A to-do\'s deadline (orange, your turn)', where: 'Home calendar, Work tab calendar' },
      { mark: g.icons.unchecked, name: 'Not reviewed', meaning: 'A concept note not reviewed yet', where: 'Concept notes' },
      { mark: '—', name: 'Axiom/definition', meaning: 'A statement with nothing to prove', where: 'Statements' },
      { mark: g.icons.pencil, name: 'Edited', meaning: 'A record that a note was edited', where: 'Home calendar' },
      { mark: g.icons.swap, name: 'Status changed', meaning: 'A record that a status changed', where: 'Home calendar, Work tab calendar' },
      { mark: '→ ›', name: 'Open/go', meaning: 'Go to that screen', where: 'Links' },
      { mark: '∎', name: 'End of proof', meaning: 'Where a proof ends', where: 'Concept note body' },
      { mark: g.icons.claude, name: 'Written by Claude', meaning: 'A record or answer Claude wrote (grey mark before the name, not clickable). Other agents show the name only', where: 'Top line of a record row, record conversation, "Answer · author" in the right sidebar and PDF comments' },
      { mark: <span className="turn-dot" />, name: 'Your turn (agent question)', meaning: 'An agent asked and waits for your answer (orange dot and border; orange paint in the note body)', where: 'Record rows, note body' },
      { mark: '2', name: 'Your-turn count', meaning: 'How many things you need to look at (always one orange pill shape)', where: 'Rail, Records and Edit review in the left sidebar, feedback filter, To decide in the Work tab, library Check' },
    ],
  },
]
