/**
 * DialogueSession — manages a single conversation between the player
 * and an NPC, backed by the Claude API.
 */
export class DialogueSession {
  /**
   * @param {import('./character.js').Character} character
   * @param {string} playerName
   * @param {object} worldAiConfig  world.yaml `ai` block
   */
  constructor(character, playerName, worldAiConfig = {}) {
    this.character = character;
    this.player = playerName;
    this.model = worldAiConfig.model ?? 'claude-haiku-4-5-20251001';
    this.systemBase = worldAiConfig.system_prompt_base ?? '';
    this.history = [];
  }

  /**
   * Send a player message and return the character's reply.
   *
   * @param {string} message
   * @returns {Promise<string>}
   */
  async send(message) {
    // TODO: call Anthropic Messages API
    // System prompt = systemBase + character persona + knowledge
    // Messages = history + new user message
    // Append both turns to history, return assistant content
    throw new Error(
      'AI dialogue requires ANTHROPIC_API_KEY and full implementation.'
    );
  }

  clear() {
    this.history = [];
  }

  get systemPrompt() {
    return [
      this.systemBase,
      this.character.persona,
      this.character.knowledge,
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}
