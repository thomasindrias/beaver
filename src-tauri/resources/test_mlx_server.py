import mlx_server as m


def test_health_reflects_state():
    m.STATE["status"] = "downloading"
    m.STATE["progress"] = None
    assert m.health() == {"status": "downloading", "progress": None}
    m.STATE["status"] = "ready"
    assert m.health()["status"] == "ready"


def test_progress_aggregates_byte_bars():
    m._ProgressTqdm.reset()
    m.STATE["progress"] = None
    a = m._ProgressTqdm(total=100, unit="B")
    b = m._ProgressTqdm(total=300, unit="B")
    a.update(50)
    b.update(150)  # done 200 / total 400
    assert m.STATE["progress"] == 0.5


def test_progress_ignores_non_byte_bars():
    m._ProgressTqdm.reset()
    m.STATE["progress"] = None
    files = m._ProgressTqdm(total=4, unit="it")  # the "Fetching N files" bar
    data = m._ProgressTqdm(total=200, unit="B")
    files.update(2)
    data.update(50)
    # only the byte bar counts: 50 / 200
    assert m.STATE["progress"] == 0.25


def test_progress_clamps_to_one():
    m._ProgressTqdm.reset()
    m.STATE["progress"] = None
    bar = m._ProgressTqdm(total=100, unit="B")
    bar.update(150)  # over-reports past total
    assert m.STATE["progress"] == 1.0


def test_extract_raises_503_when_not_ready():
    from fastapi import HTTPException
    m.STATE["status"] = "loading"
    try:
        m.extract(m.ExtractReq(image_base64="aGk=", prompt="x"))
        raise AssertionError("expected HTTPException")
    except HTTPException as e:
        assert e.status_code == 503


def test_resolve_model_skips_download_when_cached():
    # A warm cache must not flip the UI into the "downloading" phase.
    m.STATE["status"] = "loading"
    calls = []

    def fake(repo, **kw):
        calls.append(kw)
        return "/cache/path"  # local_files_only check succeeds

    assert m._resolve_model(fake) == "/cache/path"
    assert m.STATE["status"] == "loading"
    assert calls == [{"local_files_only": True}]


def test_resolve_model_downloads_when_not_cached():
    m.STATE["status"] = "loading"
    calls = []

    def fake(repo, **kw):
        calls.append(kw)
        if kw.get("local_files_only"):
            raise RuntimeError("not fully cached")
        return "/downloaded/path"

    assert m._resolve_model(fake) == "/downloaded/path"
    assert m.STATE["status"] == "downloading"
    assert m.STATE["progress"] == 0.0
    assert len(calls) == 2
    assert calls[0] == {"local_files_only": True}
    assert "tqdm_class" in calls[1]


if __name__ == "__main__":
    test_health_reflects_state()
    test_progress_aggregates_byte_bars()
    test_progress_ignores_non_byte_bars()
    test_progress_clamps_to_one()
    test_extract_raises_503_when_not_ready()
    test_resolve_model_skips_download_when_cached()
    test_resolve_model_downloads_when_not_cached()
    print("OK")
