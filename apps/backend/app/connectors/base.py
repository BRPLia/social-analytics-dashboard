from abc import ABC, abstractmethod

from app.models import DashboardPayload


class SocialConnector(ABC):
    platform: str

    @abstractmethod
    async def fetch_dashboard(self) -> DashboardPayload:
        raise NotImplementedError

