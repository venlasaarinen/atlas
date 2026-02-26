/**
 * AudioManager — plays a single looping background track at a time.
 * Exported as a singleton so both the title screen and map renderer share state.
 */
class AudioManager {
  constructor() {
    this._el      = null;   // HTMLAudioElement
    this._src     = null;   // currently loaded URL
    this._fadeId  = null;   // active fade interval (only one at a time)
  }

  /**
   * Play a looping track. If the same URL is already playing, does nothing.
   * Fades in from silence over `fadeMs` milliseconds.
   *
   * @param {string} url
   * @param {number} [fadeMs=2000]
   */
  async play(url, fadeMs = 2000) {
    if (this._src === url && this._el && !this._el.paused) return;

    this.stop();

    const audio    = new Audio(url);
    audio.loop     = true;
    audio.volume   = 0;
    this._el       = audio;
    this._src      = url;

    try {
      await audio.play();
      this._fadeIn(fadeMs);
    } catch (err) {
      // Browsers may block autoplay — log and move on gracefully
      console.warn('[audio] playback blocked or file missing:', err.message ?? err);
    }
  }

  /**
   * Fade the current track out over `ms` milliseconds, then stop it.
   *
   * @param {number} [ms=1500]
   */
  fadeOut(ms = 1500) {
    if (!this._el) return;
    this._clearFade();
    const start = this._el.volume;
    const steps = ms / 50;
    const step  = start / steps;
    const el    = this._el;   // capture before stop() clears it
    this._fadeId = setInterval(() => {
      el.volume = Math.max(0, el.volume - step);
      if (el.volume <= 0) {
        this._clearFade();
        this.stop();
      }
    }, 50);
  }

  /** Stop and discard the current track immediately. */
  stop() {
    this._clearFade();
    if (this._el) {
      this._el.pause();
      this._el.src = '';
      this._el     = null;
      this._src    = null;
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _clearFade() {
    if (this._fadeId !== null) {
      clearInterval(this._fadeId);
      this._fadeId = null;
    }
  }

  _fadeIn(ms) {
    this._clearFade();
    const target = 0.5;
    const steps  = ms / 50;
    const step   = target / steps;
    this._fadeId = setInterval(() => {
      if (!this._el) { this._clearFade(); return; }
      this._el.volume = Math.min(target, this._el.volume + step);
      if (this._el.volume >= target) this._clearFade();
    }, 50);
  }
}

export const audioManager = new AudioManager();
