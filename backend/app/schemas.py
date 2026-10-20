from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class PredictIn(BaseModel):
    features: dict[str, Any]
    student_id: int | None = None
    save: bool = True


class StudentIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    features: dict[str, Any]
    actual_grade: float | None = Field(default=None, ge=0, le=20)


class StudentOut(BaseModel):
    id: int
    code: str
    name: str
    subject: str
    actual_grade: float | None
    predicted_grade: float | None
    pass_probability: float | None
    risk: str | None
    mode: str | None
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}


class StudentDetail(StudentOut):
    features: dict[str, Any]
