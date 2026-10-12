# AI visual production tools

- Source: [tool capture](../../raw/sources/ai-visual-production-tools-2026-08-22.md)
- Captured: 2026-08-22
- Status: reviewed

## Current recommendation

- Use Runway for flexible generated video and image-to-video work; its official help page permits commercial output use. Source: [Runway section](../../raw/sources/ai-visual-production-tools-2026-08-22.md#runway)
- Use Adobe Firefly when commercial-safety positioning and integration with Adobe production tools matter. Source: [Firefly section](../../raw/sources/ai-visual-production-tools-2026-08-22.md#adobe-firefly)
- Do not build the pipeline around Sora because the official product was discontinued in April 2026. Source: [availability note](../../raw/sources/ai-visual-production-tools-2026-08-22.md#availability-note)

## Google image-to-video route

Google's current official pages describe Gemini Omni as accepting image, text, video, and audio references, while Gemini Apps can generate video from uploaded images or videos. Veo is Google's dedicated video model and supports image-to-video and reference-image controls. Source: [Gemini Omni](https://deepmind.google/models/gemini-omni/), [Gemini Apps video help](https://support.google.com/gemini/answer/16126339), [Veo](https://deepmind.google/technologies/veo/). Verified: 2026-08-24.

For 23jung this is currently a manual, authenticated production route rather than a repository API integration. The intended sequence is `imagegen still/cut-out → Gemini Omni or Veo motion plate → Remotion evidence/source/typography composite`. Account-level availability, quotas, output duration, and download behavior remain subject to the signed-in Google plan and must be checked during each production session. Local workflow note: [video README](../../video/README.md).

## 23jung routing rule

- **Gemini Omni/Veo:** only for an explicitly fictional incident, hypothetical everyday example, unavailable imaginary material, or abstract reconstruction that is labelled as AI.
- **Actual source media:** for a real person, real incident, real action, real place, or real statement whenever a suitable source photo or video exists.
- **Remotion:** for every remaining case, especially documents, numbers, dates, maps, timelines, procedures, causal relationships, and real events for which no suitable visual source exists.
- **Final assembly:** all three routes return to Remotion for timing, transitions, audio and render. Actual-source and explanatory scenes may receive source labels or concise captions; an AI action plate receives no explanatory overlay, and its disclosure sits outside the uninterrupted action plate.

The project does not use Omni to simulate a real politician's face, statement, expression, or actions, and it does not use AI video as substitute evidence for a real event. This is a project editorial rule rather than a claim made by the tool providers. Canonical rule: [[../syntheses/remotion-vox-production-playbook-v0.1]].

## Editorial rule

AI may reconstruct a generic environment or illustrate an abstract process, but it must not fabricate documentary evidence. Realistic reconstruction receives an `AI 재현` disclosure outside the uninterrupted action plate, and prompts/model/date are retained. This is the current project presentation rule; the need to distinguish reconstruction from evidence is recorded in the [source capture](../../raw/sources/ai-visual-production-tools-2026-08-22.md#recommended-ai-use-boundary).

## Related

- [[../concepts/media-acquisition-pipeline]]
- [[action-driven-ai-video-generation]]
- [[seojaero36-money-cheaper-than-paper]]
