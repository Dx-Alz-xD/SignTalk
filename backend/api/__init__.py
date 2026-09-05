"""HTTP layer for SignTalk.

    uvicorn backend.api.main:app --reload --port 8000

The auth rules all live in backend/auth/service.py - this package only
translates HTTP to that service and back, so the CLI and the web app can never
drift apart on what a valid password or an expired code means.
"""
