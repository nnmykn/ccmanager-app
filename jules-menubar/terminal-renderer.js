const { ipcRenderer } = require('electron');

// Terminal setup
const term = new Terminal({
  theme: {
    background: '#1a1a1a',
    foreground: '#ffffff',
    cursor: '#7b61ff',
    selection: 'rgba(123, 97, 255, 0.3)',
    black: '#000000',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#bfbfbf',
    brightBlack: '#4d4d4d',
    brightRed: '#ff6e67',
    brightGreen: '#5af78e',
    brightYellow: '#f4f99d',
    brightBlue: '#caa9fa',
    brightMagenta: '#ff92d0',
    brightCyan: '#9aedfe',
    brightWhite: '#e6e6e6'
  },
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 14,
  lineHeight: 1.2,
  scrollback: 10000,
  cursorBlink: true
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);

// Get session info from URL params
const urlParams = new URLSearchParams(window.location.search);
const sessionId = parseInt(urlParams.get('sessionId'));
const taskId = parseInt(urlParams.get('taskId'));
const projectName = urlParams.get('projectName') || 'Unknown Project';

// Initialize
document.getElementById('project-name').textContent = projectName;

// Open terminal
term.open(document.getElementById('terminal'));
fitAddon.fit();

// Handle direct keyboard input to terminal
term.onData((data) => {
  // Send keyboard input directly to Claude session
  ipcRenderer.send('terminal-input', { sessionId, input: data });
});

// Elements
const statusEl = document.getElementById('session-status');
const inputArea = document.getElementById('input-area');
const terminalInput = document.getElementById('terminal-input');
const sendBtn = document.getElementById('send-btn');
const clearBtn = document.getElementById('clear-btn');
const closeBtn = document.getElementById('close-btn');

// Load existing output and task text
loadSessionOutput();

// Show task text if available
ipcRenderer.invoke('get-tasks').then(tasks => {
  const task = tasks.find(t => t.id === taskId);
  if (task && task.text) {
    // Show task text at the top with a nice banner
    const taskBanner = `\x1b[1;36m📝 Task: ${task.text}\x1b[0m\n\x1b[1;30m${'─'.repeat(Math.min(80, task.text.length + 9))}\x1b[0m\n\n`;
    term.write(taskBanner);
  }
});

// Set up IPC listeners
ipcRenderer.on('terminal-data', (event, data) => {
  term.write(data);
});

ipcRenderer.on('session-state-update', (event, state) => {
  updateStatus(state);
});

// Send input
function sendInput() {
  const input = terminalInput.value.trim();
  if (!input) return;
  
  ipcRenderer.send('terminal-input', { sessionId, input: input + '\n' });
  terminalInput.value = '';
}

sendBtn.addEventListener('click', sendInput);
terminalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendInput();
  }
});

// Clear terminal
clearBtn.addEventListener('click', () => {
  term.clear();
});

// Close window
closeBtn.addEventListener('click', () => {
  window.close();
});

// Update status
function updateStatus(state) {
  statusEl.textContent = state;
  statusEl.className = 'session-status';
  
  switch(state) {
    case 'idle':
    case 'Claude Ready':
      statusEl.classList.add('status-idle');
      inputArea.style.display = 'block';
      break;
    case 'busy':
    case 'Claude Working':
      statusEl.classList.add('status-busy');
      inputArea.style.display = 'none';
      break;
    case 'waiting_input':
    case 'Waiting Input':
      statusEl.classList.add('status-waiting');
      inputArea.style.display = 'block';
      break;
    default:
      inputArea.style.display = 'none';
  }
}

// Load existing session output
async function loadSessionOutput() {
  const result = await ipcRenderer.invoke('get-session-output', { sessionId });
  
  if (result.success && result.output) {
    term.write(result.output);
    updateStatus(result.state);
  }
}

// Handle resize
window.addEventListener('resize', () => {
  fitAddon.fit();
});

// Subscribe to this session's updates
ipcRenderer.send('subscribe-to-session', { sessionId });

// Clean up on close
window.addEventListener('beforeunload', () => {
  ipcRenderer.send('unsubscribe-from-session', { sessionId });
});

// Show tip on first load
const tip = document.getElementById('terminal-tip');
setTimeout(() => {
  tip.classList.add('show');
  setTimeout(() => {
    tip.classList.remove('show');
  }, 3000);
}, 1000);

// Focus terminal
term.focus();