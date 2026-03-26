"""
Abstract storage backend for finding attachments.

Key layout::

    {tenant_id}/engagements/{eng_id}/images/{token}/{filename}
"""
from abc import ABC, abstractmethod
from typing import BinaryIO, Optional


class AttachmentStorage(ABC):

    @abstractmethod
    def save(
        self, *, tenant_id: str, engagement_id, token: str,
        file_obj, filename: str, content_type: str,
    ) -> str:
        raise NotImplementedError

    @abstractmethod
    def open(self, storage_uri: str) -> BinaryIO:
        raise NotImplementedError

    @abstractmethod
    def delete(self, storage_uri: str) -> None:
        raise NotImplementedError
