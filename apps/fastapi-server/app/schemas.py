from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_validator, model_validator


class DateRange(BaseModel):
    """
    Matches request.date_range.{start_date,end_date} from the dashboard
    server. Accepts any ISO8601 string (with or without a timezone) —
    the Node side sends `.toISOString()` output, which is always UTC
    with a trailing "Z".
    """

    start_date: datetime
    end_date: datetime

    @field_validator("start_date", "end_date")
    @classmethod
    def ensure_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def start_before_end(self) -> "DateRange":
        if self.start_date >= self.end_date:
            raise ValueError("date_range.start_date must be before date_range.end_date")
        return self


class AskRequest(BaseModel):
    """
    Exactly matches what packages/shared/src/lib/ai-agent.ts sends:
        { site_id, question, date_range: { start_date, end_date } }
    """

    site_id: str = Field(min_length=1)
    question: str = Field(min_length=1, max_length=2000)
    date_range: DateRange

    @field_validator("question")
    @classmethod
    def strip_question(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("question cannot be blank")
        return stripped


class AskResponse(BaseModel):
    """
    The dashboard server forwards this straight through to the frontend,
    which reads `answer` and ignores everything else (its AskResponse
    type has an index signature) — so extra fields here are safe to add
    later without a frontend change.
    """

    answer: str
    site_id: str
    generated_at: datetime
    tools_used: list[str] = Field(default_factory=list)
