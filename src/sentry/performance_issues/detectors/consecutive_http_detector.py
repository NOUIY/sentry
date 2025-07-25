from __future__ import annotations

from typing import Any

from sentry.issues.grouptype import PerformanceConsecutiveHTTPQueriesGroupType
from sentry.issues.issue_occurrence import IssueEvidence
from sentry.models.organization import Organization
from sentry.models.project import Project
from sentry.performance_issues.detectors.utils import get_max_span_duration, get_total_span_duration
from sentry.utils.event import is_event_from_browser_javascript_sdk
from sentry.utils.safe import get_path

from ..base import (
    DetectorType,
    PerformanceDetector,
    does_overlap_previous_span,
    fingerprint_http_spans,
    get_duration_between_spans,
    get_notification_attachment_body,
    get_span_duration,
    get_span_evidence_value,
)
from ..performance_problem import PerformanceProblem
from ..types import Span


class ConsecutiveHTTPSpanDetector(PerformanceDetector):
    type = DetectorType.CONSECUTIVE_HTTP_OP
    settings_key = DetectorType.CONSECUTIVE_HTTP_OP

    def __init__(self, settings: dict[DetectorType, Any], event: dict[str, Any]) -> None:
        super().__init__(settings, event)

        self.consecutive_http_spans: list[Span] = []
        self.lcp = None

        lcp_value = get_path(self.event(), "measurements", "lcp", "value")
        lcp_unit = get_path(self.event(), "measurements", "lcp", "unit")
        if lcp_value and (lcp_unit is None or lcp_unit == "millisecond"):
            self.lcp = lcp_value

    @classmethod
    def is_event_eligible(cls, event: dict[str, Any], project: Project | None = None) -> bool:
        return not is_event_from_browser_javascript_sdk(event)

    def visit_span(self, span: Span) -> None:
        span_id = span.get("span_id", None)
        if not span_id or not self._is_eligible_http_span(span):
            return

        span_duration = get_span_duration(span).total_seconds() * 1000
        if span_duration < self.settings.get("span_duration_threshold"):
            return

        if self._overlaps_last_span(span):
            self._validate_and_store_performance_problem()
            self._reset_variables()

        self._add_problem_span(span)

    def _add_problem_span(self, span: Span) -> None:
        self.consecutive_http_spans.append(span)

    def _validate_and_store_performance_problem(self) -> None:
        exceeds_count_threshold = len(self.consecutive_http_spans) >= self.settings.get(
            "consecutive_count_threshold"
        )
        if not exceeds_count_threshold:
            return

        exceeds_min_time_saved_duration = False
        if self.consecutive_http_spans:
            exceeds_min_time_saved_duration = self._calculate_time_saved() >= self.settings.get(
                "min_time_saved"
            )
        if not exceeds_min_time_saved_duration:
            return

        subceeds_duration_between_spans_threshold = all(
            get_duration_between_spans(
                self.consecutive_http_spans[idx - 1], self.consecutive_http_spans[idx]
            )
            < self.settings.get("max_duration_between_spans")
            for idx in range(1, len(self.consecutive_http_spans))
        )
        if not subceeds_duration_between_spans_threshold:
            return

        self._store_performance_problem()

    def _calculate_time_saved(self) -> float:
        total_time = get_total_span_duration(self.consecutive_http_spans)
        max_span_duration = get_max_span_duration(self.consecutive_http_spans)

        return total_time - max_span_duration

    def _store_performance_problem(self) -> None:
        fingerprint = self._fingerprint()
        offender_span_ids = [span["span_id"] for span in self.consecutive_http_spans]
        desc: str = self.consecutive_http_spans[0].get("description", "")

        self.stored_problems[fingerprint] = PerformanceProblem(
            fingerprint,
            "http",
            desc=desc,
            type=PerformanceConsecutiveHTTPQueriesGroupType,
            cause_span_ids=[],
            parent_span_ids=None,
            offender_span_ids=offender_span_ids,
            evidence_display=[
                IssueEvidence(
                    name="Offending Spans",
                    value=get_notification_attachment_body(
                        "http",
                        desc,
                    ),
                    # Has to be marked important to be displayed in the notifications
                    important=True,
                )
            ],
            evidence_data={
                "parent_span_ids": [],
                "cause_span_ids": [],
                "offender_span_ids": offender_span_ids,
                "op": "http",
                "transaction_name": self._event.get("transaction", ""),
                "repeating_spans": get_span_evidence_value(self.consecutive_http_spans[0]),
                "repeating_spans_compact": get_span_evidence_value(
                    self.consecutive_http_spans[0], include_op=False
                ),
                "num_repeating_spans": str(len(self.consecutive_http_spans)),
            },
        )

        self._reset_variables()

    def _overlaps_last_span(self, span: Span) -> bool:
        if len(self.consecutive_http_spans) == 0:
            return False
        last_span = self.consecutive_http_spans[-1]
        return does_overlap_previous_span(last_span, span)

    def _reset_variables(self) -> None:
        self.consecutive_http_spans = []

    def _is_eligible_http_span(self, span: Span) -> bool:
        span_id = span.get("span_id", None)
        op: str = span.get("op", "") or ""
        hash = span.get("hash", None)
        description: str = span.get("description", "") or ""

        if not span_id or not op or not hash or not description:
            return False

        if not op.startswith("http.client"):
            return False

        if (
            not description.strip().upper().startswith(("GET", "POST", "DELETE", "PUT", "PATCH"))
        ):  # Just using all methods to see if anything interesting pops up
            return False

        if any([x in description for x in ["_next/static/", "_next/data/", "googleapis.com"]]):
            return False

        return True

    def _fingerprint(self) -> str:
        hashed_url_paths = fingerprint_http_spans(self.consecutive_http_spans)
        return f"1-{PerformanceConsecutiveHTTPQueriesGroupType.type_id}-{hashed_url_paths}"

    def on_complete(self) -> None:
        self._validate_and_store_performance_problem()

    def is_creation_allowed_for_organization(self, organization: Organization) -> bool:
        return True

    def is_creation_allowed_for_project(self, project: Project) -> bool:
        return self.settings["detection_enabled"]
