/**
 * Title screen — HTML overlay that sits above the PixiJS canvas.
 * Populates #world-list with one card per discovered world, then fades
 * out when the player makes a selection.
 */

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
          hideTitleScreen(screen);
          onSelect(world);
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
      backdrop.classList.remove('active');
    });
  }

  card.addEventListener('click', onClick);
  return card;
}

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
