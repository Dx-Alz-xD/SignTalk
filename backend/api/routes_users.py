"""Public profiles. What one signed-in person may see about another."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import library
from .deps import current_user

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{username}")
def profile(username: str, user=Depends(current_user)):
    """Username, when they joined, and what they have published. `mine` and
    `installed` are resolved for the caller so the page can offer Install."""
    return library.public_profile(username, viewer_id=user.id)
