/** Maximum number of messages kept verbatim in the conversation history. */
const MAX_VERBATIM = 12;

/**
 * DialogueSession — manages a single conversation between the player
 * and an NPC, backed by the OpenAI API.
 *
 * Memory model:
 *   - The last MAX_VERBATIM messages are kept verbatim and sent with every request.
 *   - Anything older is distilled into a rolling `this.summary` via a background
 *     API call. The summary is injected into the system prompt and the choices
 *     prompt so both character replies and player choices stay contextually aware.
 */
export class DialogueSession {
  /**
   * @param {import('./character.js').Character} character
   * @param {string} playerName
   * @param {object} worldAiConfig  world.yaml `ai` block
   * @param {string} playerPersonality
   */
  constructor(character, playerName, worldAiConfig = {}, playerPersonality = '') {
    this.character         = character;
    this.player            = playerName;
    this.playerPersonality = playerPersonality;
    this.model             = worldAiConfig.model ?? 'gpt-4o-mini';
    this.systemBase        = worldAiConfig.system_prompt_base ?? '';
    this.dialogueRules     = worldAiConfig.dialogueRules ?? null;
    this.history           = [];   // verbatim messages (capped at MAX_VERBATIM)
    this.summary           = '';   // rolling summary of archived messages
    this._apiKey           = import.meta.env.VITE_OPENAI_API_KEY ?? '';
    this._pendingSummarize = null; // background summarization promise
  }

