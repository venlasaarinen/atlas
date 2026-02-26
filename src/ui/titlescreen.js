/**
 * Title screen — HTML overlay that sits above the PixiJS canvas.
 * Populates #world-list with one card per discovered world, then fades
 * out when the player makes a selection.
 */

import { audioManager } from '../engine/audio.js';

export function showTitleScreen(worlds, onSelect) {
  const screen = document.getElementById('title-screen');
  const worldList = document.getElementById('world-list');

  worldList.innerHTML = '';

  if (!worlds || worlds.length === 0) {
    worldList.innerHTML =
      '<p class="worlds-error">No worlds found. Add folders under <code>worlds/</code>.</p>';
  } else {
    for (const world of worlds) {
      worldList.appendChild(
        createWorldCard(world, () => {
          showWorldIntro(world, screen, () => {
            hideTitleScreen(screen);
            onSelect(world);
          });
        })
      );
    }
  }

  // Trigger CSS fade-in on next frame
  requestAnimationFrame(() => screen.classList.add('visible'));
}

function createWorldCard(world, onClick) {
  const card = document.createElement('div');
  card.className = 'world-card';

  if (world.accent) {
    card.style.setProperty('--card-accent', world.accent);
  }

  card.innerHTML = `
    <p class="world-card-label">World</p>
    <h2 class="world-title">${esc(world.title ?? world.id)}</h2>
    <p class="world-tagline">${world.tagline ? esc(world.tagline) : ''}</p>
    <button class="begin-btn">Begin Journey</button>
  `;

  if (world.cover_image) {
    const coverUrl = `/worlds/${world._folder}/${world.cover_image}`;
    const backdrop = document.getElementById('cover-backdrop');
    card.addEventListener('mouseenter', () => {
      backdrop.style.backgroundImage = `url('${coverUrl}')`;
      backdrop.classList.add('active');
    });
    card.addEventListener('mouseleave', () => {
      // Don't remove the backdrop once a world has been selected
      if (document.getElementById('world-list').style.display === 'none') return;
      backdrop.classList.remove('active');
    });
  }

  card.addEventListener('click', onClick);
  return card;
}

// ── World Intro ─────────────────────────────────────────────────────────────

/**
 * Transition the title screen into a cinematic world intro:
 * world list fades out, the ATLAS title scrambles into the world name,
 * and the subtitle crossfades into the world tagline.
 */
function showWorldIntro(world, screen, onComplete) {
  const worldList  = document.getElementById('world-list');
  const footer     = screen.querySelector('.title-footer');
  const titleEl    = screen.querySelector('.engine-title');
  const subtitleEl = screen.querySelector('.engine-subtitle');
  const backdrop   = document.getElementById('cover-backdrop');

  // Guarantee cover backdrop is active even if user clicked without hovering
  if (world.cover_image) {
    const coverUrl = `/worlds/${world._folder}/${world.cover_image}`;
    backdrop.style.backgroundImage = `url('${coverUrl}')`;
    backdrop.classList.add('active');
  }

  // Immediately hide world list and footer — no fade delay
  worldList.style.display = 'none';
  if (footer) footer.style.display = 'none';

  // Start the map soundtrack now — fetch is fast enough that audio.play()
  // still executes within the browser's user-gesture activation window.
  _startMapSoundtrack(world);

  // Immediately swap subtitle to tagline, starting hidden for the fade-in
  subtitleEl.textContent = world.tagline ?? '';
  subtitleEl.classList.add('intro-tagline');
  subtitleEl.style.opacity = '0';

  // Snap font size for long world names with no transition (avoids pre-scramble zoom)
  const targetTitle = (world.title ?? world.id).toUpperCase();
  titleEl.style.transition = 'none';
  const len = targetTitle.length;
  if (len > 8) {
    titleEl.style.fontSize      = 'clamp(2.2rem, 5.5vw, 4.5rem)';
    titleEl.style.letterSpacing = '0.15em';
  } else if (len > 5) {
    titleEl.style.fontSize      = 'clamp(2.8rem, 7vw, 5.5rem)';
    titleEl.style.letterSpacing = '0.22em';
  }

  // Start parallax — backdrop drifts opposite to the mouse with easing
  const stopParallax = startParallax(screen, backdrop);

  // Start scramble immediately on the next frame
  requestAnimationFrame(async () => {
    // Dim the title, then let both elements fade to full over the scramble duration
    titleEl.style.opacity    = '0.15';
    titleEl.style.transition = 'opacity 0.85s ease';
    subtitleEl.style.transition = 'opacity 1s ease';

    requestAnimationFrame(() => {
      titleEl.style.opacity    = '1';
      subtitleEl.style.opacity = '1';
    });

    await scrambleText(titleEl, targetTitle, 950);

    titleEl.style.transition    = '';
    subtitleEl.style.transition = '';

    // Hold on the intro screen until the player clicks
    screen.style.cursor = 'pointer';
    screen.addEventListener('click', () => {
      screen.style.cursor = '';
      stopParallax();
      onComplete();
    }, { once: true });
  });
}

