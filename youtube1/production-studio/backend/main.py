from .app import create_app as _create_app


def create_app(data_root=None, **kwargs):
    """Default launcher factory with the canonical shared media/WISE router."""
    return _create_app(data_root, include_media=True, **kwargs)


def create_app_with_media(data_root=None, **kwargs):
    """Backward-compatible alias for the media-enabled factory."""
    return create_app(data_root, **kwargs)
