const { ipcRenderer } = require('electron');

// Elements
const taskInput = document.getElementById('task-input');
const projectSelect = document.getElementById('project-select');
const branchSelect = document.getElementById('branch-select');
const submitBtn = document.getElementById('submit-btn');
const tasksList = document.getElementById('tasks-list');

// State
let projects = [];
let currentProject = null;

// Session tracking
const activeSessions = new Map();

// Initialize
init();

async function init() {
  await loadProjects();
  loadTasks();
  
  // Load saved project preference
  const savedProject = localStorage.getItem('lastProject');
  if (savedProject && projects.find(p => p.path === savedProject)) {
    projectSelect.value = savedProject;
    await onProjectChange();
  }
  
  // Set up IPC listeners for Claude session events
  setupSessionListeners();
}

function setupSessionListeners() {
  // Listen for session state changes
  ipcRenderer.on('session-state-change', (event, { sessionId, taskId, state }) => {
    console.log(`Session ${sessionId} state changed to: ${state}`);
    updateTaskState(taskId, state);
  });
  
  // Listen for session output
  ipcRenderer.on('session-output', (event, { sessionId, taskId, data }) => {
    // Store output for potential display
    if (!activeSessions.has(sessionId)) {
      activeSessions.set(sessionId, { output: '', taskId });
    }
    const session = activeSessions.get(sessionId);
    session.output += data;
    console.log(`Session ${sessionId} output:`, data);
  });
  
  // Listen for session errors
  ipcRenderer.on('session-error', (event, { sessionId, taskId, error }) => {
    console.error(`Session ${sessionId} error:`, error);
    updateTaskState(taskId, 'failed');
    alert(`Claude session error: ${error}`);
  });
}

async function updateTaskState(taskId, sessionState) {
  let taskStatus = 'Running';
  
  switch (sessionState) {
    case 'idle':
      taskStatus = 'Claude Ready';
      break;
    case 'busy':
      taskStatus = 'Claude Working';
      break;
    case 'waiting_input':
      taskStatus = 'Waiting Input';
      break;
    case 'finished':
      taskStatus = 'Finished';
      break;
    case 'failed':
      taskStatus = 'Failed';
      break;
  }
  
  await ipcRenderer.invoke('update-task-status', { id: taskId, status: taskStatus });
  loadTasks();
}

// Event listeners
submitBtn.addEventListener('click', submitTask);
taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitTask();
  }
});

projectSelect.addEventListener('change', onProjectChange);

// Settings button click handler
document.querySelector('.settings-btn').addEventListener('click', () => {
  const menu = document.createElement('div');
  menu.className = 'settings-menu';
  menu.innerHTML = `
    <div class="menu-item" id="clear-tasks">Clear All Tasks</div>
    <div class="menu-item" id="refresh-projects">Refresh Projects</div>
  `;
  
  document.body.appendChild(menu);
  
  menu.querySelector('#clear-tasks').addEventListener('click', async () => {
    if (confirm('Clear all tasks?')) {
      await ipcRenderer.invoke('clear-tasks');
      loadTasks();
    }
    menu.remove();
  });
  
  menu.querySelector('#refresh-projects').addEventListener('click', async () => {
    await loadProjects();
    menu.remove();
  });
  
  // Close menu when clicking outside
  setTimeout(() => {
    document.addEventListener('click', function closeMenu(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    });
  }, 0);
});

async function loadProjects() {
  projects = await ipcRenderer.invoke('scan-projects');
  
  projectSelect.innerHTML = '<option value="">Select a project...</option>';
  
  projects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.path;
    option.textContent = project.name;
    projectSelect.appendChild(option);
  });
}

