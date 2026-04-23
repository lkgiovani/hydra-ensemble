export interface TourStep {
  id: string
  title: string
  body: string
  target?: string
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  animation?: 'click' | 'type' | 'drag' | 'highlight'
}

export interface Tour {
  id: string
  title: string
  description: string
  steps: TourStep[]
}

export const TOURS: readonly Tour[] = [
  {
    id: 'classic-overview',
    title: 'Tour: Classic Dashboard',
    description: 'The home surface: sessions, toolkit, and the slide panel.',
    steps: [
      {
        id: 'intro',
        title: 'Welcome to Hydra',
        body: 'Hydra runs multiple Claude Code sessions side by side. This tour shows the main pieces of the Classic dashboard.',
        placement: 'center',
        animation: 'highlight'
      },
      {
        id: 'sessions',
        title: 'Your sessions',
        body: 'Each running agent lives in the Sessions column. Click a card to focus its chat; drag to reorder.',
        target: 'sidebar-sessions',
        placement: 'right',
        animation: 'click'
      },
      {
        id: 'toolkit',
        title: 'Toolkit',
        body: 'Quick actions — spawn sessions, open terminals, launch the editor or dashboard slide panel.',
        target: 'toolkit',
        placement: 'left',
        animation: 'highlight'
      },
      {
        id: 'chat',
        title: 'Chat column',
        body: 'The centre column is the active session chat. Type prompts, approve tools, watch responses stream.',
        target: 'chat-column',
        placement: 'top',
        animation: 'type'
      },
      {
        id: 'statusbar',
        title: 'Status bar',
        body: 'Bottom strip: global shell, watchdogs, PR inspector shortcut, command palette hint.',
        target: 'status-bar',
        placement: 'top',
        animation: 'highlight'
      }
    ]
  },
  {
    id: 'create-session',
    title: 'Tour: Create your first session',
    description: 'Walkthrough of the New Session dialog end to end.',
    steps: [
      {
        id: 'new-btn',
        title: 'New Session',
        body: 'Click the plus button at the top of the sessions column, or press Cmd/Ctrl+N.',
        target: 'new-session-btn',
        placement: 'bottom',
        animation: 'click'
      },
      {
        id: 'project',
        title: 'Pick a project',
        body: 'Choose the workspace folder the session should run in. Hydra keeps a list of recent projects.',
        target: 'new-session-project',
        placement: 'right',
        animation: 'click'
      },
      {
        id: 'agent',
        title: 'Pick an agent',
        body: 'Select an agent preset (default Claude, or a custom one with its own system prompt and tools).',
        target: 'new-session-agent',
        placement: 'right',
        animation: 'click'
      },
      {
        id: 'prompt',
        title: 'Seed prompt (optional)',
        body: 'Type the first instruction — you can leave it empty and chat manually once the session boots.',
        target: 'new-session-prompt',
        placement: 'top',
        animation: 'type'
      },
      {
        id: 'create',
        title: 'Launch',
        body: 'Hit Create. Hydra spawns the Claude Code CLI, attaches a PTY, and routes the chat into the new pane.',
        target: 'new-session-submit',
        placement: 'top',
        animation: 'click'
      }
    ]
  },
  {
    id: 'workspace-editor',
    title: 'Tour: Workspace + Editor',
    description: 'Reading and editing files inside the slide panel.',
    steps: [
      {
        id: 'open-editor',
        title: 'Open the editor',
        body: 'From the Toolkit, click Editor — it slides in from the right as a panel over the chat.',
        target: 'toolkit-editor',
        placement: 'left',
        animation: 'click'
      },
      {
        id: 'files',
        title: 'File tree',
        body: 'Left rail: Files / Changes / Search. Click a file to open it in CodeMirror.',
        target: 'editor-sidebar',
        placement: 'right',
        animation: 'click'
      },
      {
        id: 'tabs',
        title: 'Tabs',
        body: 'Open multiple files — tabs across the top, middle-click to close, drag to reorder.',
        target: 'editor-tabs',
        placement: 'bottom',
        animation: 'drag'
      },
      {
        id: 'edit',
        title: 'Edit away',
        body: 'Syntax highlighting, vim mode (optional), search, go-to-line — the usual. Save with Cmd/Ctrl+S.',
        target: 'editor-canvas',
        placement: 'top',
        animation: 'type'
      },
      {
        id: 'changes',
        title: 'Review changes',
        body: 'The Changes tab shows the session agent’s edits since spawn — diff them before committing.',
        target: 'editor-changes',
        placement: 'right',
        animation: 'highlight'
      }
    ]
  },
  {
    id: 'orchestra-intro',
    title: 'Tour: What is Orchestra?',
    description: 'The node-graph surface for multi-agent orchestration.',
    steps: [
      {
        id: 'what',
        title: 'Meet Orchestra',
        body: 'Orchestra is Hydra’s visual surface for wiring several agents together — producers, reviewers, routers — as a running graph.',
        placement: 'center',
        animation: 'highlight'
      },
      {
        id: 'canvas',
        title: 'The canvas',
        body: 'Pan with middle-drag, zoom with the scroll wheel. Nodes are agents; edges route messages.',
        target: 'canvas',
        placement: 'top',
        animation: 'drag'
      },
      {
        id: 'palette',
        title: 'Node palette',
        body: 'Drag agent, tool and control nodes from the left palette onto the canvas.',
        target: 'orchestra-palette',
        placement: 'right',
        animation: 'drag'
      },
      {
        id: 'inspector',
        title: 'Inspector',
        body: 'Click a node to edit its prompt, model, tool allowlist and output schema.',
        target: 'orchestra-inspector',
        placement: 'left',
        animation: 'click'
      },
      {
        id: 'run',
        title: 'Run the graph',
        body: 'Hit Run — Orchestra schedules the agents, streams tokens per node, and shows task progress in the tasks panel.',
        target: 'orchestra-run',
        placement: 'bottom',
        animation: 'click'
      }
    ]
  },
  {
    id: 'orchestra-first-team',
    title: 'Tour: Build your first agent team',
    description: 'Compose a Planner, Coder and Reviewer team in under a minute.',
    steps: [
      {
        id: 'new-team',
        title: 'Start a team',
        body: 'Click New Team in the Orchestra toolbar. You get a blank canvas plus a starter input node.',
        target: 'orchestra-new-team',
        placement: 'bottom',
        animation: 'click'
      },
      {
        id: 'add-planner',
        title: 'Drop a Planner',
        body: 'Drag the Planner node from the palette. This agent turns the user goal into a task list.',
        target: 'orchestra-palette',
        placement: 'right',
        animation: 'drag'
      },
      {
        id: 'add-coder',
        title: 'Drop a Coder',
        body: 'Add a Coder node after the Planner — connect the planner output into the coder input.',
        target: 'canvas',
        placement: 'top',
        animation: 'drag'
      },
      {
        id: 'add-reviewer',
        title: 'Drop a Reviewer',
        body: 'A Reviewer node reads the coder’s diff and either approves or sends it back with notes.',
        target: 'canvas',
        placement: 'top',
        animation: 'drag'
      },
      {
        id: 'tasks',
        title: 'Tasks panel',
        body: 'Open the Tasks panel to see each agent’s queue as the graph runs — click a task to inspect its trace.',
        target: 'tasks-panel',
        placement: 'left',
        animation: 'highlight'
      },
      {
        id: 'run',
        title: 'Run it',
        body: 'Type a goal in the input node and hit Run. Your trio plans, codes and reviews the change together.',
        target: 'orchestra-run',
        placement: 'bottom',
        animation: 'click'
      }
    ]
  }
] as const

export function getTour(id: string): Tour | undefined {
  return TOURS.find((t) => t.id === id)
}
