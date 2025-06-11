const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const Store = require('electron-store').default || require('electron-store');
const { exec } = require('child_process');
const gitService = require('./gitService');
const claudeSessionManager = require('./claudeSessionManager');

const store = new Store();

let tray = null;
let window = null;
let terminalWindows = new Map();

function createWindow() {
  window = new BrowserWindow({
    width: 450,
    height: 600,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  window.loadFile('index.html');
  
  // Open DevTools in development
  if (process.env.NODE_ENV !== 'production') {
    window.webContents.openDevTools({ mode: 'detach' });
  }

  window.on('blur', () => {
    if (!window.webContents.isDevToolsOpened()) {
      window.hide();
    }
  });
}

function createTray() {
  // Use template icon for macOS to support dark/light mode
  const iconName = process.platform === 'darwin' ? 'tray-iconTemplate.png' : 'tray-icon.png';
  const iconPath = path.join(__dirname, 'assets', iconName);
  
  // Create native image from path
  const icon = nativeImage.createFromPath(iconPath);
  
  // Ensure the icon is marked as a template for macOS
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }
  
  tray = new Tray(icon);
  
  tray.setToolTip('TaskFlow - Task Automation');
  
  tray.on('click', (event, bounds) => {
    const { x, y } = bounds;
    const { height, width } = window.getBounds();
    
    if (window.isVisible()) {
      window.hide();
    } else {
      window.setBounds({
        x: x - width / 2,
        y: process.platform === 'darwin' ? y : y - height,
        height,
        width
      });
      window.show();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for task management
ipcMain.handle('get-tasks', () => {
  return store.get('tasks', []);
});

ipcMain.handle('add-task', (event, task) => {
  const tasks = store.get('tasks', []);
  const newTask = {
    id: Date.now(),
    text: task.text,
    project: task.project,
    projectPath: task.projectPath,
    branch: task.branch,
    status: 'Starting',
    createdAt: new Date().toISOString()
  };
  tasks.unshift(newTask);
  store.set('tasks', tasks);
  return newTask;
});

ipcMain.handle('update-task-status', (event, { id, status, sessionId }) => {
  const tasks = store.get('tasks', []);
  const taskIndex = tasks.findIndex(t => t.id === id);
  if (taskIndex !== -1) {
    tasks[taskIndex].status = status;
    if (sessionId) {
      tasks[taskIndex].sessionId = sessionId;
    }
    store.set('tasks', tasks);
  }
  return tasks;
});

ipcMain.handle('clear-tasks', () => {
  store.set('tasks', []);
  return [];
});

// Prevent app from closing when window is closed
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// Hide dock icon on macOS
if (process.platform === 'darwin') {
  app.dock.hide();
}

// IPC handlers for git operations
ipcMain.handle('scan-projects', async () => {
  const projects = await gitService.scanForProjects();
  return projects;
});

ipcMain.handle('get-branches', async (event, projectPath) => {
  const branches = await gitService.getBranches(projectPath);
  return branches;
});

// IPC handler for creating Claude session
ipcMain.handle('create-claude-session', async (event, { task, projectPath, projectName }) => {
  console.log('Creating Claude session for:', projectName, 'in', projectPath);
  
  try {
    const session = claudeSessionManager.createSession(projectPath, projectName);
    
    // Set up session event handlers
    session.on('stateChange', (state) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send('session-state-change', { 
          sessionId: session.id, 
          taskId: task.id, 
          state 
        });
      }
    });
    
    session.on('data', (data) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send('session-output', { 
          sessionId: session.id, 
          taskId: task.id, 
          data 
        });
      }
    });
    
    session.on('error', (error) => {
      console.error('Session error:', error);
      if (window && !window.isDestroyed()) {
        window.webContents.send('session-error', { 
          sessionId: session.id, 
          taskId: task.id, 
          error: error.message 
        });
      }
    });
    
    // Store the initial prompt text with the task for later use
    task.initialPrompt = task.text;
    
    // Start the session - Claude CLI can accept initial prompt as argument
    session.start(task.text);
    
    return {
      success: true,
      sessionId: session.id,
      message: 'Claude session started'
    };
  } catch (error) {
    console.error('Failed to create Claude session:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// IPC handler for sending input to Claude session
ipcMain.handle('send-to-session', async (event, { sessionId, input }) => {
  const session = claudeSessionManager.getSession(sessionId);
  if (session) {
    session.write(input);
    return { success: true };
  }
  return { success: false, error: 'Session not found' };
});

// IPC handler for getting session output
ipcMain.handle('get-session-output', async (event, { sessionId }) => {
  const session = claudeSessionManager.getSession(sessionId);
  if (session) {
    return {
      success: true,
      output: session.getAllOutput(),
      state: session.state
    };
  }
  return { success: false, error: 'Session not found' };
});

// IPC handler for killing a session
ipcMain.handle('kill-session', async (event, { sessionId }) => {
  claudeSessionManager.killSession(sessionId);
  return { success: true };
});

// IPC handler for opening project in terminal
ipcMain.handle('open-in-terminal', async (event, projectPath) => {
  if (process.platform === 'darwin') {
    exec(`open -a Terminal "${projectPath}"`);
  }
});

// Clean up sessions on app quit
app.on('before-quit', () => {
  claudeSessionManager.killAllSessions();
});

// IPC handler for opening terminal window
ipcMain.handle('open-terminal-window', async (event, { sessionId, taskId, projectName }) => {
  // Check if terminal window already exists for this session
  if (terminalWindows.has(sessionId)) {
    const existingWindow = terminalWindows.get(sessionId);
    existingWindow.focus();
    return;
  }
  
  // Create new terminal window
  const terminalWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: `TaskFlow Terminal - ${projectName}`,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // Load terminal HTML with session info
  terminalWindow.loadFile('terminal.html', {
    query: {
      sessionId: sessionId.toString(),
      taskId: taskId.toString(),
      projectName: projectName
    }
  });
  
  // Store window reference
  terminalWindows.set(sessionId, terminalWindow);
  
  // Clean up on close
  terminalWindow.on('closed', () => {
    terminalWindows.delete(sessionId);
  });
});

// IPC listeners for terminal communication
ipcMain.on('subscribe-to-session', (event, { sessionId }) => {
  const session = claudeSessionManager.getSession(sessionId);
  if (!session) {
    console.error(`Session ${sessionId} not found`);
    return;
  }
  
  const terminalWindow = terminalWindows.get(sessionId);
  if (!terminalWindow) {
    console.error(`Terminal window for session ${sessionId} not found`);
    return;
  }
  
  // Forward session data to terminal window
  const dataHandler = (data) => {
    if (!terminalWindow.isDestroyed()) {
      terminalWindow.webContents.send('terminal-data', data);
    }
  };
  
  const stateHandler = (state) => {
    if (!terminalWindow.isDestroyed()) {
      terminalWindow.webContents.send('session-state-update', state);
    }
  };
  
  session.on('data', dataHandler);
  session.on('stateChange', stateHandler);
  
  // Send current state immediately
  terminalWindow.webContents.send('session-state-update', session.state);
  
  // Store handlers for cleanup
  terminalWindow.sessionHandlers = { dataHandler, stateHandler };
});

ipcMain.on('unsubscribe-from-session', (event, { sessionId }) => {
  const session = claudeSessionManager.getSession(sessionId);
  const terminalWindow = terminalWindows.get(sessionId);
  
  if (session && terminalWindow && terminalWindow.sessionHandlers) {
    session.removeListener('data', terminalWindow.sessionHandlers.dataHandler);
    session.removeListener('stateChange', terminalWindow.sessionHandlers.stateHandler);
  }
});

ipcMain.on('terminal-input', (event, { sessionId, input }) => {
  const session = claudeSessionManager.getSession(sessionId);
  if (session) {
    session.write(input);
  } else {
    console.error(`Session ${sessionId} not found!`);
  }
});