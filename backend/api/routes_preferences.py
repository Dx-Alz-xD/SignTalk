"""Per-account settings.

    GET    /preferences   this account's settings
    PATCH  /preferences   change some of them
    DELETE /preferences   back to defaults
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .. import preferences
from .deps import current_user

router = APIRouter(prefix="/preferences", tags=["preferences"])


class OverlayBody(BaseModel):
    x: float | None = None
    y: float | None = None
    width: float | None = None
    opacity: float | None = None
    caption: bool | None = None


class PreferencesBody(BaseModel):
    """Every field optional: this is a change, not a replace."""

    theme: str | None = Field(default=None, max_length=20)
    cameraDeviceId: str | None = Field(default=None, max_length=200)
    mirrorPreview: bool | None = None
    showSkeleton: bool | None = None
    minConfidence: float | None = None
    pace: str | None = Field(default=None, max_length=20)
    captureCountdown: int | None = None
    reduceMotion: bool | None = None
    overlay: OverlayBody | None = None


@router.get("")
def read(user=Depends(current_user)):
    return {"preferences": preferences.get(user.id)}


@router.patch("")
def change(body: PreferencesBody, user=Depends(current_user)):
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if body.overlay is not None:
        changes["overlay"] = body.overlay.model_dump(exclude_unset=True, exclude_none=True)
    return {"preferences": preferences.update(user.id, changes)}


@router.delete("")
def reset(user=Depends(current_user)):
    return {"preferences": preferences.reset(user.id)}
