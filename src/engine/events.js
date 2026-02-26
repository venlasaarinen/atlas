/**
 * EventSystem — evaluates conditions and executes actions defined in
 * event YAML files.
 */
export class EventSystem {
  /**
   * @param {import('./flags.js').FlagStore} flags
   */
  constructor(flags) {
    this.flags = flags;
  }

  /**
   * Trigger a named event, evaluating its conditions before running actions.
   *
   * @param {string} eventId
   * @param {object} eventData  Parsed event YAML object
   */
  async trigger(eventId, eventData) {
    if (!eventData) {
      console.warn(`[events] unknown event: ${eventId}`);
      return;
    }

    if (!this.check(eventData.conditions ?? [])) {
      return; // Conditions not met
    }

    for (const action of eventData.actions ?? []) {
      await this._execute(action);
    }
  }

  /**
   * Evaluate an array of conditions against the current flag store.
   *
   * @param {object[]} conditions
   * @returns {boolean}
   */
  check(conditions) {
    return conditions.every(cond => {
      if ('flag' in cond) {
        return this.flags.get(cond.flag) === cond.value;
      }
      return true; // Unknown condition types pass by default
    });
  }

  async _execute(action) {
    if ('set_flag' in action) {
      const entries = Object.entries(action.set_flag);
      for (const [key, val] of entries) {
        this.flags.set(key, val);
      }
    } else if ('show_text' in action) {
      // TODO: pipe to dialogue/narration UI
      console.log(`[narration] ${action.show_text}`);
    } else {
      console.warn('[events] unknown action:', action);
    }
  }
}
