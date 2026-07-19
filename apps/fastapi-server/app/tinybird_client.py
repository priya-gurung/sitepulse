from typing import Any

import httpx

from .config import Settings


class TinybirdClient:
    """
    Read-only Tinybird client. Mirrors `queryPipe` from
    packages/shared/src/lib/tinybird.ts in the Node backend — same pipe
    names (`overview_metrics`, `pageviews_by_granularity`, `top_pages`,
    `top_referrers`, `visitors_by_country`) and the same query params
    (`site_id`, `date_from`, `date_to`, `granularity`), so this agent
    reads from exactly the datasource the dashboard already trusts.

    This client only ever reads. There is no ingest method here on
    purpose — the AI agent has no business writing analytics events.
    """

    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self._host = settings.TINYBIRD_HOST.rstrip("/")
        self._token = settings.TINYBIRD_READ_TOKEN
        self._client = client

    async def query_pipe(self, pipe_name: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        clean_params = {}
        for k, v in params.items():
            if v is not None:
                if isinstance(v, str) and ("T" in v or "+" in v):
                    try:
                        # Extract the base date and time segments, skipping trailing timezone text
                        # e.g., '2026-07-11T12:57:22.596000+00:00' -> '2026-07-11 12:57:22'
                        clean_date_str = v.replace("T", " ").split(".")[0].split("+")[0]
                        clean_params[k] = clean_date_str
                        continue
                    except Exception:
                        pass
                clean_params[k] = v
                            
        print(f"\n[Tinybird Client Outbound] Pipe Target: {pipe_name}")
        print(f"[Tinybird Client Outbound] Formatted Params: {clean_params}")

        res = await self._client.get(
            f"{self._host}/v0/pipes/{pipe_name}.json",
            params=clean_params,
            headers={"Authorization": f"Bearer {self._token}"},
        )

        # ----------------------------------------
        print(f"[Tinybird Client Response] Status Code: {res.status_code}")
        if res.status_code >= 400:
            print(f"[Tinybird Client Error Body]: {res.text}\n")
            raise TinybirdError(pipe_name, res.status_code, res.text)

        return res.json().get("data", [])


class TinybirdError(RuntimeError):
    def __init__(self, pipe_name: str, status_code: int, body: str):
        super().__init__(f"Tinybird pipe '{pipe_name}' failed ({status_code}): {body[:300]}")
        self.pipe_name = pipe_name
        self.status_code = status_code
