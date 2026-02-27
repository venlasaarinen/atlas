import { apiLog } from './apilogger.js';

/** Maximum number of messages kept verbatim in the conversation history. */
const MAX_VERBATIM = 12;

/** GPT-5+ models use max_completion_tokens instead of max_tokens. */
function _maxTokensParam(model, value) {
  return model.startsWith('gpt-5') ? { max_completion_tokens: value } : { max_tokens: value };
}

/**
 * Wrap a fetch call to log the request/response to the API debug overlay.
 * Returns the parsed JSON body (since we must consume the response to log it).
 */
async function _loggedFetch(url, options, label) {
  const start = performance.now();
  let status = 0;
  let responseBody = null;

  try {
    const response = await fetch(url, options);
    status = response.status;
    responseBody = await response.json();
    return { ok: response.ok, status, data: responseBody };
  } catch (err) {
    responseBody = { error: err.message };
    throw err;
  } finally {
    apiLog.record({
      label,
      method: options.method ?? 'GET',
      url,
      requestHeaders: options.headers ?? {},
      requestBody: options.body ? JSON.parse(options.body) : null,
      status,
      responseBody,
      durationMs: Math.round(performance.now() - start),
    });
  }
}

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

    const requestBody = {
      model: this.model,
      messages: [
        ...this.systemMessages,
        ...this._formattedHistory,
      ],
      ..._maxTokensParam(this.model, 280),
      temperature: 0.85,
    };

    const result = await _loggedFetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._apiKey}`,
        },
        body: JSON.stringify(requestBody),
      },
      'chat',
    );

    if (!result.ok) {
      this.history.pop();
      throw new Error(`OpenAI error ${result.status}: ${result.data?.error?.message ?? 'unknown'}`);
    }

    const reply = result.data.choices[0].message.content.trim();
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

    const choicesRequestBody = {
      model: this.model,
      messages: [
        {
            role: 'system',
            content: 'You generate player dialogue choices for a narrative RPG. Generate 3 short, distinct things the player could say aloud. Each thing the players says should be 1-2 sentences of spoken words only -- no actions, narration, or asterisks. Return a JSON object: { "choices": ["...", "...", "..."] }'
        },
        {
            role: 'system',
            content: `The character the player is playing as:\n${this.playerPersonality}`
        },
        {
            role: 'system',
            content: `The character being spoken to:\n${this.character.persona}`
        },
        {
          role: 'system',
          content: contextBlock
        },
        {
          role: 'user',
          content: `The character just said: "${characterMessage}"`,
        },
      ],
      ..._maxTokensParam(this.model, 220),
      temperature: 0.9,
      response_format: { type: 'json_object' },
    };

    const choicesResult = await _loggedFetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._apiKey}`,
        },
        body: JSON.stringify(choicesRequestBody),
      },
      'choices',
    );

    if (!choicesResult.ok) {
      return ['Tell me more.', 'I see.', 'What do you mean?'];
    }

    try {
      const parsed = JSON.parse(choicesResult.data.choices[0].message.content);
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

    const summaryResult = await _loggedFetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          ..._maxTokensParam(this.model, 220),
          temperature: 0.3,
        }),
      },
      'summary',
    );

    if (!summaryResult.ok) return existingSummary;
    return summaryResult.data.choices[0].message.content.trim();
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

  /**
   * Build an array of labelled system messages for the API request.
   * Each section gets its own message with a `name` field so it's easy
   * to see where each part of the prompt originates in the debug overlay.
   */
  get systemMessages() {
    const r = this.dialogueRules;
    const playerIntro = `The person you are speaking with is named ${this.player}.`;

    const parts = [
      { name: 'world-base',          content: this.systemBase },
      { name: 'rules-precedence',    content: r?.precedence?.trim() },
      { name: 'rules-style',         content: r?.style?.trim() },
      { name: 'rules-realism',       content: r?.realism?.trim() },
      { name: 'character-persona',   content: this.character.persona },
      { name: 'character-knowledge',  content: this.character.knowledge },
      { name: 'character-environment', content: this.character.environment },
      { name: 'player-intro',        content: playerIntro },
      { name: 'conversation-summary', content: this.summary
        ? `PRIOR CONVERSATION SUMMARY (use this as background context):\n${this.summary}`
        : null },
      { name: 'narrative-format',    content: this._narrativeFormat },
    ];

    return parts
      .filter(p => p.content)
      .map(p => ({ role: 'system', name: p.name, content: p.content }));
  }
}
