# Dear December

`/wishing-tree/` is a separate interactive Christmas letter tree. Run `node server.js`
and open `http://localhost:3000/wishing-tree/`. Existing shop pages are unchanged.

Visitors can publish a letter with one of four ornaments, read other visitors'
letters, navigate trees with 24 letters each, share the URL, and remove a letter
they wrote using a deletion credential saved in that browser. Letters are public;
the form requires explicit agreement. User content is rendered as plain text.
Deletion credentials and request identifiers are excluded from public reads.

The empty tree has six clearly labelled preview letters, authored by Dear December.
They do not count as visitor letters and disappear when the first real letter is
published. New letters are refreshed every 15 seconds while the page is visible.
Music is an original, synthesized music-box arrangement of the public-domain
Jingle Bells melody. Playback requires a button click and stops when the tab hides.
Reduced motion disables snow and twinkling animations.

## 3D tree

The main scene is a real WebGL 2 model. Its individual needles and woody branches
use instanced geometry, with physical materials, environment reflections, shadows,
a spiral of warm bulbs, beveled gold stars, and three-dimensional letter ornaments.
HTML buttons track the projected positions of their corresponding 3D ornaments.
Drag or use the left/right controls to orbit; the reset control restores the front.
Focus the scene and use arrow keys to rotate, +/- to zoom, or 0 to reset. The mouse
wheel remains available for page scrolling. On touch devices, a horizontal swipe
rotates while a vertical swipe scrolls the page. Native pinch zoom remains available.
Pointer interaction does not force focus onto the tall canvas or jump the page.
The renderer pauses while hidden or a
letter dialog is open; reduced motion renders only when a view or content changes.

Three.js 0.187.0 and its MIT license are vendored under `vendor/`. The renderer makes
no external requests. If WebGL is unavailable, the illustrated tree and accessible
letter buttons remain usable. Run `node scripts/test-wishing-tree-3d.mjs` against
the local preview server to verify rotation, projected letter targets and fallback.

Implementation references: [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html),
[OrbitControls](https://threejs.org/docs/pages/OrbitControls.html), and
[RoomEnvironment](https://threejs.org/docs/pages/RoomEnvironment.html).

All interface and letter text use Seoul Alrim Medium/Bold, served locally from
`fonts/` with attribution to Seoul Metropolitan Government. The short centered
heading leaves most of the page to the large tree. A fixed letter button remains
reachable while scrolling. Font source and usage: https://www.seoul.go.kr/seoul/font.do

## Cookie Walk

`산책하기` opens a local, single-player Christmas plaza around the existing tree.
Click/tap the snowy floor to walk, hold WASD/arrow keys, or use the labelled touch
direction pad. A third-person camera follows the original cookie character and can
be rotated by dragging or zoomed with the wheel/pinch while walking. A circular
collision boundary routes the cookie around the tree. The cookie, gingerbread
stalls, lamps and environment are generated locally with no third-party models.

`산책 끝내기` or Escape restores the prior tree camera and document scroll position.
Letters remain the same shared public letters: their native HTML targets track the
scene, dialogs stop movement, and typing in the form never controls the character.
Reduced motion removes decorative limb swing and bobbing. Avatar positions are
local to the browser; this version does not provide live multiplayer avatars.

Open `/wishing-tree/?walk=1` to enter the walk automatically after the renderer is
ready. Verify with `node scripts/test-wishing-tree-walk.mjs`; it uses a temporary
server and journal and does not post to production or the user's preview tree.

## Shared persistence

The Node server stores acknowledged writes in a flushed append-only journal.
Development defaults to the ignored `data/wishing-tree/` directory. For production,
mount persistent storage and set `WISHING_TREE_DATA_DIR` to a private folder on that
volume, outside the web root. On Railway, `RAILWAY_VOLUME_MOUNT_PATH/wishing-tree`
is used automatically if no explicit directory is set. Production writes are
unavailable if neither is configured. A path setting alone does not provision a
volume; verify the actual deployment mount and back it up.

Run **one server replica** per journal. This implementation is suited to a small
shared seasonal tree, not concurrent writer replicas. For multiple instances,
replace the journal with a shared database before scaling. Do not put production
letters or the private journal into Git. A damaged journal is preserved and fails
closed; it is never overwritten with an empty tree.

`GET /api/wishing-tree/letters?page=1` returns a 24-letter page and total count.
`POST /api/wishing-tree/letters` validates name, content, ornament, public consent,
and a UUID request ID. Retries of the same request do not duplicate letters.
`DELETE /api/wishing-tree/letters/:id` requires its private bearer deletion token.
The server limits anonymous writes per network peer and rejects cross-site writes.
There is no account system or moderator console in this first version.

Verify with `node scripts/test-wishing-tree.mjs` and
`node scripts/test-wishing-tree-browser.mjs`.
