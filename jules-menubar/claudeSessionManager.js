const { spawn } = require('node-pty');
const EventEmitter = require('events');

class ClaudeSession extends EventEmitter {
  constructor(id, projectPath, projectName) {
    super();
    this.id = id;
    this.projectPath = projectPath;
    this.projectName = projectName;
    this.pty = null;
    this.output = '';
    this.outputHistory = []; // Store as array of strings for easier handling
    this.state = 'starting'; // starting, idle, busy, waiting_input, finished
    this.buffer = [];
    this.lastActivity = Date.now();
    this.isActive = false;
  }

  start(initialPrompt = null) {
    try {
      // Try different claude command locations
      const possiblePaths = [
        process.env.HOME + '/.claude/local/claude',  // User's actual claude location
        '/usr/local/bin/claude',
        '/opt/homebrew/bin/claude',
        process.env.HOME + '/.local/bin/claude',
        'claude'
      ];
      
      let claudeCommand = 'claude';
      
      // Find the first available claude command
      const { execSync } = require('child_process');
      const fs = require('fs');
      
      // First, try to resolve alias/actual path using shell
      try {
        const resolvedPath = execSync('echo -n "$(/bin/zsh -i -c "which claude 2>/dev/null")"', { encoding: 'utf8' }).trim();
        if (resolvedPath && resolvedPath.includes('aliased to')) {
          // Extract actual path from alias output
          const match = resolvedPath.match(/aliased to (.+)$/);
          if (match && match[1]) {
            const aliasPath = match[1].trim();
            if (fs.existsSync(aliasPath)) {
              claudeCommand = aliasPath;
              console.log(`Found Claude via alias at: ${aliasPath}`);
            }
          }
        } else if (resolvedPath && fs.existsSync(resolvedPath)) {
          claudeCommand = resolvedPath;
          console.log(`Found Claude at: ${resolvedPath}`);
        }
      } catch (e) {
        // If shell resolution fails, try other paths
        console.log('Could not resolve claude via shell, trying other paths...');
      }
      
      // If not found via shell, try known paths
      if (claudeCommand === 'claude') {
        for (const path of possiblePaths) {
          try {
            if (path.startsWith('/') && fs.existsSync(path)) {
              // Check if it's executable
              fs.accessSync(path, fs.constants.X_OK);
              claudeCommand = path;
              console.log(`Found Claude at: ${path}`);
              break;
            }
          } catch (e) {
            // Continue to next path
          }
        }
      }

      console.log('Using claude command:', claudeCommand);
      
      // Store initial prompt for display in terminal
      this.initialPrompt = initialPrompt;

      // Build command arguments - pass initial prompt as positional argument
      const args = initialPrompt ? [initialPrompt] : [];
      
      console.log('Starting Claude with args:', args);

      // Start Claude with initial prompt if provided
      this.pty = spawn(claudeCommand, args, {
        name: 'xterm-color',
        cols: 100,
        rows: 30,
        cwd: this.projectPath,
        env: { 
          ...process.env, 
          TERM: 'xterm-256color',
          PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:' + process.env.PATH,
          // Ensure proper terminal settings
          LC_ALL: 'en_US.UTF-8',
          LANG: 'en_US.UTF-8',
          // Disable mouse mode which might interfere
          MOUSE_MODE: '0'
        },
        // Handle signals properly
        handleFlowControl: true
      });

      console.log(`Claude PTY started with PID: ${this.pty.pid}`);
      
      // If there's an initial prompt, show it to the user
      if (initialPrompt) {
        console.log(`Task: "${initialPrompt}"`);
      }

      this.pty.onData((data) => {
        // Store output for session restoration
        this.output += data;
        this.outputHistory.push(data);
        
        // Limit history size to prevent memory issues
        const maxHistorySize = 10 * 1024 * 1024; // 10MB
        let totalSize = this.outputHistory.reduce((sum, chunk) => sum + chunk.length, 0);
        while (totalSize > maxHistorySize && this.outputHistory.length > 0) {
          const removed = this.outputHistory.shift();
          totalSize -= removed.length;
        }
        
        this.buffer.push(data);
        this.lastActivity = Date.now();
        this.updateState(data);
        
        // Always emit data event for terminal display
        this.emit('data', data);
        
        // Log only important events
        // Commented out verbose logging
      });

      this.pty.onExit(({ exitCode, signal }) => {
        console.log(`Claude PTY exited with code ${exitCode}, signal ${signal}`);
        this.state = 'finished';
        this.emit('exit', { exitCode, signal });
      });

      // Don't automatically set to idle - let updateState handle it based on actual output
      
      // Auto-respond to trust prompt
      let hasRespondedToTrust = false;
      const trustHandler = (data) => {
        const dataStr = data.toString();
        if (!hasRespondedToTrust && dataStr.includes('Do you trust the files in this folder?')) {
          console.log('Auto-responding to trust prompt...');
          hasRespondedToTrust = true;
          // Send "1" to select "Yes, proceed" - just newline for Unix terminals
          setTimeout(() => {
            this.write('1\n');
          }, 500);
        }
      };
      
      this.on('data', trustHandler);
      
      // Remove handler after 10 seconds
      setTimeout(() => {
        this.removeListener('data', trustHandler);
      }, 10000);

    } catch (error) {
      console.error('Failed to start Claude session:', error);
      this.state = 'failed';
      
      // Try to provide more specific error message
      let errorMessage = 'Failed to start Claude session';
      if (error.message.includes('ENOENT')) {
        errorMessage = 'Claude command not found. Please make sure Claude Code is installed and accessible in PATH';
      } else {
        errorMessage = `Claude session error: ${error.message}`;
      }
      
      this.emit('error', new Error(errorMessage));
      this.emit('data', `\r\n\x1b[31mError: ${errorMessage}\x1b[0m\r\n`);
    }
  }

