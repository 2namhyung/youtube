"""Shopping-specific contracts; newsroom authorities are never imported."""
from datetime import datetime
from typing import Annotated, Literal
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator, field_validator

VERSION = "shopping-luna-v1"
FRAME_RATE = 30
SAMPLE_RATE = 48000
Nonempty = Annotated[str, Field(min_length=1, max_length=4000)]
Identifier = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")]
Positive = Annotated[StrictInt, Field(gt=0)]
Natural = Annotated[StrictInt, Field(ge=0)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class ProjectCreate(Contract):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    desired_seconds: Annotated[StrictInt, Field(ge=3, le=180)] = 35
    mode: Literal["production", "synthetic-test"] = "production"


class StageRequest(Contract):
    expected_revision: Positive
    payload: dict = Field(default_factory=dict)


class Receipt(Contract):
    blob_id: Identifier
    url: Nonempty
    observed_at: datetime
    surface: Literal["chrome-use", "computer-use", "manual", "fixture", "youtube-data-api"]
    note: Nonempty

    @field_validator("observed_at")
    @classmethod
    def aware(cls, value):
        if value.tzinfo is None:
            raise ValueError("observed_at requires a timezone")
        return value


class Attestation(Contract):
    actor: Nonempty
    model: Nonempty
    surface: Literal["chrome-use", "computer-use", "manual", "fixture", "youtube-data-api"]
    receipt_ids: Annotated[list[Identifier], Field(min_length=1)]
    notes: Nonempty


class Claim(Contract):
    id: Identifier
    text: Nonempty
    level: Literal["seller_claim", "independently_observed", "unverified"]
    receipt_ids: Annotated[list[Identifier], Field(min_length=1)]
    expires_at: datetime | None = None

    @field_validator("expires_at")
    @classmethod
    def aware_expiry(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("expires_at requires a timezone")
        return value


class Product(Contract):
    name: Nonempty
    brand: Nonempty
    model: Nonempty
    variant: Nonempty
    url: Nonempty
    claims: Annotated[list[Claim], Field(min_length=1, max_length=50)]
    attestation: Attestation

    @field_validator("url")
    @classmethod
    def normalize_url(cls, value):
        u = urlsplit(value)
        if u.scheme != "https" or not u.hostname or u.username or u.password:
            raise ValueError("Product URLs must be HTTPS without credentials")
        # Preserve itemId/vendorItemId and all unknown option identifiers.
        query = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True)
                 if not k.lower().startswith("utm_") and k.lower() not in {"gclid", "fbclid"}]
        return urlunsplit((u.scheme, u.netloc, u.path, urlencode(query), ""))

    @model_validator(mode="after")
    def unique_claims(self):
        if len({c.id for c in self.claims}) != len(self.claims):
            raise ValueError("Duplicate claim IDs")
        return self


class QueryPlan(Contract):
    queries: dict[Literal["ko", "en", "zh", "ja"], Annotated[list[Nonempty], Field(min_length=1, max_length=2)]]
    attestation: Attestation

    @model_validator(mode="after")
    def four_languages(self):
        if set(self.queries) != {"ko", "en", "zh", "ja"}:
            raise ValueError("All four locales are required")
        return self


class Rights(Contract):
    license: Literal["OWNED", "CC0", "CC-BY", "WRITTEN_PERMISSION"]
    license_url: Nonempty
    author: Nonempty
    source_url: Nonempty
    statement: Nonempty
    acquisition_basis: Nonempty
    receipt_ids: Annotated[list[Identifier], Field(min_length=1)]
    provider_input_allowed: bool = False


class Ingestion(Contract):
    blob_id: Identifier
    rights: Rights


class Sound(Contract):
    blob_id: Identifier
    name: Nonempty
    tags: list[Nonempty] = Field(default_factory=list)
    rights: Rights


class SoundPlacement(Contract):
    sound_id: Identifier
    beat_id: Identifier
    offset_samples: Natural = 0
    gain_db: Annotated[float, Field(ge=-40, le=0)] = -12
    fade_in_samples: Natural = 240
    fade_out_samples: Natural = 480


class ShotObservation(Contract):
    shot_id: Identifier
    description: Nonempty
    action: Nonempty
    usage_role: Literal["EXACT_PRODUCT", "STORY_BROLL", "GRAPHIC"]
    product_model: str
    product_variant: str
    product_match: Literal["same_model_same_variant", "different", "insufficient", "not_applicable"]
    clear: bool
    uncertain: bool
    start_frame: Natural
    end_frame: Positive
    frame_ids: Annotated[list[Identifier], Field(min_length=3, max_length=60)]
    attestation: Attestation


class Beat(Contract):
    id: Identifier
    spoken_text: Annotated[str, Field(min_length=1, max_length=400)]
    caption_text: Annotated[str, Field(min_length=1, max_length=200)]
    role: Literal["hook", "problem", "use", "result", "cta"]
    claim_ids: list[Identifier]
    shot_ids: Annotated[list[Identifier], Field(min_length=1, max_length=3)]
    usage_role: Literal["EXACT_PRODUCT", "STORY_BROLL", "GRAPHIC"]
    estimated_frames: Annotated[StrictInt, Field(ge=15, le=900)]


