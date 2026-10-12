# VQazcEuV9Xw reconstruction analysis

This folder records a bounded local study of two reference intervals. The
reference MP4 stays outside this directory and is read only from
`reference-reverse-v1/source/VQazcEuV9Xw.mp4`.

The numbers in `../config/motion-parameters.json` are reconstruction controls,
not claims about the original authoring curves. The drone interval uses one
parent transform with explicit hand-contact anchors. The robot interval uses a
hold, a short blur transition, an original SVG pose replacement, an original
metal ladle-like prop (the source identity remains uncertain), and a final
glitch overlay.

No automatic similarity pass is asserted. Human review must inspect the source
contact sheets and rendered frames side by side.