// ── Parallax ─────────────────────────────────────────────────────────────────

/**
 * Moves `backdrop` in the opposite direction of the mouse, creating a subtle
 * depth effect. The image is scaled up 8 % so edges never become visible.
 * Movement is eased with a lerp so it feels weighty rather than instant.
 *
 * Returns a stop function that cancels the loop and resets the transform.
 */
function startParallax(screen, backdrop) {
  const MAX  = 22;    // max pixel offset in each direction
  const EASE = 0.07;  // lerp factor per frame (~280 ms settle at 60 fps)

  let tx = 0, ty = 0;       // target offsets
  let cx = 0, cy = 0;       // current lerped offsets
  let rafId = null;
  let running = true;
  let seenMove = false;     // don't react until the first mousemove after click

  // Disable the CSS transform transition while JS is driving the parallax,
  // so it doesn't fight the rAF lerp. Restore it on stop.
  backdrop.style.transition = 'opacity 0.6s ease';
  backdrop.style.transform  = 'scale(1.08)';

  function onMove(e) {
    const nx = (e.clientX / window.innerWidth  - 0.5) * 2;
    const ny = (e.clientY / window.innerHeight - 0.5) * 2;
    tx = -nx * MAX;
    ty = -ny * MAX;
    // Snap current position to target on the very first move so there is no
    // lerp-drift from centre to wherever the mouse happens to already be.
    if (!seenMove) { cx = tx; cy = ty; seenMove = true; }
  }

  function tick() {
    if (!running) return;
    cx += (tx - cx) * EASE;
    cy += (ty - cy) * EASE;
    backdrop.style.transform =
      `translate(${cx.toFixed(2)}px, ${cy.toFixed(2)}px) scale(1.08)`;
    rafId = requestAnimationFrame(tick);
  }

  screen.addEventListener('mousemove', onMove);
  rafId = requestAnimationFrame(tick);

  return function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    screen.removeEventListener('mousemove', onMove);
    backdrop.style.transition = '';  // restore CSS transition
    backdrop.style.transform  = '';
  };
}

// ── Soundtrack ───────────────────────────────────────────────────────────────

/**
 * Play the world's soundtrack (defined in world.yaml) with a gentle fade-in.
 */
function _startMapSoundtrack(world) {
  if (!world.soundtrack) return;
  const url = `/worlds/${world._folder}/${world.soundtrack}`;
  audioManager.play(url, 3000);
}

// ── Scramble animation ───────────────────────────────────────────────────────

/**
 * Fills `el` with random uppercase characters, then settles each letter
 * left-to-right into the target string over `duration` ms.
 *
 * @param {HTMLElement} el
 * @param {string}      target
 * @param {number}      duration  Total animation time in ms
 */
function scrambleText(el, target, duration = 1100) {
  return new Promise(resolve => {
    const CHARS    = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const FRAME_MS = 65;
    const total    = Math.round(duration / FRAME_MS);

    // Each letter locks in during the latter 65 % of the run, staggered L→R.
    // Power curve (t^1.8) bunches early letters together and drags the last few out.
    const settleAt = i => {
      const t = i / Math.max(target.length - 1, 1);
      return Math.floor(total * 0.35 + Math.pow(t, 1.8) * (total * 0.65));
    };

    let frame = 0;
    const id = setInterval(() => {
      let text = '';
      for (let i = 0; i < target.length; i++) {
        text += frame >= settleAt(i)
          ? target[i]
          : CHARS[Math.floor(Math.random() * CHARS.length)];
      }
      el.textContent = text;
      frame++;

      if (frame > total) {
        clearInterval(id);
        el.textContent = target;
        resolve();
      }
    }, FRAME_MS);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function hideTitleScreen(screen) {
  screen.classList.remove('visible');
  screen.classList.add('hiding');
  screen.addEventListener('transitionend', () => {
    screen.style.display = 'none';
  }, { once: true });
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
