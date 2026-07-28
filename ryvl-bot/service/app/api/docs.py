from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["docs"])


@router.get("/scalar", response_class=HTMLResponse)
def scalar_docs() -> str:
    return """<!doctype html>
<html>
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>RYVL API Docs</title>
  </head>
  <body>
    <script id=\"api-reference\" data-url=\"/openapi.json\"></script>
    <script src=\"https://cdn.jsdelivr.net/npm/@scalar/api-reference\"></script>
  </body>
</html>"""
