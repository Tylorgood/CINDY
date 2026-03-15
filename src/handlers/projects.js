/**
 * PROJECTS HANDLER
 * Manages projects in Supabase
 */

import { v4 as uuidv4 } from 'uuid';

export class ProjectsHandler {
  constructor(storageAdapter) {
    this.storage = storageAdapter;
  }

  /**
   * Create a new project
   */
  async create(userId, params) {
    const { name } = params;
    
    if (!name) {
      return { success: false, message: 'What project should I create?' };
    }

    const project = {
      id: uuidv4(),
      userId,
      name,
      status: 'active',
      priority: 3,
      description: '',
      milestones: [],
      createdAt: new Date().toISOString()
    };

    await this.storage.create('projects', project);
    
    return { 
      success: true, 
      message: `📁 Project created: "${name}"` 
    };
  }

  /**
   * List all projects for a user
   */
  async list(userId) {
    const projects = await this.storage.query('projects', {
      eq: { userId },
      orderBy: { column: 'priority', direction: 'desc' }
    });

    if (!projects || projects.length === 0) {
      return {
        success: true,
        message: "You have no projects! 🎉",
        data: []
      };
    }

    const active = projects.filter(p => p.status === 'active');
    const paused = projects.filter(p => p.status === 'paused');
    const completed = projects.filter(p => p.status === 'completed');

    let message = "📁 Your Projects:\n\n";
    
    if (active.length > 0) {
      message += "🚀 Active:\n";
      active.forEach((project, i) => {
        const priorityEmoji = project.priority >= 4 ? '🔴' : project.priority >= 3 ? '🟡' : '🟢';
        message += `${priorityEmoji} ${project.name}\n`;
      });
      message += "\n";
    }
    
    if (paused.length > 0) {
      message += "⏸️ Paused:\n";
      paused.forEach((project, i) => {
        message += `• ${project.name}\n`;
      });
      message += "\n";
    }

    if (completed.length > 0) {
      message += `✅ Completed (${completed.length})`;
    }

    return {
      success: true,
      message,
      data: projects
    };
  }

  /**
   * Update project status
   */
  async updateStatus(userId, params) {
    const { projectId, status } = params;
    
    if (!projectId) {
      return { success: false, message: 'Which project number?' };
    }

    const projects = await this.storage.query('projects', {
      eq: { userId },
      orderBy: { column: 'createdAt', direction: 'desc' }
    });

    const projectIndex = parseInt(projectId) - 1;
    if (projectIndex < 0 || projectIndex >= projects.length) {
      return { success: false, message: 'Project not found.' };
    }

    await this.storage.update('projects', projects[projectIndex].id, {
      status,
      updatedAt: new Date().toISOString()
    });

    return { 
      success: true, 
      message: `Project updated to ${status}` 
    };
  }
}

export default ProjectsHandler;