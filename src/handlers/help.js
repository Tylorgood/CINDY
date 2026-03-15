/**
 * HELP HANDLER
 * Provides help and command suggestions
 */

export class HelpHandler {
  constructor(intentRouter) {
    this.intentRouter = intentRouter;
  }

  /**
   * Show help
   */
  show(params = {}) {
    const helpText = this.intentRouter.getHelpText();
    
    return {
      success: true,
      message: helpText,
      data: null
    };
  }

/**
 * Suggest commands when user input is unknown
 */
suggest(params = {}) {
  const { originalText } = params;
  
  return {
    success: false, // Signal that this wasn't understood
    message: `I didn't understand "${originalText}"\n\n${this.intentRouter.getHelpText()}`,
    data: null
  };
}
}

export default HelpHandler;