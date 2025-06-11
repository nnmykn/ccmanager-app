# TaskFlow Test Questions for Claude

## Sample Questions to Ask Claude

1. **Configuration Question (Japanese)**
   ```
   構成について教えて下さい
   ```

2. **Architecture Overview**
   ```
   Explain the architecture of this project
   ```

3. **Code Help**
   ```
   How do I add a new feature to this codebase?
   ```

4. **Debugging**
   ```
   Help me debug the session management
   ```

5. **Documentation**
   ```
   What does this project do?
   ```

6. **Best Practices**
   ```
   What are the best practices for this project?
   ```

## How to Test

1. Start the app: `npm start`
2. Make sure Claude CLI is installed
3. Select a project from the dropdown
4. Select a branch (main, develop, etc.)
5. Enter one of the questions above
6. Click "Ask Claude"

## Expected Behavior

- Task shows "Starting" → "Running" → "Claude Ready/Working"
- Claude will analyze the project context
- Status updates in real-time
- Click on task to see Claude's response
- If Claude is not installed, you'll get an error message