/**
 * TASKS HANDLER
 * Manages tasks in Supabase
 */

import { v4 as uuidv4 } from 'uuid';

export class TasksHandler {
  constructor(storageAdapter) {
    this.storage = storageAdapter;
  }

  /**
   * Create a new task
   */
  async create(userId, params) {
    const { title } = params;
    
    if (!title) {
      return { success: false, message: 'What task should I add?' };
    }

    const task = {
      id: uuidv4(),
      userId,
      title,
      description: '',
      status: 'pending',
      priority: 3,
      createdAt: new Date().toISOString()
    };

    await this.storage.create('tasks', task);
    
    return { 
      success: true, 
      message: `✅ Task added: "${title}"` 
    };
  }

  /**
   * List all tasks for a user
   */
  async list(userId) {
    const tasks = await this.storage.query('tasks', {
      eq: { userId },
      orderBy: { column: 'createdAt', direction: 'desc' }
    });

    if (!tasks || tasks.length === 0) {
      return {
        success: true,
        message: "You have no tasks! 🎉",
        data: []
      };
    }

    const pending = tasks.filter(t => t.status === 'pending');
    const inProgress = tasks.filter(t => t.status === 'in_progress');
    const completed = tasks.filter(t => t.status === 'completed');

    let message = "📋 Your Tasks:\n\n";
    
    if (pending.length > 0) {
      message += "⏳ Pending:\n";
      pending.forEach((task, i) => {
        message += `${i + 1}. ${task.title}\n`;
      });
      message += "\n";
    }
    
    if (inProgress.length > 0) {
      message += "🔄 In Progress:\n";
      inProgress.forEach((task, i) => {
        message += `${i + 1}. ${task.title}\n`;
      });
      message += "\n";
    }

    if (completed.length > 0) {
      message += `✅ Completed (${completed.length})`;
    }

    return {
      success: true,
      message,
      data: tasks
    };
  }

  /**
   * Mark a task as complete
   */
  async complete(userId, params) {
    const { taskId } = params;
    
    if (!taskId) {
      return { success: false, message: 'Which task number?' };
    }

    // Get tasks to find by index
    const tasks = await this.storage.query('tasks', {
      eq: { userId },
      orderBy: { column: 'createdAt', direction: 'desc' }
    });

    const taskIndex = parseInt(taskId) - 1;
    if (taskIndex < 0 || taskIndex >= tasks.length) {
      return { success: false, message: 'Task not found. Use "show my tasks" to see numbers.' };
    }

    const task = tasks[taskIndex];
    
    await this.storage.update('tasks', task.id, {
      status: 'completed',
      updatedAt: new Date().toISOString()
    });

    return { 
      success: true, 
      message: `✅ Completed: "${task.title}"` 
    };
  }

  /**
   * Delete a task
   */
  async delete(userId, params) {
    const { taskId } = params;
    
    if (!taskId) {
      return { success: false, message: 'Which task number?' };
    }

    const tasks = await this.storage.query('tasks', {
      eq: { userId },
      orderBy: { column: 'createdAt', direction: 'desc' }
    });

    const taskIndex = parseInt(taskId) - 1;
    if (taskIndex < 0 || taskIndex >= tasks.length) {
      return { success: false, message: 'Task not found.' };
    }

    await this.storage.delete('tasks', tasks[taskIndex].id);

    return { 
      success: true, 
      message: `🗑️ Task deleted` 
    };
  }
}

export default TasksHandler;