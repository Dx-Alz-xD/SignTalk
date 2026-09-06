"""Recording samples and running the interpreter.

The browser does the camera work and the hand tracking; it sends landmarks,
not frames. Nothing here ever sees an image, which is both the privacy story
and the reason the payloads stay small.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from .. import library
from ..landmarks import LandmarkError, to_frame
from detector import features as F
from .deps import current_user

router = APIRouter(prefix="/training", tags=["training"])

# One capture is ~40 samples; the cap is a sanity bound on a single request,
# not a limit on how much a symbol can hold (append with replace=false).
MAX_SAMPLES = 500


class SamplesBody(BaseModel):
    view: str = library.DEFAULT_VIEW
    replace: bool = False
    # [{"hands": [{"label", "score", "landmarks": [[x,y,z] x21]}]}, ...]
    samples: list[dict] = Field(min_length=1)


class PredictBody(BaseModel):
    hands: list[dict] = []
    languageId: str | None = None
    signId: str | None = None


class EncodeBody(BaseModel):
    """One live frame, for the stillness gate and the on-screen hand count."""
    hands: list[dict] = []


@router.post("/symbols/{symbol_id}/samples", status_code=status.HTTP_201_CREATED)
def store_samples(symbol_id: str, body: SamplesBody, user=Depends(current_user)):
    if len(body.samples) > MAX_SAMPLES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            f"Send at most {MAX_SAMPLES} samples per request.")
    try:
        result = library.store_samples(user.id, symbol_id, body.view,
                                       body.samples, replace=body.replace)
    except LandmarkError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    symbol = library.get_symbol(user.id, symbol_id)
    return {
        "view": result,
        "symbol": {"id": str(symbol["id"]), "name": symbol["name"]},
        "views": library.list_symbols(user.id, symbol["sign_id"]),
    }


@router.delete("/symbols/{symbol_id}/views/{view}")
def delete_view(symbol_id: str, view: str, user=Depends(current_user)):
    library.delete_view(user.id, symbol_id, view)
    return {"ok": True}


@router.get("/model")
def model_status(languageId: str | None = None, signId: str | None = None,
                 user=Depends(current_user)):
    """What the interpreter would be working with right now."""
    model = library.build_classifier(user.id, languageId, signId)
    return {
        "trained": model.trained,
        "labels": model.label_names,
        "sampleCount": int(model.matrix.shape[0]),
        "views": sorted({v for v in model.views if v}),
        "stale": model.stale,
        "featureVersion": F.FEATURE_VERSION,
    }


@router.post("/predict")
def predict(body: PredictBody, user=Depends(current_user)):
    """Classify one frame. The client smooths across frames, as the CLI does."""
    frame = to_frame(body.hands)
    if not frame.hands:
        return {"prediction": None, "hands": 0}

    vector = F.encode(frame)
    model = library.build_classifier(user.id, body.languageId, body.signId)
    if not model.trained:
        return {"prediction": None, "hands": frame.count, "untrained": True}

    result = model.predict(vector)
    if result is None:
        return {"prediction": None, "hands": frame.count}

    return {
        "hands": frame.count,
        "prediction": {
            "label": result.label,
            "confidence": round(float(result.confidence), 4),
            "view": result.view,
            "margin": round(float(result.margin), 4),
            "runnerUp": result.runner_up_label,
            "meta": result.meta,
        },
    }


@router.post("/encode")
def encode(body: EncodeBody, user=Depends(current_user)):
    """Feature vector for one frame, so the client can measure stillness with
    the same distance function the recogniser uses."""
    frame = to_frame(body.hands)
    vector = F.encode(frame)
    return {
        "hands": frame.count,
        "vector": None if vector is None else [round(float(v), 4) for v in vector],
    }


@router.post("/refresh")
def refresh(user=Depends(current_user)):
    """Re-encode samples stored under an older feature layout."""
    fixed = library.refresh_stale_features(user.id)
    return {"ok": True, "viewsRefreshed": fixed}
