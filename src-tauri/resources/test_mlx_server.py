import mlx_server as m


def test_health_reflects_state():
    m.STATE["status"] = "downloading"
    m.STATE["progress"] = None
    assert m.health() == {"status": "downloading", "progress": None}
    m.STATE["status"] = "ready"
    assert m.health()["status"] == "ready"


def test_extract_raises_503_when_not_ready():
    from fastapi import HTTPException
    m.STATE["status"] = "loading"
    try:
        m.extract(m.ExtractReq(image_base64="aGk=", prompt="x"))
        raise AssertionError("expected HTTPException")
    except HTTPException as e:
        assert e.status_code == 503


if __name__ == "__main__":
    test_health_reflects_state()
    test_extract_raises_503_when_not_ready()
    print("OK")
