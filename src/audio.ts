// src/audio.ts

const mutedKey = "bluff-muted";
const musicVolumeKey = "bluff-music-volume";

// ---------- SOUND EFFECTS ----------

const sounds = {
  pop: new Audio("/sounds/pop.mp3"),
  whoosh: new Audio("/sounds/whoosh.mp3"),
  reveal: new Audio("/sounds/reveal.mp3"),
  applause: new Audio("/sounds/applause.mp3"),
  winning: new Audio("/sounds/winning.mp3"),
};

Object.values(sounds).forEach((sound) => {
  sound.preload = "auto";
});

export function getMuted() {
  return localStorage.getItem(mutedKey) === "true";
}

export function setMuted(value: boolean) {
  localStorage.setItem(mutedKey, String(value));
}

export function playSound(name: keyof typeof sounds) {
  if (getMuted()) return;

  const sound = sounds[name];
  sound.currentTime = 0;
  sound.volume = 0.9 * getMusicVolume();

  sound.play().catch(() => {});
}

// ---------- BACKGROUND MUSIC ----------

const music = new Audio("/music/game.mp3");

music.loop = true;
music.preload = "auto";

export function getMusicVolume() {
  const stored = localStorage.getItem(musicVolumeKey);
  return stored ? Number(stored) : 0.35;
}

music.volume = getMusicVolume();

export function setMusicVolume(volume: number) {
  music.volume = volume;
  localStorage.setItem(musicVolumeKey, String(volume));
}

export function playMusic() {
  music.volume = getMusicVolume();

  music.play().catch(() => {
    // Browser blocks autoplay until first interaction.
  });
}

export function stopMusic() {
  music.pause();
  music.currentTime = 0;
}

export function pauseMusic() {
  music.pause();
}

export function resumeMusic() {
  music.play().catch(() => {});
}