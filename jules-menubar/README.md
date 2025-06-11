# TaskFlow - macOS Menu Bar Claude Assistant

A powerful Claude AI assistant that lives in your macOS menu bar. TaskFlow automatically scans your git repositories, lets you ask Claude questions about specific projects, and manages Claude sessions.

## Features

- ⚡ Lives in your menu bar for quick access
- 🎨 Beautiful dark theme UI
- 📁 Automatic git repository scanning
- 🌿 Real-time branch selection
- 🤖 Claude AI integration for each project
- 💾 Persistent session history
- ⏱️ Real-time Claude status tracking
- 🖥️ Quick access to open projects in Terminal

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the app:
   ```bash
   npm start
   ```

## Building for Distribution

To create a distributable macOS app:

```bash
npm run dist
```

The built app will be in the `dist` folder.

## Prerequisites

- **Claude CLI**: Install Claude Code CLI
  ```bash
  # Install via npm (if available)
  npm install -g @anthropic-ai/claude-cli
  
  # Or download from Anthropic's website
  ```

## Usage

1. Click the TaskFlow icon (⚡) in your menu bar
2. Select a project from your git repositories
3. Choose the branch you want to work on
4. Ask Claude anything about your project:
   - "構成について教えて下さい" (Tell me about the configuration)
   - "Explain the architecture"
   - "Help me debug this error"
   - "How do I add a new feature?"
5. Click "Ask Claude" or press Enter
6. Claude will analyze your project and respond

### Session Status

- **Starting**: Claude session is initializing
- **Claude Ready**: Ready for your questions
- **Claude Working**: Claude is thinking/analyzing
- **Waiting Input**: Claude needs your response
- **Finished**: Session completed
- **Failed**: Session encountered an error

### Terminal Window

Click on any task to open an interactive terminal window where you can:
- View Claude's full output with syntax highlighting
- Type directly to interact with Claude in real-time
- Send additional questions or commands
- Clear the terminal output
- See session status in real-time

The terminal automatically handles:
- Trust prompts for new directories
- Full ANSI color support
- Terminal resizing
- Session restoration

## Configuration

TaskFlow automatically scans common development directories:
- ~/Documents
- ~/Projects
- ~/Development
- ~/dev
- ~/repos
- ~/Desktop
- ~/SynologyDrive/DEVELOP

## Technologies Used

- Electron
- electron-store for data persistence
- simple-git for repository management
- Native macOS menu bar integration

## License

ISC