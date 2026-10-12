# Rive organic mesh character sheet v1

- Status: `private-review-candidate / production-unapproved`
- Generated: 2026-08-13 with the built-in ImageGen tool.
- Approved style reference: `production/motion-assets/generic-character-poc-v1/master-approved-v1.png`
- Reference SHA-256: `4f7717edcdda6eab8abcd6314056f98176b68e360a45a585cb83b25d7e859a56`
- Chroma source SHA-256: `2f606db9b711284527550f1be7f730f12576bb92871aee9bc0bb7fc6a43af99c`
- Alpha source SHA-256: `1c84273e7a3250dba0498700295ca146d63ff2210c924da401d43cbaff1e8139`
- Torso repair chroma SHA-256: `e3a664765acfe3ebf4e1ebcdd62b68f57a3f2e5b90f786cd89c70f7b6917eb60`
- Torso repair alpha SHA-256: `eefffbfaacfa2d956a47e7539c8d4632d2a5b70e05b164c0df0cbe966656e85b`
- Rebuilt atlas SHA-256: `2dcad77864cb83bb36da2802fad0ed8abf61965b7c76945ac16bb1d8b19f3689`
- Rebuilt static assembly SHA-256: `691be9c625e25dc4414423e8ad4a40091fa709edbd999c39385d6efe38db0a2a`
- The initial organic torso is rejected: it baked both long sleeves into the torso while separate arm meshes were also rendered, producing doubled arms.
- `source/torso-repair-v2-{chroma,alpha}.png` replaces only that cell with an arm-free neck-to-waist body shell. The original sheet remains immutable.
- The torso replacement is rendered in front of the two dedicated continuous arm meshes so its clean armholes cover their shoulder roots.

## Design change

This study supersedes the visibly segmented mannequin layout as the preferred design candidate. It does not split upper arm from forearm or thigh from shin in the visible artwork.

- Each arm is one continuous shoulder-to-wrist mesh with no drawn elbow seam. Rive shoulder, elbow and wrist bones would deform that one mesh.
- Each leg is one continuous hip-to-shoe mesh with no drawn knee or ankle seam. Rive hip and knee bones would deform that one mesh.
- Hands and facial expressions remain exchangeable attachments.
- Torso contains no arms or sleeves. It overlaps the two dedicated arm meshes only at their shoulder roots; the pelvis helper stays behind visible artwork.
- Front, side and back still require separately authored rigs switched with Solo/Enum.

This approach follows Rive's documented model: a raster image can receive a custom mesh, bind to multiple bones and blend vertex weights at joints. Sources checked 2026-08-13: [Meshes](https://rive.app/docs/editor/manipulating-shapes/meshes), [Bones](https://rive.app/docs/editor/manipulating-shapes/bones), [Solos](https://rive.app/docs/editor/manipulating-shapes/solos).

## Deliverables and validation

- `source/organic-mesh-sheet-v1-{chroma,alpha}.png`: immutable generated source and alpha derivative.
- `source/torso-repair-v2-{chroma,alpha}.png`: targeted arm-free torso replacement and transparent derivative.
- `source/organic-mesh-atlas-v1-alpha.png`: normalized 20-part review atlas.
- `source/organic-mesh-static-assembly-v1.png`: front neutral design review.
- `parts/*.png`: 20 physical 320x256 RGBA attachments.
- `build_organic_pack.py`: connected-component extraction, global-scale normalization and assembly builder.
- `validate_organic_pack.py`: strict count, bounds, dimensions, hashes, containment and nonsymlink validator.
- `organic-mesh-report.json`: creator report and hashes.

Focused validation passes: 20 parts, 24-pixel inset, physical nonsymlinks, dimensions and hashes. The generated arms and legs have no visible elbow, knee or ankle separation. `visualQa=pending-human-review`; no Rive artboard, mesh weights, animation, export, upload or production promotion is authorized yet.
