# Audio credits

The ambient sound (`src/audio/ambience.js`) is currently **entirely synthesised** with the Web Audio API — wind,
ocean, pond, fire, birdsong, crickets and the boat creak are generated in code, so there are no audio files and
nothing to credit yet.

A layer can use a recording instead: put the file in this folder and set that layer's `file` in the `AMB` config at
the top of `src/audio/ambience.js` (for example `birds: { ..., file: 'birdsong.m4a' }`). Rules for files:

- m4a (AAC) or mp3 — not ogg (older iPad Safari cannot play it)
- CC0 or CC-BY only; all files together under 2 MB
- list every file below: file name, source URL, author, licence

| File | Source | Author | Licence |
|------|--------|--------|---------|
| — | — | — | — |
