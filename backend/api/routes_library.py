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


@router.get("/languages")
def list_languages(user=Depends(current_user)):
    return {"languages": library.list_languages(user.id)}


@router.post("/languages", status_code=status.HTTP_201_CREATED)
def create_language(body: LanguageBody, user=Depends(current_user)):
    return {"language": library.create_language(user.id, body.name, body.description)}


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


@router.delete("/symbols/{symbol_id}")
def delete_symbol(symbol_id: str, user=Depends(current_user)):
    library.delete_symbol(user.id, symbol_id)
    return {"ok": True}


@router.post("/vocabulary", status_code=status.HTTP_201_CREATED)
def create_vocabulary(body: VocabularyBody, user=Depends(current_user)):
    """One call behind the Add New form: language + the sign inside it."""
    language_name = (body.language or "").strip() or body.name
    language = library.find_or_create_language(user.id, language_name)

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
