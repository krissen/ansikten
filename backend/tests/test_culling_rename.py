"""Tests for CullingService.rename — single-file rename with sidecars + guards."""

import pytest

from api.services.culling_service import CullingService


@pytest.fixture
def service():
    return CullingService()


def test_rename_moves_file_and_sidecar(service, tmp_path):
    img = tmp_path / "260626_191003_Milian,_Valter.jpg"
    img.write_bytes(b"jpg")
    sidecar = tmp_path / "260626_191003_Milian,_Valter.xmp"
    sidecar.write_text("xmp")

    result = service.rename(str(img), "260626_191003_Milian.jpg")

    assert result["basename"] == "260626_191003_Milian.jpg"
    assert not img.exists()
    new_img = tmp_path / "260626_191003_Milian.jpg"
    assert new_img.exists()
    # The sidecar follows the new stem.
    assert not sidecar.exists()
    assert (tmp_path / "260626_191003_Milian.xmp").read_text() == "xmp"


def test_rename_rejects_existing_target(service, tmp_path):
    a = tmp_path / "a.jpg"
    a.write_bytes(b"a")
    b = tmp_path / "b.jpg"
    b.write_bytes(b"b")

    with pytest.raises(ValueError):
        service.rename(str(a), "b.jpg")
    # Both untouched.
    assert a.read_bytes() == b"a"
    assert b.read_bytes() == b"b"


def test_rename_rejects_path_separators(service, tmp_path):
    a = tmp_path / "a.jpg"
    a.write_bytes(b"a")

    with pytest.raises(ValueError):
        service.rename(str(a), "../evil.jpg")
    with pytest.raises(ValueError):
        service.rename(str(a), "sub/dir.jpg")
    assert a.exists()


def test_rename_missing_source(service, tmp_path):
    with pytest.raises(ValueError):
        service.rename(str(tmp_path / "nope.jpg"), "new.jpg")


def test_rename_same_name_is_noop(service, tmp_path):
    a = tmp_path / "a.jpg"
    a.write_bytes(b"a")
    result = service.rename(str(a), "a.jpg")
    assert result["basename"] == "a.jpg"
    assert a.exists()


def test_rename_does_not_clobber_existing_sidecar(service, tmp_path):
    img = tmp_path / "a.jpg"
    img.write_bytes(b"a")
    (tmp_path / "a.xmp").write_text("a-side")
    # A sidecar already occupies the target stem's name.
    occupied = tmp_path / "b.xmp"
    occupied.write_text("keep-me")

    service.rename(str(img), "b.jpg")

    assert (tmp_path / "b.jpg").exists()
    # The pre-existing b.xmp is preserved (not overwritten by a.xmp's content).
    assert occupied.read_text() == "keep-me"
    # a.xmp stays put since its target was occupied.
    assert (tmp_path / "a.xmp").read_text() == "a-side"


def test_rename_case_only(service, tmp_path):
    img = tmp_path / "anna.jpg"
    img.write_bytes(b"a")
    result = service.rename(str(img), "Anna.jpg")
    assert result["basename"] == "Anna.jpg"
    # On case-insensitive FS the same inode is now named Anna.jpg; on
    # case-sensitive FS the old name is gone. Either way the new name exists.
    assert (tmp_path / "Anna.jpg").exists()
