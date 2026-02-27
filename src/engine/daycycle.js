/**
 * DayCycle — tracks the current day, time segment, and remaining action pips.
 *
 * The day is divided into four segments: Morning, Afternoon, Evening, Night.
 * Morning / Afternoon / Evening each grant the player 2 actions.
 * Night has 0 actions — the player must sleep at the inn to advance to
 * the next day's Morning.
 */

const SEGMENTS            = ['Morning', 'Afternoon', 'Evening', 'Night'];
const ACTIONS_PER_SEGMENT = 2;

export class DayCycle {
  constructor() {
    this.day              = 1;
    this.segmentIndex     = 0;  // 0 = Morning, 1 = Afternoon, 2 = Evening, 3 = Night
    this.actionsRemaining = ACTIONS_PER_SEGMENT;
    this._onChange         = null;
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  /** Current segment name, e.g. "Morning". */
  get segment() { return SEGMENTS[this.segmentIndex]; }

  /** Display string for the HUD, e.g. "Day 1, Morning". */
  get label() { return `Day ${this.day}, ${this.segment}`; }

  /** Maximum actions per segment (for drawing pip slots). */
  get maxActions() { return ACTIONS_PER_SEGMENT; }

  /** Whether the player can still perform an action this segment. */
  get canAct() { return this.actionsRemaining > 0; }

  /** Whether it is currently Night. */
  get isNight() { return this.segment === 'Night'; }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Register a callback that fires whenever the cycle state changes.
   * @param {Function} fn
   */
  onChange(fn) { this._onChange = fn; }

  /**
   * Spend one action pip.  If this was the last pip in the segment the
   * cycle auto-advances to the next segment.
   */
  consumeAction() {
    if (this.actionsRemaining <= 0) return;
    this.actionsRemaining--;
    if (this.actionsRemaining === 0) this._advance();
    this._notify();
  }

  /**
   * Sleep through the night — advance directly to the next day's Morning
   * with full action pips.
   */
  sleep() {
    this.segmentIndex     = 0;  // Morning
    this.day++;
    this.actionsRemaining = ACTIONS_PER_SEGMENT;
    this._notify();
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /** Move to the next time segment. Night gets 0 actions; others get full. */
  _advance() {
    this.segmentIndex++;
    if (this.segmentIndex >= SEGMENTS.length) {
      this.segmentIndex = 0;
      this.day++;
    }

    // Night has no actions — player must sleep to continue
    this.actionsRemaining = this.isNight ? 0 : ACTIONS_PER_SEGMENT;
  }

  _notify() { this._onChange?.(); }
}
