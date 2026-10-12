# Calliope Vox-style template workflow

- Source: [X article by Sergio Gil](https://x.com/seergioo_gil/status/2094082937402581220)
- Official guide: [How to Make a Vox Style Video](https://www.calliopelabs.co/guides/vox-style-shorts)
- Operational limits: [Calliope Best Practices](https://www.calliopelabs.co/best-practices)
- Terms: [Calliope Terms & Conditions](https://www.calliopelabs.co/legal/terms-and-conditions)
- Captured: 2026-09-02
- Status: reviewed; selective process adoption only

## Summary

The article is a Calliope template tutorial, not a frame-accurate reverse-engineering method. Its useful contribution is organizational: keep still-image appearance instructions separate from motion instructions, use references to cover recurring scene situations, approve low-cost continuity inputs before expensive generation, and regenerate only the failed clip. The official best-practices page also states that Content Instructions are general context rather than an exact contract for timestamps, transitions, effects, or overlays. Source: [official guide](https://www.calliopelabs.co/guides/vox-style-shorts), [best practices](https://www.calliopelabs.co/best-practices).

## Adopted

- Separate `visual_treatment`, `motion_contract`, and `source_contract` instead of mixing appearance, frame behavior, and provenance in one prompt-shaped field. Source: [official guide, template section](https://www.calliopelabs.co/guides/vox-style-shorts#2-build-the-template).
- Measure reference sufficiency by a coverage matrix rather than a fixed number of images. The local matrix covers stage, focal, supporting, depth, entrance, internal change, transition, hold, and exclusions. This nine-part matrix is a 23jung implementation decision derived from the guide's use of one master sheet plus situational examples; it is not a Calliope standard. Source: [official guide, reference section](https://www.calliopelabs.co/guides/vox-style-shorts#1-grab-the-reference-images), [local contract](../../video/contracts/production-authoring-contract-v1.json).
- Regenerate or replace only the failed cut, but invalidate that cut's bound hashes and review state. Source: [best practices, editor hierarchy](https://www.calliopelabs.co/best-practices#2-editor), [local production playbook](../syntheses/remotion-vox-production-playbook-v0.1.md).

## Rejected or limited

- A fixed six-reference rule, universal 70% hero ratio, universal 1–3 second cutting rhythm, and universal camera drift are style-specific heuristics, not production-wide authority. Source: [official guide](https://www.calliopelabs.co/guides/vox-style-shorts).
- Prompt words such as `spring`, `wobble`, or `rack focus` do not prove an implemented operator. 23jung continues to require runtime and observable frame evidence. Source: [local production playbook](../syntheses/remotion-vox-production-playbook-v0.1.md).
- Calliope does not replace Remotion, Omni, exact source/frame binding, rights review, or human PASS. Its own documentation says exact visual timing is not guaranteed by Content Instructions. Source: [best practices](https://www.calliopelabs.co/best-practices).
- Sensitive or non-public political/legal source material is not routed through Calliope by default. Submitted content may be processed to provide and improve the service, conversations may be retained and analyzed, and users remain responsible for reviewing output and legal compliance. Source: [terms](https://www.calliopelabs.co/legal/terms-and-conditions).

## Related

- [[vox-style-claude-remotion-reference]]
- [[../syntheses/remotion-vox-production-playbook-v0.1]]
