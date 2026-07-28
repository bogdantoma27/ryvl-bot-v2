from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = Field(default="development", alias="APP_ENV")
    app_name: str = Field(default="RYVL Bot API", alias="APP_NAME")
    public_api_base_url: str = Field(default="http://localhost:8000", alias="PUBLIC_API_BASE_URL")

    discord_token: str = Field(default="", alias="DISCORD_TOKEN")
    discord_client_id: str = Field(default="", alias="DISCORD_CLIENT_ID")
    discord_client_secret: str = Field(default="", alias="DISCORD_CLIENT_SECRET")
    discord_oauth_redirect_uri: str = Field(default="http://localhost:8000/api/auth/discord/callback", alias="DISCORD_OAUTH_REDIRECT_URI")
    discord_guild_id: str = Field(default="", alias="DISCORD_GUILD_ID")
    admin_role_ids: str = Field(default="", alias="ADMIN_ROLE_IDS")
    default_attendance_channel_id: str = Field(default="", alias="DEFAULT_ATTENDANCE_CHANNEL_ID")
    default_lineup_channel_id: str = Field(default="", alias="DEFAULT_LINEUP_CHANNEL_ID")

    database_url: str = Field(default="sqlite+pysqlite:///./dev.db", alias="DATABASE_URL")

    admin_app_url: str = Field(default="http://localhost:4200", alias="ADMIN_APP_URL")
    session_secret: str = Field(default="dev-secret", alias="SESSION_SECRET")

    default_timezone: str = Field(default="Europe/Bucharest", alias="DEFAULT_TIMEZONE")

    lineup_primary_color: str = Field(default="#EAE905", alias="LINEUP_PRIMARY_COLOR")
    lineup_secondary_color: str = Field(default="#111111", alias="LINEUP_SECONDARY_COLOR")
    lineup_render_width: int = Field(default=1200, alias="LINEUP_RENDER_WIDTH")
    lineup_render_height: int = Field(default=1600, alias="LINEUP_RENDER_HEIGHT")
    lineup_show_slot_tags: bool = Field(default=True, alias="LINEUP_SHOW_SLOT_TAGS")


@lru_cache
def get_settings() -> Settings:
    return Settings()
