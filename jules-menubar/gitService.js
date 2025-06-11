const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class GitService {
  constructor() {
    this.projectPaths = [];
  }

  async scanForProjects() {
    const homePath = os.homedir();
    const commonPaths = [
      path.join(homePath, 'Documents'),
      path.join(homePath, 'Projects'),
      path.join(homePath, 'Development'),
      path.join(homePath, 'dev'),
      path.join(homePath, 'repos'),
      path.join(homePath, 'SynologyDrive', 'DEVELOP'),
      path.join(homePath, 'Desktop'),
      '/Users/ninomiyakan/SynologyDrive/DEVELOP'
    ];

    const projects = [];
    
    for (const basePath of commonPaths) {
      try {
        await fs.access(basePath);
        const foundProjects = await this.findGitRepos(basePath, 3);
        projects.push(...foundProjects);
      } catch (err) {
        // Path doesn't exist, skip it
      }
    }

    // Remove duplicates and sort
    const uniqueProjects = [...new Map(projects.map(p => [p.path, p])).values()];
    return uniqueProjects.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findGitRepos(dirPath, maxDepth = 3, currentDepth = 0) {
    const repos = [];
    
    if (currentDepth >= maxDepth) return repos;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') && entry.name !== '.git') continue;
        if (entry.name === 'node_modules' || entry.name === 'Library') continue;
        
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.name === '.git') {
          // Found a git repo, add parent directory
          const parentPath = path.dirname(dirPath);
          const projectName = path.basename(parentPath);
          repos.push({
            name: projectName,
            path: parentPath
          });
          break; // Don't search deeper in git repos
        } else {
          // Check if this directory contains .git
          try {
            await fs.access(path.join(fullPath, '.git'));
            repos.push({
              name: entry.name,
              path: fullPath
            });
          } catch {
            // Not a git repo, search deeper
            const subRepos = await this.findGitRepos(fullPath, maxDepth, currentDepth + 1);
            repos.push(...subRepos);
          }
        }
      }
    } catch (err) {
      // Permission denied or other error, skip
    }
    
    return repos;
  }

  async getBranches(projectPath) {
    try {
      const git = simpleGit(projectPath);
      const branches = await git.branchLocal();
      return {
        current: branches.current,
        all: branches.all
      };
    } catch (err) {
      console.error('Error getting branches:', err);
      return {
        current: 'main',
        all: ['main']
      };
    }
  }

  async getCurrentBranch(projectPath) {
    try {
      const git = simpleGit(projectPath);
      const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
      return branch.trim();
    } catch (err) {
      return 'main';
    }
  }
}

module.exports = new GitService();