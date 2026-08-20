from sqlalchemy.orm import Session

from app.db import (
    AccountMetricSnapshotOrm,
    ContentItemOrm,
    ContentMetricSnapshotOrm,
    SocialAccountOrm,
    SocialChannelOrm,
    SyncRunOrm,
)


class MaintenanceService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def reset_ingested_data(self) -> dict[str, int | str]:
        content_snapshots = self.session.query(ContentMetricSnapshotOrm).count()
        account_snapshots = self.session.query(AccountMetricSnapshotOrm).count()
        content_items = self.session.query(ContentItemOrm).count()
        sync_runs = self.session.query(SyncRunOrm).count()

        self.session.query(ContentMetricSnapshotOrm).delete(synchronize_session=False)
        self.session.query(AccountMetricSnapshotOrm).delete(synchronize_session=False)
        self.session.query(ContentItemOrm).delete(synchronize_session=False)
        self.session.query(SyncRunOrm).delete(synchronize_session=False)

        updated_accounts = (
            self.session.query(SocialAccountOrm)
            .update(
                {
                    SocialAccountOrm.status: "pending",
                    SocialAccountOrm.last_sync_at: None,
                },
                synchronize_session=False,
            )
        )

        return {
            "status": "success",
            "content_metric_snapshots": content_snapshots,
            "account_metric_snapshots": account_snapshots,
            "content_items": content_items,
            "sync_runs": sync_runs,
            "accounts_reset": updated_accounts,
        }

    def delete_account_cascade(self, account_id: int) -> dict[str, int | str]:
        # 1. Obtener los IDs de contenidos del canal/cuenta
        content_ids = [row[0] for row in self.session.query(ContentItemOrm.id).filter_by(account_id=account_id).all()]
        
        # 2. Borrar en cascada respetando FK
        content_snapshots_deleted = 0
        if content_ids:
            content_snapshots_deleted = self.session.query(ContentMetricSnapshotOrm).filter(
                ContentMetricSnapshotOrm.content_id.in_(content_ids)
            ).delete(synchronize_session=False)
            
        content_items_deleted = self.session.query(ContentItemOrm).filter_by(account_id=account_id).delete(synchronize_session=False)
        account_snapshots_deleted = self.session.query(AccountMetricSnapshotOrm).filter_by(account_id=account_id).delete(synchronize_session=False)
        sync_runs_deleted = self.session.query(SyncRunOrm).filter_by(account_id=account_id).delete(synchronize_session=False)
        
        accounts_deleted = self.session.query(SocialAccountOrm).filter_by(id=account_id).delete(synchronize_session=False)
        
        return {
            "status": "success",
            "account_id": account_id,
            "content_metric_snapshots_deleted": content_snapshots_deleted,
            "content_items_deleted": content_items_deleted,
            "account_metric_snapshots_deleted": account_snapshots_deleted,
            "sync_runs_deleted": sync_runs_deleted,
            "accounts_deleted": accounts_deleted
        }

    def delete_channel_cascade(self, channel_id: str) -> dict[str, int | str]:
        # 1. Buscar todas las cuentas asociadas
        accounts = self.session.query(SocialAccountOrm).filter_by(channel_id=channel_id).all()
        
        # 2. Ejecutar borrado en cascada para cada cuenta
        totals = {
            "content_metric_snapshots_deleted": 0,
            "content_items_deleted": 0,
            "account_metric_snapshots_deleted": 0,
            "sync_runs_deleted": 0,
            "accounts_deleted": 0
        }
        
        for acc in accounts:
            res = self.delete_account_cascade(acc.id)
            totals["content_metric_snapshots_deleted"] += res["content_metric_snapshots_deleted"]
            totals["content_items_deleted"] += res["content_items_deleted"]
            totals["account_metric_snapshots_deleted"] += res["account_metric_snapshots_deleted"]
            totals["sync_runs_deleted"] += res["sync_runs_deleted"]
            totals["accounts_deleted"] += res["accounts_deleted"]
            
        # 3. Eliminar el canal
        channels_deleted = self.session.query(SocialChannelOrm).filter_by(id=channel_id).delete(synchronize_session=False)
        
        return {
            "status": "success",
            "channel_id": channel_id,
            "channels_deleted": channels_deleted,
            **totals
        }
