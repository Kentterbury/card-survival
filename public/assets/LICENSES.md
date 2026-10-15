# Third-party assets

All 3D models and animations in this folder come from KayKit by Kay Lousberg (www.kaylousberg.com), released under CC0 1.0 (public domain). Attribution is not required but appreciated.

- KayKit Character Pack: Adventurers 1.0 — https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
- KayKit Character Pack: Skeletons 1.0 — https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0
- KayKit Dungeon Remastered 1.0 — https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0

Files were re-exported with `tools/optimize-assets.mjs` (unused animations removed, meshopt compression).

## Synty POLYGON models (optional, not in this repository)

When the deploy workflow has access to the private asset repo, it copies
Synty Studios POLYGON models into `assets/synty/` and the game uses them in
place of the KayKit ones. They are licensed per purchaser and must never be
committed here; `.gitignore` excludes the folder. See `README.md`.
