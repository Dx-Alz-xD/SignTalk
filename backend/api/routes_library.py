"""Languages, signs and symbols. Everything is scoped to the caller."""

from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field

from .. import library
from ..errors import Invalid
from .deps import current_user

router = APIRouter(prefix="/library", tags=["library"])


class LanguageBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""
    handControl: str = library.DEFAULT_HAND_CONTROL
    sampleTarget: int = library.DEFAULT_SAMPLE_TARGET


class LanguageUpdateBody(BaseModel):
    """Every field optional: this is an edit, not a replace."""
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = None
    handControl: str | None = None
    sampleTarget: int | None = None
    gestureTranslation: bool | None = None
    gestureIntervalMs: int | None = None
    spokenLanguage: str | None = Field(default=None, min_length=2, max_length=12)
    tag: str | None = Field(default=None, max_length=60)


class ImageBody(BaseModel):
    """A symbol's reference picture, base64 so it rides the same JSON client."""
    mime: str = Field(min_length=1, max_length=40)
    data: str = Field(min_length=1, max_length=600_000)   # ~400 KB of bytes
    width: int | None = None
    height: int | None = None


class SymbolUpdateBody(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    outputKind: str | None = None
    outputValue: str | None = None


class PublishBody(BaseModel):
    public: bool = True


class SignBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    hasPhrases: bool = False
    phrases: list[str] = []


class SymbolBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class VocabularyBody(BaseModel):
    """What the Add New form collects, in one call.

    The form asks for a vocabulary name, an optional language and whether it
    holds phrases. That maps onto a language (created if new) containing one
    sign - so the two-step wizard is a single round trip, and refreshing the
    configure page cannot create a second copy.
    """
    name: str = Field(min_length=1, max_length=80)
    language: str = ""
    phrasesIncluded: bool = False
    phrases: list[str] = []
    handControl: str = library.DEFAULT_HAND_CONTROL
    sampleTarget: int = library.DEFAULT_SAMPLE_TARGET
    gestureTranslation: bool = False
    gestureIntervalMs: int = library.DEFAULT_GESTURE_INTERVAL_MS
    spokenLanguage: str = library.DEFAULT_SPOKEN_LANGUAGE
    description: str = Field(default="", max_length=600)
    tag: str = Field(default="", max_length=60)


@router.get("/languages")
def list_languages(user=Depends(current_user)):
    # Anyone who signed in before a built-in language was imported picks it up
    # here, the first time their library is listed.
    try:
        from .. import builtin
        builtin.ensure_installed(user.id)
    except Exception:
        pass
    return {"languages": library.list_languages(user.id)}


@router.post("/languages", status_code=status.HTTP_201_CREATED)
def create_language(body: LanguageBody, user=Depends(current_user)):
    return {"language": library.create_language(
        user.id, body.name, body.description,
        hand_control=body.handControl, sample_target=body.sampleTarget,
    )}


@router.patch("/languages/{language_id}")
def update_language(language_id: str, body: LanguageUpdateBody,
                    user=Depends(current_user)):
    return {"language": library.update_language(
        user.id, language_id,
        name=body.name, description=body.description,
        hand_control=body.handControl, sample_target=body.sampleTarget,
        gesture_translation=body.gestureTranslation,
        gesture_interval_ms=body.gestureIntervalMs,
        spoken_language=body.spokenLanguage,
        tag=body.tag,
    )}


@router.get("/languages/{language_id}/review")
def review_language(language_id: str, user=Depends(current_user)):
    """The security review publishing runs, so the owner can see it first."""
    return library.review_language(user.id, language_id)


@router.delete("/languages/{language_id}")
def delete_language(language_id: str, user=Depends(current_user)):
    library.delete_language(user.id, language_id)
    return {"ok": True}


@router.get("/languages/{language_id}/signs")
def list_signs(language_id: str, user=Depends(current_user)):
    return {"signs": library.list_signs(user.id, language_id)}


@router.post("/languages/{language_id}/signs", status_code=status.HTTP_201_CREATED)
def create_sign(language_id: str, body: SignBody, user=Depends(current_user)):
    sign = library.create_sign(user.id, language_id, body.name,
                               body.hasPhrases, body.phrases)
    return {"sign": sign}


@router.delete("/signs/{sign_id}")
def delete_sign(sign_id: str, user=Depends(current_user)):
    """Delete a vocabulary and everything in it. Removes its language as well
    when this was the last vocabulary in it."""
    return {"ok": True, **library.delete_sign(user.id, sign_id)}


@router.get("/signs/{sign_id}/symbols")
def list_symbols(sign_id: str, user=Depends(current_user)):
    return {"symbols": library.list_symbols(user.id, sign_id)}


@router.post("/signs/{sign_id}/symbols", status_code=status.HTTP_201_CREATED)
def create_symbol(sign_id: str, body: SymbolBody, user=Depends(current_user)):
    return {"symbol": library.create_symbol(user.id, sign_id, body.name)}


@router.patch("/symbols/{symbol_id}")
def update_symbol(symbol_id: str, body: SymbolUpdateBody, user=Depends(current_user)):
    return {"symbol": library.update_symbol(
        user.id, symbol_id,
        name=body.name, output_kind=body.outputKind, output_value=body.outputValue,
    )}


@router.delete("/symbols/{symbol_id}")
def delete_symbol(symbol_id: str, user=Depends(current_user)):
    library.delete_symbol(user.id, symbol_id)
    return {"ok": True}


# ------------------------------------------------------------------ images --

@router.put("/symbols/{symbol_id}/image")
def put_symbol_image(symbol_id: str, body: ImageBody, user=Depends(current_user)):
    try:
        data = base64.b64decode(body.data, validate=True)
    except (ValueError, TypeError):
        raise Invalid("The picture is not valid base64.") from None
    stored = library.set_symbol_image(user.id, symbol_id, data, body.mime,
                                      body.width, body.height)
    return {"image": {"symbolId": str(stored["symbol_id"]), "mime": stored["mime"],
                      "width": stored["width"], "height": stored["height"]}}


@router.get("/symbols/{symbol_id}/image")
def get_symbol_image(symbol_id: str, user=Depends(current_user)):
    """The symbol's picture: the stored photo if there is one, otherwise its
    hand skeleton drawn from a stored sample - so every trained symbol has one."""
    found = library.get_symbol_image(user.id, symbol_id)
    if found is None:
        raise library.NotFound("This symbol has no samples to draw yet.")
    return Response(content=found["image"], media_type=found["mime"],
                    headers={"Cache-Control": "private, max-age=300",
                             "X-SignTalk-Picture": "skeleton" if found.get("generated") else "photo"})


@router.delete("/symbols/{symbol_id}/image")
def delete_symbol_image(symbol_id: str, user=Depends(current_user)):
    library.delete_symbol_image(user.id, symbol_id)
    return {"ok": True}


# ----------------------------------------------------------------- sharing --

@router.post("/languages/{language_id}/publish")
def publish(language_id: str, body: PublishBody, user=Depends(current_user)):
    """Add this language to the community database, or take it back out."""
    return {"language": library.publish_language(user.id, language_id, body.public)}


@router.get("/community")
def browse_community(q: str = "", user=Depends(current_user)):
    """Everything published, with `mine` and `installed` already resolved."""
    return {"languages": library.list_published(user.id, q)}


@router.post("/community/{language_id}/install", status_code=status.HTTP_201_CREATED)
def install(language_id: str, user=Depends(current_user)):
    """Copy a published language, samples and all, into your own library."""
    return {"language": library.install_language(user.id, language_id)}


@router.post("/vocabulary", status_code=status.HTTP_201_CREATED)
def create_vocabulary(body: VocabularyBody, user=Depends(current_user)):
    """One call behind the Add New form: language + the sign inside it."""
    language_name = (body.language or "").strip() or body.name
    language = library.find_or_create_language(user.id, language_name)

    # The form carries the language's own settings, so an existing language
    # picked by name still gets the hand control and sample size just chosen.
    language = library.update_language(
        user.id, language["id"],
        hand_control=body.handControl, sample_target=body.sampleTarget,
        gesture_translation=body.gestureTranslation,
        gesture_interval_ms=body.gestureIntervalMs,
        spoken_language=body.spokenLanguage,
        tag=body.tag,
        description=body.description,
    )

    # Re-submitting the same vocabulary reopens it instead of erroring, so a
    # refresh or a back-then-forward does not strand the user.
    sign = None
    for existing in library.list_signs(user.id, language["id"]):
        if existing["name"].lower() == body.name.strip().lower():
            sign = library.get_sign(user.id, existing["id"])
            break
    if sign is None:
        sign = library.create_sign(user.id, language["id"], body.name,
                                   body.phrasesIncluded, body.phrases)

    return {
        "language": language,
        "sign": sign,
        "symbols": library.list_symbols(user.id, sign["id"]),
    }
