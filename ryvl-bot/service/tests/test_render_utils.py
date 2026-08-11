from app.render_utils import fetch_remote_image


def test_missing_remote_image_is_cached_as_a_miss(monkeypatch):
    calls = 0

    def fail_request(*args, **kwargs):
        nonlocal calls
        calls += 1
        raise RuntimeError("offline")

    monkeypatch.setattr("app.render_utils.httpx.get", fail_request)
    url = "https://example.test/missing.png"
    assert fetch_remote_image(url) is None
    assert fetch_remote_image(url) is None
    assert calls == 1