async function onProjectChange() {
  const projectPath = projectSelect.value;
  if (!projectPath) {
    branchSelect.innerHTML = '<option value="">Select project first</option>';
    branchSelect.disabled = true;
    return;
  }
  
  currentProject = projects.find(p => p.path === projectPath);
  localStorage.setItem('lastProject', projectPath);
  
  // Load branches for selected project
  const branches = await ipcRenderer.invoke('get-branches', projectPath);
  
  branchSelect.innerHTML = '';
  branchSelect.disabled = false;
  
  branches.all.forEach(branch => {
    const option = document.createElement('option');
    option.value = branch;
    option.textContent = branch;
    if (branch === branches.current) {
      option.selected = true;
    }
    branchSelect.appendChild(option);
  });
}

async function submitTask() {
  const taskText = taskInput.value.trim();
  if (!taskText) return;
  
  if (!currentProject) {
    alert('Please select a project first');
    return;
  }
  
  const task = {
    text: taskText,
    project: currentProject.name,
    projectPath: currentProject.path,
    branch: branchSelect.value
  };
  
  const newTask = await ipcRenderer.invoke('add-task', task);
  taskInput.value = '';
  loadTasks();
  
  console.log('Submitting task:', newTask);
  
  // Execute the task immediately
  executeTask(newTask);
}

async function executeTask(task) {
  try {
    // Update status to executing
    await ipcRenderer.invoke('update-task-status', { id: task.id, status: 'Executing' });
    loadTasks();
    
    // Create Claude session
    const result = await ipcRenderer.invoke('create-claude-session', { 
      task, 
      projectPath: task.projectPath,
      projectName: task.project
    });
    
    if (result.success) {
      // Store session ID with task
      task.sessionId = result.sessionId;
      await ipcRenderer.invoke('update-task-status', { 
        id: task.id, 
        status: 'Running',
        sessionId: result.sessionId 
      });
      console.log('Claude session started:', result.sessionId);
    } else {
      await ipcRenderer.invoke('update-task-status', { id: task.id, status: 'Failed' });
      console.error('Failed to start Claude session:', result.error);
      alert(`Failed to start Claude session: ${result.error}`);
    }
  } catch (error) {
    console.error('Error starting Claude session:', error);
    await ipcRenderer.invoke('update-task-status', { id: task.id, status: 'Failed' });
    alert(`Error starting Claude session: ${error.message}`);
  }
  
  loadTasks();
}

async function loadTasks() {
  const tasks = await ipcRenderer.invoke('get-tasks');
  renderTasks(tasks);
}

function renderTasks(tasks) {
  tasksList.innerHTML = '';
  
  tasks.forEach(task => {
    const taskItem = createTaskElement(task);
    tasksList.appendChild(taskItem);
  });
}

function createTaskElement(task) {
  const div = document.createElement('div');
  div.className = 'task-item';
  
  const statusClass = task.status.toLowerCase().replace(' ', '-');
  const timeAgo = getTimeAgo(new Date(task.createdAt));
  
  div.innerHTML = `
    <div class="task-content">
      <div class="task-text">${task.text}</div>
      <div class="task-meta">
        <span class="task-project">${task.project || 'No project'}</span>
        <span class="task-branch">${task.branch || 'main'}</span>
      </div>
      <div class="task-status">
        <span class="status-icon ${statusClass}"></span>
        <span>${task.status}</span>
      </div>
    </div>
    <div class="task-time">${timeAgo}</div>
  `;
  
  div.addEventListener('click', async () => {
    if (task.status === 'Failed' || task.status === 'Starting') {
      // Re-execute failed or starting tasks
      executeTask(task);
    } else if (task.status.includes('Claude') || task.status === 'Running' || task.status === 'Waiting Input') {
      // Open terminal window for Claude session
      if (task.sessionId) {
        await ipcRenderer.invoke('open-terminal-window', {
          sessionId: task.sessionId,
          taskId: task.id,
          projectName: task.project
        });
      }
    } else if (task.projectPath) {
      // Open project in terminal
      ipcRenderer.invoke('open-in-terminal', task.projectPath);
    }
  });
  
  return div;
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  const intervals = {
    w: 604800,
    d: 86400,
    h: 3600,
    m: 60
  };
  
  for (const [unit, value] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / value);
    if (interval >= 1) {
      return `${interval}${unit} ago`;
    }
  }
  
  return 'just now';
}