  updateState(data) {
    const dataStr = data.toString();
    const previousState = this.state;
    
    // Strip ANSI codes for more reliable pattern matching
    const cleanStr = dataStr.replace(/\x1b\[[0-9;]*m/g, '');
    
    // Detect different states based on output
    if (cleanStr.match(/esc\s+to\s+interrupt/i) || cleanStr.includes('Thinking...')) {
      this.state = 'busy';
      this.lastBusyTime = Date.now();
    } else if (cleanStr.includes('Do you want') || cleanStr.match(/\?\s*\(y\/n\)/)) {
      this.state = 'waiting_input';
    } else if (cleanStr.includes('Do you trust the files in this folder?')) {
      // Still in starting state during trust prompt
      this.state = 'starting';
      return;
    } else if (this.detectPromptBoxBottomBorder(cleanStr) || this.detectClaudePrompt(cleanStr)) {
      // Claude is ready when we see the prompt box bottom border OR the actual prompt
      // But only if we're not in a waiting state
      if (this.state !== 'waiting_input' && this.state !== 'busy') {
        this.state = 'idle';
      }
    } else if (this.state === 'busy' && !cleanStr.match(/esc\s+to\s+interrupt/i)) {
      // Was busy but no longer seeing busy indicator
      // Use a timer to prevent flickering
      if (this.busyToIdleTimer) {
        clearTimeout(this.busyToIdleTimer);
      }
      this.busyToIdleTimer = setTimeout(() => {
        if (this.state === 'busy' && Date.now() - this.lastBusyTime > 500) {
          this.state = 'idle';
          this.emit('stateChange', this.state);
        }
      }, 500);
      return; // Don't emit state change yet
    } else if (this.state === 'starting') {
      // Check if Claude has finished starting and is showing the prompt
      // Look for patterns that indicate Claude is ready for input
      if (cleanStr.includes('─╯') || cleanStr.includes('? for shortcuts')) {
        this.state = 'idle';
      }
    }
    
    // Only emit state change if state actually changed
    if (previousState !== this.state) {
      console.log(`Session ${this.id} state changed from ${previousState} to ${this.state}`);
      this.emit('stateChange', this.state);
    }
  }
  
  detectPromptBoxBottomBorder(str) {
    // Check for prompt box bottom border patterns
    const lines = str.split('\n');
    for (const line of lines) {
      // Look for lines ending with ╯ that are not followed by │
      if (line.match(/─+╯$/) || line.match(/^╰─+╯$/)) {
        // Make sure this isn't part of a box side
        const nextCharIndex = str.indexOf(line) + line.length;
        if (nextCharIndex < str.length && str[nextCharIndex] !== '│') {
          return true;
        }
      }
    }
    return false;
  }
  
  detectClaudePrompt(str) {
    // Check for Claude's input prompt patterns
    // Common patterns: "> ", "claude> ", "Claude> ", or lines with prompt-like indicators
    const promptPatterns = [
      /^\s*>\s*$/m,           // Just "> " on its own line
      /^\s*claude>\s*$/mi,    // "claude> " (case insensitive)
      /^\s*Claude>\s*$/m,     // "Claude> "
      /│\s*>\s*$/m,           // Prompt box with "> "
      /Enter to confirm/i,    // Common prompt indicator
    ];
    
    return promptPatterns.some(pattern => pattern.test(str));
  }

  write(data) {
    if (this.pty && !this.pty.killed) {
      try {
        this.pty.write(data);
      } catch (error) {
        console.error(`Failed to write to PTY:`, error);
      }
    }
  }

  resize(cols, rows) {
    if (this.pty && !this.pty.killed) {
      this.pty.resize(cols, rows);
    }
  }

  kill() {
    if (this.pty && !this.pty.killed) {
      this.pty.kill();
    }
  }

  getRecentOutput(lines = 50) {
    if (lines === -1) {
      // Return full output history
      return this.outputHistory.join('');
    }
    const outputLines = this.output.split('\n');
    return outputLines.slice(-lines).join('\n');
  }
  
  getAllOutput() {
    return this.outputHistory.join('');
  }
}

class ClaudeSessionManager {
  constructor() {
    this.sessions = new Map();
    this.sessionsByPath = new Map();
  }

  createSession(projectPath, projectName) {
    const id = Date.now();
    const session = new ClaudeSession(id, projectPath, projectName);
    this.sessions.set(id, session);
    this.sessionsByPath.set(projectPath, session);
    return session;
  }

  getSession(id) {
    // Convert to number if string
    const numId = typeof id === 'string' ? parseInt(id) : id;
    return this.sessions.get(numId);
  }
  
  getSessionByPath(projectPath) {
    return this.sessionsByPath.get(projectPath);
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  killSession(id) {
    const session = this.sessions.get(id);
    if (session) {
      session.kill();
      this.sessions.delete(id);
      this.sessionsByPath.delete(session.projectPath);
    }
  }

  killAllSessions() {
    for (const session of this.sessions.values()) {
      session.kill();
    }
    this.sessions.clear();
    this.sessionsByPath.clear();
  }
}

module.exports = new ClaudeSessionManager();