  /**
   * Send a player message and return the character's reply.
   *
   * @param {string} message
   * @returns {Promise<string>}
   */
  async send(message) {
    if (!this._apiKey) {
      throw new Error('OpenAI API key not configured. Add VITE_OPENAI_API_KEY to your .env file.');
    }

    // Ensure any background summarization from the previous turn is done
    // before we build the next prompt, so the summary is up to date.
    if (this._pendingSummarize) {
      await this._pendingSummarize;
      this._pendingSummarize = null;
    }

    this.history.push({ role: 'user', content: message });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          ...this._formattedHistory,
        ],
        max_tokens: 280,
        temperature: 0.85,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      this.history.pop();
      throw new Error(`OpenAI error ${response.status}: ${err.error?.message ?? 'unknown'}`);
    }

    const data  = await response.json();
    const reply = data.choices[0].message.content.trim();
    this.history.push({ role: 'assistant', content: reply });

    // If history has grown past the verbatim window, archive the overflow
    // into the rolling summary in the background. The reply is returned
    // immediately — summarization completes before the next send().
    if (this.history.length > MAX_VERBATIM) {
      this._pendingSummarize = this._trimAndSummarize();
    }

    return reply;
  }

  /**
   * Generate 3 short dialogue choice options for the player.
   * Includes the rolling summary and recent history so choices stay
   * consistent with everything that has happened in the conversation.
   *
   * @param {string} characterMessage  The character's latest message
   * @returns {Promise<string[]>}      Array of 3 player response strings
   */
  async generateChoices(characterMessage) {
    if (!this._apiKey) {
      return ['Tell me more.', 'I see.', 'What do you mean?'];
    }

    // Build a context block from the summary + last few exchanges
    const contextParts = [];
    if (this.summary) {
      contextParts.push(`Prior conversation summary:\n${this.summary}`);
    }
    // Include the last 6 messages (3 exchanges) before the latest reply
    const recentSlice = this.history.slice(-7, -1); // exclude the very last assistant msg
    if (recentSlice.length > 0) {
      const lines = recentSlice.map(m =>
        `${m.role === 'user' ? this.player : (this.character.name ?? 'Character')}: ${m.content}`
      ).join('\n');
      contextParts.push(`Recent exchange:\n${lines}`);
    }
    const contextBlock = contextParts.length
      ? contextParts.join('\n\n') + '\n\n'
      : '';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              `You generate player dialogue choices for a narrative RPG.\n\n` +
              `The character being spoken to:\n${this.character.persona}\n\n` +
              (this.playerPersonality
                ? `The player character's personality:\n${this.playerPersonality}\n\nChoices must feel consistent with the player's personality while still offering tonal variety.\n\n`
                : '') +
              `${contextBlock}` +
              `Generate exactly 3 short, distinct things the player could say aloud in response. ` +
              `Each should be 1–2 sentences of spoken words only — no actions, no narration, no asterisks. ` +
              `Vary the tone (e.g. curious, cautious, bold, deflecting, provocative). ` +
              `Choices must feel like a natural continuation of the conversation so far. ` +
              `Return a JSON object: { "choices": ["...", "...", "..."] }`,
          },
          {
            role: 'user',
            content: `The character just said: "${characterMessage}"\n\nGenerate 3 player response choices as JSON.`,
          },
        ],
        max_tokens: 220,
        temperature: 0.9,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      return ['Tell me more.', 'I see.', 'What do you mean?'];
    }

    try {
      const data   = await response.json();
      const parsed = JSON.parse(data.choices[0].message.content);
      if (Array.isArray(parsed.choices)) return parsed.choices.slice(0, 3);
      const arr = Object.values(parsed).find(v => Array.isArray(v));
      return arr ? arr.slice(0, 3) : ['Tell me more.', 'I see.', 'What do you mean?'];
    } catch {
      return ['Tell me more.', 'I see.', 'What do you mean?'];
    }
  }

  clear() {
    this.history           = [];
    this.summary           = '';
    this._pendingSummarize = null;
  }

  // ── Memory management ────────────────────────────────────────────────────────

  /**
   * Splice the overflow messages out of `this.history` and fold them
   * into the rolling summary via a background API call.
   */
  async _trimAndSummarize() {
    const overflow = this.history.length - MAX_VERBATIM;
    if (overflow <= 0) return;

    const toArchive = this.history.splice(0, overflow);
    try {
      this.summary = await this._buildSummary(toArchive, this.summary);
    } catch (err) {
      // On failure leave the existing summary unchanged; don't lose history silently
      console.warn('[dialogue] summarization failed, old summary retained:', err);
      // Put the messages back so nothing is lost
      this.history.unshift(...toArchive);
    }
  }

  /**
   * Call the API to produce an updated rolling summary.
   *
   * @param {Array<{role:string,content:string}>} messages  Messages to archive
   * @param {string} existingSummary
   * @returns {Promise<string>}
   */
  async _buildSummary(messages, existingSummary) {
    const charName   = this.character.name ?? 'the character';
    const transcript = messages
      .map(m => `${m.role === 'user' ? this.player : charName}: ${m.content}`)
      .join('\n');

    const prompt = existingSummary
      ? `You are maintaining a running conversation log for a narrative RPG.\n\n` +
        `Existing summary:\n${existingSummary}\n\n` +
        `New messages to incorporate:\n${transcript}\n\n` +
        `Update the summary to include key information from these new messages. ` +
        `Keep it to 4–6 sentences. Focus on: what was revealed, shifts in tone or trust, ` +
        `and any specific facts or admissions exchanged. Write in past tense, third person.`
      : `You are maintaining a running conversation log for a narrative RPG.\n\n` +
        `Conversation so far:\n${transcript}\n\n` +
        `Write a brief summary (4–6 sentences) of this conversation. ` +
        `Focus on: what was discussed, what was revealed, key emotional beats, ` +
        `and any significant details exchanged. Write in past tense, third person.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 220,
        temperature: 0.3,
      }),
    });

    if (!response.ok) return existingSummary;
    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  // ── Prompt assembly ──────────────────────────────────────────────────────────

  /**
   * Narrative format instruction personalised to this character.
   * Using the character's own name prevents the model from narrating
   * the player's actions instead of its own.
   */
  get _narrativeFormat() {
    const name = this.character.name ?? 'the character';
    return `RESPONSE FORMAT — follow this exactly for every reply:
Write like a literary novelist. Begin with 1–2 sentences of third-person narration \
that describes ${name}'s own physical actions, expressions, or reaction to what was \
just said — ${name}'s hands, eyes, posture, movements in the scene. \
The narration is about ${name} only. Do not narrate what ${this.player} does or says. \
Wrap the narration in *asterisks*. Then follow immediately with ${name}'s spoken words \
in quotation marks. React genuinely to the substance of what was said — never echo \
or repeat ${this.player}'s words back.

Correct example:
*He sets his quill down without looking up, letting the silence stretch until it becomes \
uncomfortable.* "State your name and your business here."

Another correct example:
*A faint smile crosses her lips, though it does not reach her eyes.* "We don't receive \
many visitors. I wonder what brings you all the way out here."

Never skip the narration. Never skip the dialogue. Always use this exact structure.`;
  }

  /**
   * History formatted for the API. User messages are labelled with the
   * player's name so the model always knows who is speaking and never
   * confuses the player's words for its own.
   */
  get _formattedHistory() {
    return this.history.map(m =>
      m.role === 'user'
        ? { role: 'user', content: `${this.player} says: "${m.content}"` }
        : m
    );
  }

  get systemPrompt() {
    const r = this.dialogueRules;
    const rulesBlock = r
      ? Object.values(r).filter(v => typeof v === 'string').map(s => s.trim()).join('\n\n') || null
      : null;

    // Tells the character who they are speaking with, using whatever name
    // is set in world.yaml — so this stays correct across any world or player.
    const playerIntro = `The person you are speaking with is named ${this.player}.`;

    const summaryBlock = this.summary
      ? `PRIOR CONVERSATION SUMMARY (use this as background context):\n${this.summary}`
      : null;

    return [
      this.systemBase,
      rulesBlock,
      this.character.persona,
      this.character.knowledge,
      this.character.environment,
      playerIntro,
      summaryBlock,
      this._narrativeFormat,
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}
