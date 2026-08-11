import base64
import hashlib
import hmac
import json
import secrets
import time
import urllib.parse
from dataclasses import dataclass

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse, Response

from app.config import get_settings

SESSION_COOKIE = "ryvl_session"
SESSION_TTL_SECONDS = 60 * 60 * 8
STATE_TTL_SECONDS = 60 * 10

settings = get_settings()
router = APIRouter(prefix="/api/auth", tags=["auth"])


@dataclass
class SessionUser:
    user_id: str
    username: str
    discriminator: str
    global_name: str | None
    avatar: str | None
    created_at: float


def _cookie_samesite() -> str:
    return "none"


_oauth_states: dict[str, tuple[str, float]] = {}


def _now() -> float:
    return time.time()


def _cleanup() -> None:
    now = _now()
    expired_states = [key for key, (_, expires) in _oauth_states.items() if expires <= now]
    for key in expired_states:
        _oauth_states.pop(key, None)


def _urlsafe_b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _urlsafe_b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _session_sign(payload_segment: str) -> str:
    secret = settings.session_secret.encode("utf-8")
    signature = hmac.new(secret, payload_segment.encode("utf-8"), hashlib.sha256).digest()
    return _urlsafe_b64encode(signature)


def _session_payload(user_payload: dict) -> dict[str, str | float | None]:
    created_at = _now()
    return {
        "user_id": str(user_payload.get("id") or ""),
        "username": str(user_payload.get("username") or ""),
        "discriminator": str(user_payload.get("discriminator") or ""),
        "global_name": user_payload.get("global_name"),
        "avatar": user_payload.get("avatar"),
        "created_at": created_at,
        "expires_at": created_at + SESSION_TTL_SECONDS,
    }


def _encode_session_token(user_payload: dict) -> str:
    payload = _session_payload(user_payload)
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_segment = _urlsafe_b64encode(payload_bytes)
    signature_segment = _session_sign(payload_segment)
    return f"{payload_segment}.{signature_segment}"


def _decode_session_token(token: str) -> SessionUser | None:
    try:
        payload_segment, signature_segment = token.split(".", 1)
    except ValueError:
        return None

    expected_signature = _session_sign(payload_segment)
    if not hmac.compare_digest(signature_segment, expected_signature):
        return None

    try:
        payload = json.loads(_urlsafe_b64decode(payload_segment).decode("utf-8"))
    except Exception:
        return None

    expires_at = float(payload.get("expires_at") or 0)
    if expires_at <= _now():
        return None

    return SessionUser(
        user_id=str(payload.get("user_id") or ""),
        username=str(payload.get("username") or ""),
        discriminator=str(payload.get("discriminator") or ""),
        global_name=payload.get("global_name"),
        avatar=payload.get("avatar"),
        created_at=float(payload.get("created_at") or 0),
    )


def _http_json(url: str, *, method: str = "GET", headers: dict[str, str] | None = None, body: bytes | None = None) -> dict:
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "RYVLBot/1.0 (+https://localhost)",
    }
    request_headers.update(headers or {})

    try:
        response = httpx.request(method=method, url=url, headers=request_headers, content=body, timeout=20.0)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as error:
        detail = error.response.text.strip() or f"HTTP {error.response.status_code}"
        raise RuntimeError(f"HTTP request failed for {url}: {detail}") from error
    except httpx.HTTPError as error:
        raise RuntimeError(f"HTTP request failed for {url}: {str(error)}") from error
    except Exception as error:
        raise RuntimeError(f"HTTP request failed for {url}") from error


