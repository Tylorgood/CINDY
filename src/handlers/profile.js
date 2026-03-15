/**
 * PROFILE HANDLER
 * Manages user profile in Supabase
 */

export class ProfileHandler {
  constructor(storageAdapter) {
    this.storage = storageAdapter;
  }

  /**
   * Get user profile
   */
  async get(userId) {
    const profiles = await this.storage.query('profiles', {
      eq: { userId },
      limit: 1
    });

    if (!profiles || profiles.length === 0) {
      return {
        success: true,
        message: "I don't have your profile yet. I can learn about you when you tell me things!",
        data: null
      };
    }

    const profile = profiles[0];
    
    let message = "👤 Your Profile:\n\n";
    if (profile.name) message += `Name: ${profile.name}\n`;
    if (profile.email) message += `Email: ${profile.email}\n`;
    if (profile.phone) message += `Phone: ${profile.phone}\n`;
    if (profile.timezone) message += `Timezone: ${profile.timezone}\n`;
    
    if (profile.preferences && Object.keys(profile.preferences).length > 0) {
      message += "\nPreferences:\n";
      for (const [key, value] of Object.entries(profile.preferences)) {
        message += `• ${key}: ${value}\n`;
      }
    }

    return {
      success: true,
      message,
      data: profile
    };
  }

  /**
   * Update profile
   */
  async update(userId, params) {
    const { name, email, phone, timezone } = params;
    
    const profiles = await this.storage.query('profiles', {
      eq: { userId },
      limit: 1
    });

    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;
    if (phone) updates.phone = phone;
    if (timezone) updates.timezone = timezone;
    updates.updatedAt = new Date().toISOString();

    if (profiles && profiles.length > 0) {
      await this.storage.update('profiles', profiles[0].id, updates);
    } else {
      await this.storage.create('profiles', {
        userId,
        ...updates,
        createdAt: new Date().toISOString()
      });
    }

    return { 
      success: true, 
      message: "Profile updated!" 
    };
  }

  /**
   * Get or create user context (combines profile + stats)
   */
  async getContext(userId) {
    const profileResult = await this.get(userId);
    
    // Get task count
    const tasks = await this.storage.query('tasks', {
      eq: { userId }
    });
    const pendingTasks = tasks?.filter(t => t.status === 'pending').length || 0;
    
    // Get project count
    const projects = await this.storage.query('projects', {
      eq: { userId }
    });
    const activeProjects = projects?.filter(p => p.status === 'active').length || 0;

    // Get memory count
    const memories = await this.storage.query('memories', {
      eq: { userId }
    });
    const memoryCount = memories?.length || 0;

    return {
      profile: profileResult.data,
      stats: {
        pendingTasks,
        activeProjects,
        memoryCount
      }
    };
  }
}

export default ProfileHandler;