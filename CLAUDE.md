# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# CCManager - Claude Code Worktree Manager

## Overview

CCManager is a TUI application for managing multiple Claude Code sessions across Git worktrees. It allows you to run Claude Code in parallel across different worktrees, switch between them seamlessly, and manage worktrees directly from the interface.

## Commands

### Install
```bash
npm install
```

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
```

### Run
```bash
npm start
# or directly
npx ccmanager
```

### Test
```bash
# Run all tests (watch mode)
npm test

# Run tests once (no watch mode)
npm run test:run

# Run a specific test file
npm test src/services/sessionManager.test.ts

# Run tests with coverage
npm test -- --coverage
```

### Lint
```bash
npm run lint
npm run lint:fix  # Auto-fix issues
```

### Type Check
```bash
npm run typecheck
```

## Architecture Overview

### Application Flow

1. **Entry Point**: `src/cli.tsx` sets up the CLI using meow, validates TTY environment, and renders the Ink app
2. **Central Controller**: `src/components/App.tsx` manages all application state and view routing
3. **View Routing**: Simple string-based view system (`type View = 'menu' | 'session' | ...`)
4. **Service Layer**: Three core services handle business logic independently of UI

### Core Services

#### SessionManager (`src/services/sessionManager.ts`)
- Manages Claude Code PTY sessions across worktrees
- Extends EventEmitter for reactive state updates
- Key responsibilities:
  - Creates/destroys PTY sessions
  - Tracks session states (idle, busy, waiting_input) using output analysis
  - Implements 500ms delay for busy→idle transitions to prevent flickering
  - Maintains output history as Buffers for efficient session restoration
  - Handles two-phase prompt detection (initial prompt → bottom border)

#### WorktreeService (`src/services/worktreeService.ts`)
- Clean API wrapper for Git worktree operations
- Uses synchronous `execSync` for simplicity
- Handles creating, deleting, and merging worktrees
- Falls back gracefully to single-repo mode

#### ShortcutManager (`src/services/shortcutManager.ts`)
- Singleton pattern for global shortcut configuration
- Platform-aware config paths (Windows: %APPDATA%, Unix: ~/.config)
- Validates shortcuts and protects reserved keys (Ctrl+C, Ctrl+D, Escape)

### State Management

#### Session State Detection
The most sophisticated part of the codebase. State detection works by:

1. **Output Analysis**: Strips ANSI codes and analyzes patterns
2. **Waiting State**: Detects "Do you want" prompts
3. **Busy State**: Looks for "ESC to interrupt" indicator
4. **Prompt Box Detection**: Two-phase detection:
   - Phase 1: Detects prompt box top border and content
   - Phase 2: Waits for bottom border to complete transition
5. **Timer-based Transitions**: 500ms delay prevents state flickering

#### PTY Output Handling
- Writes directly to stdout (bypasses React for performance)
- Stores history as Buffers (not strings) for memory efficiency
- Restores sessions by replaying buffer history
- Switches stdin between raw mode (for PTY) and normal mode (for Ink)

### Component Patterns

```tsx
// Standard component pattern used throughout
const Component: React.FC<Props> = ({prop1, prop2}) => {
  const [state, setState] = useState<State>(initialState);
  
  useEffect(() => {
    // Side effects and cleanup
  }, [dependencies]);
  
  return (
    <Box flexDirection="column">
      <Text>Content</Text>
    </Box>
  );
};
```

### Error Handling

All service methods return consistent result objects:
```typescript
{ success: boolean; error?: string }
```

Components store error states and display them inline in forms.

### Testing Approach

Tests focus on the complex state detection logic:
- Use Vitest with globals enabled
- Test async state transitions with timers
- Mock Claude Code for session testing:
  ```bash
  process.env.CLAUDE_COMMAND = './mock-claude'
  ```

## Key Implementation Details

### Prompt Detection (`src/utils/promptDetector.ts`)
- `includesPromptBoxLine()`: Detects prompt input lines
- `includesPromptBoxTopBorder()`: Identifies prompt box start
- `includesPromptBoxBottomBorder()`: Identifies prompt box completion

### Logger (`src/utils/logger.ts`)
- Writes to `ccmanager.log` in current directory
- Clears log on startup
- Available but not consistently used (consider using more)

### Platform Considerations
- Uses `node-pty` prebuilt binaries for cross-platform support
- Handles Windows ConPTY vs Unix PTY differences
- Platform-aware configuration paths

## Important Notes

### When modifying session handling:
- Always clean up PTY instances on unmount
- Handle stdin mode switching carefully
- Test state transitions with various Claude Code outputs

### When adding features:
- Follow the existing service/component separation
- Use the consistent error handling pattern
- Add tests for complex logic, especially state detection

### jules-menubar directory
This is a separate Electron project (TaskFlow) not part of CCManager. It's untracked in git and should be ignored when working on CCManager.