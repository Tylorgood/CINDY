/**
 * TASKS HANDLER
 * Manages tasks in Supabase.
 */

import { v4 as uuidv4 } from 'uuid';

export class TasksHandler {
  constructor(storageAdapter) {
    this.storage = storageAdapter;
  }

  async getSortedTasks(userId) {
    return await this.storage.query('tasks', {
      eq: { userId },
      orderBy: { column: 'createdAt', direction: 'desc' }
    });
  }

  getActionableTasks(tasks) {
    return tasks.filter(task => task.status === 'pending' || task.status === 'in_progress');
  }

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
      message: `Task added: "${title}"`
    };
  }

  async list(userId) {
    const tasks = await this.getSortedTasks(userId);

    if (!tasks || tasks.length === 0) {
      return {
        success: true,
        message: 'You have no tasks.',
        data: []
      };
    }

    const pending = tasks.filter(task => task.status === 'pending');
    const inProgress = tasks.filter(task => task.status === 'in_progress');
    const completed = tasks.filter(task => task.status === 'completed');

    let message = 'Your tasks:\n\n';
    let visibleIndex = 1;

    if (pending.length > 0) {
      message += 'Pending:\n';
      pending.forEach(task => {
        message += `${visibleIndex}. ${task.title}\n`;
        visibleIndex += 1;
      });
      message += '\n';
    }

    if (inProgress.length > 0) {
      message += 'In progress:\n';
      inProgress.forEach(task => {
        message += `${visibleIndex}. ${task.title}\n`;
        visibleIndex += 1;
      });
      message += '\n';
    }

    if (completed.length > 0) {
      message += `Completed: ${completed.length}`;
    }

    return {
      success: true,
      message: message.trimEnd(),
      data: tasks
    };
  }

  async complete(userId, params) {
    const { taskId } = params;

    if (!taskId) {
      return { success: false, message: 'Which task number?' };
    }

    const tasks = this.getActionableTasks(await this.getSortedTasks(userId));

    const taskIndex = parseInt(taskId, 10) - 1;
    if (taskIndex < 0 || taskIndex >= tasks.length) {
      return {
        success: false,
        message: 'Task not found. Use "show my tasks" to see the current numbers.'
      };
    }

    const task = tasks[taskIndex];

    await this.storage.update('tasks', task.id, {
      status: 'completed',
      updatedAt: new Date().toISOString()
    });

    return {
      success: true,
      message: `Completed: "${task.title}"`
    };
  }

  async delete(userId, params) {
    const { taskId } = params;

    if (!taskId) {
      return { success: false, message: 'Which task number?' };
    }

    const tasks = this.getActionableTasks(await this.getSortedTasks(userId));

    const taskIndex = parseInt(taskId, 10) - 1;
    if (taskIndex < 0 || taskIndex >= tasks.length) {
      return { success: false, message: 'Task not found.' };
    }

    await this.storage.delete('tasks', tasks[taskIndex].id);

    return {
      success: true,
      message: 'Task deleted.'
    };
  }
}

export default TasksHandler;
