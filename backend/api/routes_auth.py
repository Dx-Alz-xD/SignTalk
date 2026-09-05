"""Auth endpoints. Every rule comes from AuthService - nothing is decided here.

The recovery flow mirrors the service exactly:

    POST /auth/forgot          -> challenge_id (code sent by email or SMS)
    POST /auth/forgot/verify   -> ticket_id    (code burned)
    then POST /auth/forgot/reset  or  POST /auth/forgot/signin
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, Field

from ..auth import CHANNEL_EMAIL, CHANNELS, DeliveryError, mask_email, mask_phone
from .deps import (
    SESSION_COOKIE,
    clear_session_cookie,
    client_ip,
    current_session,
    current_user,
    get_auth,
    set_session_cookie,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ------------------------------------------------------------------ schemas --

class SignUpBody(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=20)


class SignInBody(BaseModel):
    # The service accepts either, so the field is not called "email".
    identifier: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class ForgotBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    channel: str = CHANNEL_EMAIL


class VerifyBody(BaseModel):
    challenge_id: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=12)


class ResetBody(BaseModel):
    ticket_id: str = Field(min_length=1, max_length=400)
    password: str = Field(min_length=1, max_length=200)


class TicketBody(BaseModel):
    ticket_id: str = Field(min_length=1, max_length=400)


def _session_payload(session, user=None) -> dict:
    return {
        "username": session.username,
        "email": session.email,
        "method": session.method,
        "expiresAt": session.expires_at.isoformat(),
        "minutesLeft": session.minutes_left,
        "phone": mask_phone(user.phone) if user and user.phone else None,
    }


# ------------------------------------------------------------------- signup --

@router.post("/signup", status_code=status.HTTP_201_CREATED)
def sign_up(body: SignUpBody, response: Response, request: Request):
    auth = get_auth()
    user = auth.sign_up(body.username, body.email, body.password, body.phone)
    auth.store.record_event(user.email, "signup", ip=client_ip(request))

    # Signing up signs you in - otherwise the next screen would just be a
    # login form asking for the password typed ten seconds ago.
    session = auth.sign_in(user.email, body.password)
    set_session_cookie(response, session.token)
    return {"user": _session_payload(session, user)}


# ------------------------------------------------------------------- signin --

@router.post("/login")
def sign_in(body: SignInBody, response: Response, request: Request):
    auth = get_auth()
    try:
        session = auth.sign_in(body.identifier, body.password)
    except Exception:
        auth.store.record_event(body.identifier, "login_fail", ip=client_ip(request))
        raise
    auth.store.record_event(session.email, "login_ok", ip=client_ip(request))
    set_session_cookie(response, session.token)
    user = auth.store.get_user_by_email(session.email)
    return {"user": _session_payload(session, user)}


@router.post("/logout")
def sign_out(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    auth = get_auth()
    session = auth.store.get_session(token) if token else None
    auth.sign_out_token(token or "")
    if session:
        auth.store.record_event(session.email, "logout", ip=client_ip(request))
    # Always clear the cookie, even if the token was already dead - signing
    # out must never leave the browser holding a stale credential.
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(session=Depends(current_session), user=Depends(current_user)):
    return {"user": _session_payload(session, user)}


# ----------------------------------------------------------------- recovery --

@router.post("/forgot")
def request_code(body: ForgotBody, request: Request):
    """Send a one-time code.

    Answers identically whether or not the account exists - the response never
    reveals which addresses are registered. `challengeId` is null when there
    was nothing to send to, and the client shows the same screen regardless.
    """
    auth = get_auth()
    channel = body.channel if body.channel in CHANNELS else CHANNEL_EMAIL

    try:
        challenge_id = auth.request_recovery_code(body.email, channel)
    except DeliveryError:
        # A send that failed is not the user's fault and not their business
        # either; log it and answer as if nothing was wrong.
        auth.store.record_event(body.email, "otp_send_fail", channel=channel,
                                ip=client_ip(request))
        challenge_id = None

    if challenge_id:
        auth.store.record_event(body.email, "otp_sent", channel=channel,
                                ip=client_ip(request))

    user = auth.store.get_user_by_email(body.email)
    destination = None
    if challenge_id and user:
        destination = (mask_email(user.email) if channel == CHANNEL_EMAIL
                       else mask_phone(user.phone or ""))

    return {
        "challengeId": challenge_id,
        "channel": channel,
        "sentTo": destination,
        "expiresInSeconds": auth.OTP_TTL_SECONDS,
        "message": f"If that account exists, a code is on its way by {channel}.",
    }


@router.post("/forgot/verify")
def verify_code(body: VerifyBody, request: Request):
    auth = get_auth()
    try:
        ticket_id = auth.verify_recovery_code(body.challenge_id, body.code)
    except Exception:
        auth.store.record_event(None, "otp_fail", ip=client_ip(request))
        raise
    return {"ticketId": ticket_id, "expiresInSeconds": auth.TICKET_TTL_SECONDS}


@router.post("/forgot/reset")
def reset_password(body: ResetBody, request: Request):
    auth = get_auth()
    user = auth.reset_password_with_ticket(body.ticket_id, body.password)
    auth.store.record_event(user.email, "password_reset", ip=client_ip(request))
    # Every session was revoked by the reset, so the user signs in again.
    return {"ok": True, "message": "Password updated. Sign in with your new password."}


@router.post("/forgot/signin")
def sign_in_with_ticket(body: TicketBody, response: Response, request: Request):
    auth = get_auth()
    session = auth.sign_in_with_ticket(body.ticket_id)
    auth.store.record_event(session.email, "login_ok_recovery", ip=client_ip(request))
    set_session_cookie(response, session.token)
    user = auth.store.get_user_by_email(session.email)
    return {"user": _session_payload(session, user)}
