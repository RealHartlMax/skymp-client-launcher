import { useEffect, useRef } from 'react';
import type { LauncherPreferences } from './launcherPreferences';

/** Original, quiet ambient sound generated locally. No tracking or third-party audio. */
export default function useMenuAudio(preferences: LauncherPreferences, suspended: boolean) {
  const context = useRef<AudioContext | null>(null);
  const gain = useRef<GainNode | null>(null);
  const lastInput = useRef(Date.now());
  const settings = useRef({ preferences, suspended });
  settings.current = { preferences, suspended };
  useEffect(() => {
    const input = () => {
      lastInput.current = Date.now();
      const current = settings.current;
      if (current.preferences.menuAudio && !context.current) {
        try {
          const audio = new AudioContext(); const volume = audio.createGain(); volume.gain.value = 0;
          volume.connect(audio.destination); context.current = audio; gain.current = volume;
          const buffer = audio.createBuffer(1, audio.sampleRate * 8, audio.sampleRate);
          const channel = buffer.getChannelData(0);
          for (let index = 0; index < channel.length; index++) channel[index] = Math.random() * 2 - 1;
          const source = audio.createBufferSource(); source.buffer = buffer; source.loop = true;
          const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 240;
          source.connect(filter); filter.connect(volume); source.start();
          for (const frequency of [110, 164.81]) {
            const tone = audio.createOscillator(); tone.frequency.value = frequency;
            const level = audio.createGain(); level.gain.value = 0.012;
            tone.connect(level); level.connect(volume); tone.start();
          }
          void audio.resume().catch(() => {});
        } catch { /* Devices may be unavailable; settings and connection remain usable. */ }
      } else if (context.current?.state === 'suspended' && current.preferences.menuAudio) void context.current.resume().catch(() => {});
    };
    const tick = () => {
      const current = settings.current; const audio = context.current;
      if (!audio || !gain.current) return;
      const audible = current.preferences.menuAudio && !current.suspended && !document.hidden
        && (!current.preferences.muteOnFocusLoss || document.hasFocus()) && Date.now() - lastInput.current >= 25000;
      gain.current.gain.setTargetAtTime(audible ? current.preferences.audioVolume / 100 * 0.22 : 0, audio.currentTime, 0.4);
    };
    const events = ['pointerdown', 'keydown', 'pointermove'] as const;
    events.forEach(event => window.addEventListener(event, input, { passive: true }));
    const timer = window.setInterval(tick, 500);
    return () => { events.forEach(event => window.removeEventListener(event, input)); window.clearInterval(timer); void context.current?.close().catch(() => {}); context.current = null; gain.current = null; };
  }, []);
}
