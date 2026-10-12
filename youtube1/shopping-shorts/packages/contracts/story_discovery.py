"""Separate story-first contracts; legacy shopping observations remain unchanged."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, HttpUrl, model_validator
from packages.contracts.models import Contract, Identifier, Nonempty


class TrendPoint(Contract):
    at: AwareDatetime
    value: Annotated[float, Field(ge=0)]


class StoryEvidence(Contract):
    url: HttpUrl
    title: Nonempty
    summary: Nonempty
    surface: Literal["web-article", "chrome-article", "chrome-video", "provided-transcript", "search-results", "search-trend"]
    observed_at: AwareDatetime
    published_at: AwareDatetime | None = None
    actor: Nonempty
    model: Nonempty
    source_family: Nonempty
    observation_scope: Nonempty
    series: list[TrendPoint] = Field(default_factory=list, max_length=366)
    series_basis: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def coherent_times(self):
        if self.published_at and self.published_at > self.observed_at:
            raise ValueError("publication cannot be after observation")
        if any(p.at > self.observed_at for p in self.series):
            raise ValueError("future trend observations are not evidence")
        if self.series and (self.surface != "search-trend" or not self.series_basis.strip()):
            raise ValueError("trend series needs search-trend surface and common provider/window basis")
        if len({p.at for p in self.series}) != len(self.series):
            raise ValueError("duplicate observation times")
        return self


class StoryClaim(Contract):
    text: Nonempty
    evidence_ids: list[Identifier] = Field(min_length=1, max_length=10)


class StoryOutline(Contract):
    content_kind: Literal["personal_story", "reported_event", "fiction", "explanation", "unknown"] = "unknown"
    hook: Nonempty
    setup: Nonempty
    turn: Nonempty
    payoff: Nonempty
    claims: list[StoryClaim] = Field(min_length=1, max_length=20)
    survives_without_sales_pitch: bool
    content_review_complete: bool = False


class ProductBridge(Contract):
    category: Nonempty
    role: Literal["story_object", "action_tool", "taste_expression", "related_problem"]
    reason: Nonempty
    placement: Nonempty
    evidence_ids: list[Identifier] = Field(min_length=1, max_length=10)
    unrelated_product_would_be_awkward: bool
    identity: Literal["category_only", "exact_item_unverified"] = "category_only"


class PlanningBrief(Contract):
    working_title: Nonempty
    audience: Nonempty
    opening: Nonempty
    beats: list[Nonempty] = Field(min_length=3, max_length=6)
    ending: Nonempty
    product_placement: Nonempty
    avoid: list[Nonempty] = Field(min_length=1, max_length=8)
    next_checks: list[Nonempty] = Field(min_length=1, max_length=8)


class StoryTopicReview(Contract):
    topic_id: Identifier
    topic: Nonempty
    angle: Nonempty
    why_now: Nonempty
    evidence_ids: list[Identifier] = Field(min_length=1, max_length=30)
    independent_source_ids: list[Identifier] = Field(default_factory=list, max_length=20)
    independence_reason: str = Field(default="", max_length=2000)
    video_ids: list[Identifier] = Field(default_factory=list, max_length=20)
    story: StoryOutline
    bridges: list[ProductBridge] = Field(default_factory=list, max_length=3)
    followup_queries: list[Annotated[str, Field(min_length=2, max_length=200)]] = Field(default_factory=list, max_length=5)
    missing_evidence: list[Nonempty] = Field(default_factory=list, max_length=20)
    optional_followups: list[Nonempty] = Field(default_factory=list, max_length=20)
    actor: Nonempty
    model: Nonempty
    planning_brief: PlanningBrief | None = None

    @model_validator(mode="after")
    def bind_references(self):
        ids = set(self.evidence_ids)
        if len(ids) != len(self.evidence_ids):
            raise ValueError("duplicate evidence references")
        referenced = set(self.independent_source_ids)
        for part in [*self.story.claims, *self.bridges]:
            referenced.update(part.evidence_ids)
        if not referenced <= ids:
            raise ValueError("claims, bridges and independent sources must reference the topic's evidence")
        if self.independent_source_ids and not self.independence_reason.strip():
            raise ValueError("source independence needs an observed reason")
        return self


class StoryCollectionRequest(Contract):
    queries: list[Annotated[str, Field(min_length=2, max_length=200)]] = Field(default_factory=list, max_length=12)
    window_days: Annotated[int, Field(ge=1, le=28)] = 7
    search_budget: Annotated[int, Field(ge=0, le=12)] = 6
    read_budget: Annotated[int, Field(ge=0, le=300)] = 100
    stats_budget: Annotated[int, Field(ge=0, le=50)] = 20
    max_candidates: Annotated[int, Field(ge=1, le=500)] = 150


class StorySelection(Contract):
    topic_id: Identifier
    expected_revision: Annotated[int, Field(ge=1)]


class NarrativeIntake(Contract):
    """First pass intentionally has no product fields: assess the story first."""
    video_id: Identifier
    event_key: Identifier
    domain: Literal["relationships", "work", "daily_life", "hobbies", "culture", "curiosity"]
    content_kind: Literal["personal_story", "reported_event", "fiction", "explanation", "unknown"]
    decision: Literal["candidate", "reject", "needs_content"]
    summary: Nonempty
    reason: Nonempty
    hook: str = Field(default="", max_length=2000)
    change: str = Field(default="", max_length=2000)
    payoff: str = Field(default="", max_length=2000)
    evidence_ids: list[Identifier] = Field(default_factory=list, max_length=10)
    followup_queries: list[Annotated[str, Field(min_length=2, max_length=200)]] = Field(default_factory=list, max_length=5)
    actor: Nonempty
    model: Nonempty

    @model_validator(mode="after")
    def complete_candidate(self):
        if self.decision == "candidate" and (not all((self.hook.strip(), self.change.strip(), self.payoff.strip(), self.evidence_ids)) or self.content_kind == "unknown"):
            raise ValueError("story candidate needs content evidence, hook, change, payoff and content kind")
        return self


class NarrativeIntakeBatch(Contract):
    items: list[NarrativeIntake] = Field(min_length=1, max_length=5)

    @model_validator(mode="after")
    def distinct_videos(self):
        if len({item.video_id for item in self.items}) != len(self.items):
            raise ValueError("duplicate video in review batch")
        return self


class ChannelUploadObservation(Contract):
    video_id: Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{11}$")]
    title: Nonempty
    age_text: Annotated[str, Field(pattern=r"^\d+\s*(분|시간|일|주)\s*전$")]


class StoryChannelObservation(Contract):
    channel_id: Annotated[str, Field(pattern=r"^UC[A-Za-z0-9_-]{22}$")]
    source_url: HttpUrl
    observed_at: AwareDatetime
    uploads: list[ChannelUploadObservation] = Field(min_length=5, max_length=50)
    actor: Nonempty
    model: Nonempty

    @model_validator(mode="after")
    def bound_channel(self):
        if str(self.source_url) not in {f"https://www.youtube.com/channel/{self.channel_id}/videos", f"https://www.youtube.com/channel/{self.channel_id}/shorts"}:
            raise ValueError("observe the channel's own upload tab")
        if len({u.video_id for u in self.uploads}) != len(self.uploads):
            raise ValueError("duplicate observed upload")
        return self
