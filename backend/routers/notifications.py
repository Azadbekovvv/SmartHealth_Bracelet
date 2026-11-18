from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Bracelet, Notification, User
from backend.schemas import NotificationResponse
from backend.security import get_current_user


router = APIRouter(
    prefix="/notifications",
    tags=["Уведомления"],
)


@router.get(
    "",
    response_model=list[NotificationResponse],
)
def get_notifications(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    statement = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(
            Notification.created_at.desc(),
            Notification.id.desc(),
        )
        .offset(offset)
        .limit(limit)
    )

    return db.scalars(statement).all()

@router.patch(
    "/{notification_id}/read",
    response_model=NotificationResponse,
)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )

    if notification is None:
        raise HTTPException(
            status_code=404,
            detail="Уведомление не найдено",
        )

    notification.is_read = True

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(notification)

    return notification

class TestSosCreate(BaseModel):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def validate_coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Укажи обе координаты или не указывай ни одной")
        return self


@router.post(
    "/test-sos/{bracelet_id}",
    response_model=NotificationResponse,
    status_code=201,
)
def create_test_sos(
    bracelet_id: int,
    data: TestSosCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bracelet = db.scalar(
        select(Bracelet).where(
            Bracelet.id == bracelet_id,
            Bracelet.user_id == current_user.id,
        )
    )
    if bracelet is None:
        raise HTTPException(status_code=404, detail="Браслет не найден")

    if data.latitude is None or data.longitude is None:
        message = "Тестовый SOS. Местоположение недоступно."
    else:
        message = (
            f"Тестовый SOS. Координаты: "
            f"{data.latitude:.6f}, {data.longitude:.6f}"
        )

    notification = Notification(
        user_id=current_user.id,
        bracelet_id=bracelet.id,
        measurement_id=None,
        alert_rule_id=None,
        message=message,
        is_read=False,
    )
    db.add(notification)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(notification)
    return notification