def _exchange_code_for_token(code: str) -> str:
    basic_value = base64.b64encode(f"{settings.discord_client_id}:{settings.discord_client_secret}".encode("utf-8")).decode("utf-8")
    form = urllib.parse.urlencode(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.discord_oauth_redirect_uri,
        }
    ).encode("utf-8")

    headers = {
        "Authorization": f"Basic {basic_value}",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    url = "https://discord.com/api/v10/oauth2/token"
    try:
        response = httpx.request(method="POST", url=url, headers=headers, content=form, timeout=20.0)
        response.raise_for_status()
    except httpx.HTTPStatusError as error:
        payload = {}
        try:
            payload = error.response.json()
        except Exception:
            payload = {}

        error_value = str(payload.get("error") or "")
        description = str(payload.get("error_description") or "").strip()
        if error_value == "invalid_grant":
            raise RuntimeError("Discord OAuth code is invalid or already used. Start login again.") from error

        detail = error.response.text.strip() or f"HTTP {error.response.status_code}"
        raise RuntimeError(f"HTTP request failed for {url}: {detail}") from error
    except httpx.HTTPError as error:
        raise RuntimeError(f"HTTP request failed for {url}: {str(error)}") from error

    payload = response.json()
    token = str(payload.get("access_token") or "")
    if token:
        return token

    error_value = str(payload.get("error") or "")
    description = str(payload.get("error_description") or "")
    if error_value or description:
        if error_value == "invalid_grant":
            raise RuntimeError("Discord OAuth code is invalid or already used. Start login again.")
        raise RuntimeError(f"Discord OAuth token exchange failed: {error_value} {description}".strip())
    raise RuntimeError("Discord OAuth token exchange failed")


def _discord_me(access_token: str) -> dict:
    last_error: RuntimeError | None = None
    for url in (
        "https://discord.com/api/v10/users/@me",
        "https://discord.com/api/users/@me",
        "https://canary.discord.com/api/v10/users/@me",
        "https://ptb.discord.com/api/v10/users/@me",
    ):
        try:
            payload = _http_json(
                url,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if not payload.get("id"):
                raise RuntimeError("Discord user profile fetch failed")
            return payload
        except RuntimeError as error:
            last_error = error
            continue

    raise last_error or RuntimeError("Discord user profile fetch failed")


def _get_session_token(request: Request) -> str:
    cookie_token = str(request.cookies.get(SESSION_COOKIE) or "").strip()
    if cookie_token:
        return cookie_token

    query_token = str(request.query_params.get("session_token") or "").strip()
    if query_token:
        return query_token

    auth_header = str(request.headers.get("authorization") or "")
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()

    return ""


async def _user_is_admin_in_guild(request: Request, user_id: str) -> bool:
    if not settings.discord_guild_id:
        return False

    bot = getattr(request.app.state, "discord_bot", None)
    if bot is None or not bot.is_ready():
        raise HTTPException(status_code=503, detail="Discord bot is not connected yet")

    guild = bot.get_guild(int(settings.discord_guild_id))
    if guild is None:
        guild = await bot.fetch_guild(int(settings.discord_guild_id))

    member = guild.get_member(int(user_id))
    if member is None:
        member = await guild.fetch_member(int(user_id))

    return bool(member.guild_permissions.administrator)


def _new_session(user_payload: dict) -> str:
    return _encode_session_token(user_payload)


def _session_user(token: str) -> SessionUser | None:
    return _decode_session_token(token)


async def require_admin_session(request: Request) -> SessionUser:
    token = _get_session_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user = _session_user(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    return user


def _redirect_with_auth_error(target: str | None, *, error: str, description: str | None = None) -> RedirectResponse:
    safe_target = str(target or settings.admin_app_url).strip() or settings.admin_app_url
    url = urllib.parse.urlparse(safe_target)
    query = urllib.parse.parse_qs(url.query, keep_blank_values=True)
    query["auth_error"] = [error]
    if description:
        query["auth_error_description"] = [description]
    rebuilt = urllib.parse.urlunparse(
        (
            url.scheme,
            url.netloc,
            url.path,
            url.params,
            urllib.parse.urlencode(query, doseq=True),
            url.fragment,
        )
    )
    return RedirectResponse(url=rebuilt, status_code=302)


def _append_query_param(target: str, key: str, value: str) -> str:
    url = urllib.parse.urlparse(target)
    query = urllib.parse.parse_qs(url.query, keep_blank_values=True)
    query[key] = [value]
    return urllib.parse.urlunparse(
        (
            url.scheme,
            url.netloc,
            url.path,
            url.params,
            urllib.parse.urlencode(query, doseq=True),
            url.fragment,
        )
    )


@router.get("/discord/start")
def discord_oauth_start(return_to: str | None = None) -> RedirectResponse:
    if not settings.discord_client_id or not settings.discord_oauth_redirect_uri:
        return _redirect_with_auth_error(
            return_to or settings.admin_app_url,
            error="oauth_not_configured",
            description="Discord OAuth is not configured",
        )

    target = str(return_to or settings.admin_app_url).strip() or settings.admin_app_url
    state = secrets.token_urlsafe(24)
    _oauth_states[state] = (target, _now() + STATE_TTL_SECONDS)

    params = urllib.parse.urlencode(
        {
            "client_id": settings.discord_client_id,
            "redirect_uri": settings.discord_oauth_redirect_uri,
            "response_type": "code",
            "scope": "identify",
            "state": state,
            "prompt": "consent",
        }
    )
    return RedirectResponse(url=f"https://discord.com/oauth2/authorize?{params}", status_code=302)


@router.get("/discord/callback")
async def discord_oauth_callback(request: Request, code: str = "", state: str = "") -> RedirectResponse:
    _cleanup()
    if not code or not state:
        return _redirect_with_auth_error(
            settings.admin_app_url,
            error="missing_oauth_callback_parameters",
            description="Missing OAuth callback parameters",
        )

    state_row = _oauth_states.get(state)
    if state_row is None:
        return _redirect_with_auth_error(
            settings.admin_app_url,
            error="invalid_oauth_state",
            description="Invalid OAuth state",
        )

    return_to, expires_at = state_row
    if expires_at <= _now():
        _oauth_states.pop(state, None)
        return _redirect_with_auth_error(
            return_to,
            error="expired_oauth_state",
            description="Expired OAuth state",
        )

    # Consume state once so the callback code cannot be replayed.
    _oauth_states.pop(state, None)

    try:
        token = _exchange_code_for_token(code)
        user_payload = _discord_me(token)
    except RuntimeError as error:
        return _redirect_with_auth_error(
            return_to,
            error="oauth_exchange_failed",
            description=str(error),
        )

    try:
        is_admin = await _user_is_admin_in_guild(request, str(user_payload.get("id") or ""))
    except HTTPException as error:
        return _redirect_with_auth_error(
            return_to,
            error="discord_bot_unavailable",
            description=str(error.detail),
        )

    if not is_admin:
        return _redirect_with_auth_error(
            return_to,
            error="not_admin",
            description="You are not an admin in this server",
        )

    session_token = _new_session(user_payload)
    redirect_target = _append_query_param(return_to, "session_token", session_token)
    response = RedirectResponse(url=redirect_target, status_code=302)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=session_token,
        httponly=True,
        secure=True,
        samesite=_cookie_samesite(),
        max_age=SESSION_TTL_SECONDS,
        path="/",
    )
    response.headers["X-RYVL-Session"] = session_token
    return response


@router.get("/me")
async def auth_me(user: SessionUser = Depends(require_admin_session)) -> dict:
    return {
        "authenticated": True,
        "user": {
            "id": user.user_id,
            "username": user.username,
            "discriminator": user.discriminator,
            "global_name": user.global_name,
            "avatar": user.avatar,
        },
    }


@router.post("/logout")
async def auth_logout(request: Request) -> Response:
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response
