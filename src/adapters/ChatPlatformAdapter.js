/**
 * Interface for Chat Platform Adapters
 * Each platform (ChatGPT, Gemini, Grok) must implement this interface
 */
export class ChatPlatformAdapter {
  constructor() {
    this.name = 'unknown';
  }

  /**
   * Check if the current page is supported by this adapter
   * @returns {boolean}
   */
  static isSupported() {
    return false;
  }

  /**
   * Initialize the adapter (wait for page load, inject styles, etc.)
   * @returns {Promise<void>}
   */
  async init() {
    throw new Error('Not implemented');
  }

  /**
   * Get the unique ID of the current conversation
   * @returns {string|null}
   */
  getConversationId() {
    throw new Error('Not implemented');
  }

  /**
   * Get the list of questions/turns in the conversation
   * @returns {Array<{id: string, index: number, text: string, element: HTMLElement}>}
   */
  getQuestions() {
    throw new Error('Not implemented');
  }

  /**
   * Scroll to a specific message/turn
   * @param {string} id - The message ID
   * @param {number} index - The index in the list
   */
  scrollToMessage(id, index) {
    throw new Error('Not implemented');
  }

  /**
   * Observe URL changes to reload data
   * @param {Function} callback 
   */
  onUrlChange(callback) {
    throw new Error('Not implemented');
  }

  /**
   * Observe content changes (new messages) to reload data
   * @param {Function} callback 
   */
  onContentChange(callback) {
    throw new Error('Not implemented');
  }

  /**
   * Extract conversation content for saving/exporting
   * @param {Array<string>} messageIds - List of message IDs to extract
   * @returns {Promise<Array<Object>>} - Formatted conversation data
   */
  async extractConversationContent(messageIds) {
    throw new Error('Not implemented');
  }
}
