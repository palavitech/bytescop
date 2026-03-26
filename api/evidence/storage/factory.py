from .local import LocalAttachmentStorage


def get_attachment_storage():
    return LocalAttachmentStorage()
