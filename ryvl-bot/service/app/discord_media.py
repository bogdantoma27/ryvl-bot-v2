from io import BytesIO

import discord


async def send_image_message(
    channel,
    image: bytes,
    filename: str,
    *,
    content: str | None = None,
    embed: discord.Embed | None = None,
):
    """Send an in-memory PNG without creating temporary files."""
    return await channel.send(
        content=content,
        embed=embed,
        file=discord.File(BytesIO(image), filename=filename),
    )
