"""Languages, signs and symbols. Everything is scoped to the caller."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from .. import library
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


@router.get("/languages")
def list_languages(user=Depends(current_user)):
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
    )}


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