class Script(Contract):
    title: Annotated[str, Field(min_length=1, max_length=60)]
    reference_based: bool = False
    reference_receipt_ids: list[Identifier] = Field(default_factory=list)
    beats: Annotated[list[Beat], Field(min_length=1, max_length=40)]
    attestation: Attestation

    @model_validator(mode="after")
    def integrity(self):
        if len({b.id for b in self.beats}) != len(self.beats):
            raise ValueError("Duplicate beat IDs")
        if self.reference_based and not self.reference_receipt_ids:
            raise ValueError("Reference-based script needs reference evidence")
        return self


class BeatAudio(Contract):
    beat_id: Identifier
    blob_id: Identifier


class Voice(Contract):
    profile: Nonempty
    script_id: Identifier
    segments: Annotated[list[BeatAudio], Field(min_length=1)]
    pronunciation_checked: Literal[True]
    attestation: Attestation


class Crop(Contract):
    mode: Literal["fit", "crop"] = "fit"
    x: Natural = 0
    y: Natural = 0
    width: Natural = 0
    height: Natural = 0
    background: Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")] = "#141A19"


class TimelineRequest(Contract):
    lock: bool = False
    layouts: dict[str, Crop] = Field(default_factory=dict)
    sfx: Annotated[list[SoundPlacement], Field(max_length=20)] = Field(default_factory=list)


class ManifestClip(Contract):
    beat_id: Identifier
    shot_id: Identifier
    observation_id: Identifier
    asset_id: Identifier
    asset_hash: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    master_blob_id: Identifier
    source_start_frame: Natural
    source_end_frame: Positive
    start_frame: Natural
    end_frame: Positive
    layout: Crop
    speed: Literal[1]
    usage_role: Literal["EXACT_PRODUCT", "STORY_BROLL", "GRAPHIC"]


class Caption(Contract):
    start_frame: Natural
    end_frame: Positive
    text: Nonempty


class AudioTrack(Contract):
    role: Literal["voice", "sfx"]
    blob_id: Identifier
    sound_id: Identifier | None = None
    source_start_sample: Natural
    source_end_sample: Positive
    timeline_start_sample: Natural
    gain_db: Annotated[float, Field(ge=-40, le=0)]
    fade_in_samples: Natural = 0
    fade_out_samples: Natural = 0


class RenderManifest(Contract):
    schema_version: Literal["shopping-render-manifest-v2"] = Field(alias="schema")
    mode: Literal["production", "synthetic-test"]
    locked: bool
    fps: Literal[30]
    sample_rate: Literal[48000]
    width: Literal[1080]
    height: Literal[1920]
    script_id: Identifier
    product_id: Identifier
    title: Nonempty
    voice_id: Identifier | None
    voice_blob_id: Identifier | None
    font_blob_id: Identifier
    clips: Annotated[list[ManifestClip], Field(min_length=1)]
    total_frames: Positive
    total_samples: Positive
    captions: Annotated[list[Caption], Field(min_length=1)]
    audio_tracks: list[AudioTrack]
    original_audio_included: Literal[False]
    publication_authorized: Literal[False]


class Review(Contract):
    subject_id: Identifier
    verdict: Literal["pass", "revise", "insufficient"]
    facts: bool
    product: bool
    visual: bool
    audio: bool
    captions: bool
    attestation: Attestation


class Completion(Contract):
    binding: Nonempty
    result: dict


class Snapshot(Contract):
    video_id: Identifier
    channel_id: Identifier
    published_at: datetime
    observed_at: datetime
    views: Natural | None
    provider: Nonempty
    definition: Nonempty
    shorts_status: Literal["confirmed", "probable", "unknown", "not_short"]
    commerce_type: Literal["demo", "review", "unboxing", "buying_guide", "unrelated", "unknown"]
    shopping_tag_status: Literal["confirmed", "absent", "unknown"] = "unknown"
    receipt_id: Identifier

    @model_validator(mode="after")
    def dates(self):
        if self.published_at.tzinfo is None or self.observed_at.tzinfo is None:
            raise ValueError("UTC offsets required")
        if self.observed_at < self.published_at:
            raise ValueError("Observation precedes publication")
        return self


class YouTubeDiscoveryRequest(Contract):
    expected_revision: Positive
    query: Annotated[str, Field(min_length=1, max_length=200)]
    candidate_id: Identifier | None = None
    age_hours: Literal[24, 72, 168] = 72
    region_code: Annotated[str, Field(pattern=r"^[A-Z]{2}$")] = "KR"
    max_results: Annotated[StrictInt, Field(ge=10, le=50)] = 50


class Discovery(Contract):
    snapshots: Annotated[list[Snapshot], Field(min_length=1, max_length=2000)]
    candidate_id: Identifier
    age_hours: Literal[24, 72, 168] = 72
    attestation: Attestation

    @model_validator(mode="after")
    def unique_observations(self):
        observations = {}
        for snapshot in self.snapshots:
            key = (snapshot.video_id, snapshot.observed_at, snapshot.provider, snapshot.definition)
            if key in observations and observations[key] != snapshot.model_dump():
                raise ValueError("Conflicting values for the same observation")
            observations[key] = snapshot.model_dump()
        return self


STAGE_MODELS = {
    "discovery": Discovery, "product": Product, "queries": QueryPlan,
    "ingest": Ingestion, "observe": ShotObservation, "script": Script,
    "voice": Voice, "timeline": TimelineRequest, "review": Review, "sound": Sound,
}
