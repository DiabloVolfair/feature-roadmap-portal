"""User_Model schemas.

Defines the Pydantic request/response schemas used by the Auth_API
(`UserCreate`, `UserLogin`, `UserResponse`, `TokenResponse`), plus
`UserResponse.from_mongo`, which maps a persisted Mongo user document to a
`UserResponse` without ever exposing `password_hash` or
`refresh_token_hash`.

The persisted Mongo document itself is a plain dict (Motor does not require
a Pydantic model to write/read it) with this shape:

    {
        "_id": ObjectId(...),          # uniquely identifies the document (Req 2.1)
        "name": str,
        "email": str,                   # stored lowercased for case-insensitive
                                         # uniqueness (Req 2.2)
        "password_hash": str,
        "role": "user" | "admin",       # defaults to "user" on creation (Req 2.3, 2.6)
        "is_verified": bool,            # defaults to False on creation (Req 2.4);
                                         # email verification isn't implemented
                                         # this sprint
        "refresh_token_hash": str | None,  # bcrypt hash of the current
                                         # Refresh_Token (never the raw JWT
                                         # string); defaults to None on
                                         # creation, until a session is
                                         # established (Req 2.5)
        "created_at": datetime,         # set once at creation, never rewritten
                                         # afterward (Req 2.7, 2.8)
        "updated_at": datetime,         # set at creation and rewritten on every
                                         # subsequent persisted-field change
                                         # (Req 2.7, 2.8)
    }

`User_Service` (not this module) is responsible for actually constructing and
persisting that document; this module only defines the schemas used at the
API boundary and the `from_mongo` mapping.

Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5
"""

from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field

UserRole = Literal["user", "admin"]
"""The `role` field is restricted to exactly these two values (Req 2.6),
defaulting to `"user"` for newly created users (Req 2.3)."""


class UserCreate(BaseModel):
    """Signup_Endpoint request body (Req 3.1).

    `name` must be 1-100 characters, `email` must be a valid email address
    (max 254 characters), and `password` must be 8-128 characters. A request
    body violating any of these bounds fails validation (Req 3.6).
    """

    name: str = Field(min_length=1, max_length=100)
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    """Login_Endpoint request body (Req 3.2)."""

    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """User data as returned by the Auth_API (Req 3.3).

    Structurally cannot contain `password_hash` or `refresh_token_hash` -
    there is no such field on this model, which is stronger than filtering
    secrets out at serialization time.
    """

    id: str
    name: str
    email: str
    role: UserRole
    is_verified: bool

    @classmethod
    def from_mongo(cls, doc: dict[str, Any]) -> "UserResponse":
        """Build a `UserResponse` from a persisted Mongo user document.

        Maps `doc["_id"]` to `id` (stringified) and reads only the fields
        this schema declares, so a raw document - including its
        `password_hash` and `refresh_token_hash` - can never leak through
        this mapping (Req 3.3, 3.5).
        """
        return cls(
            id=str(doc["_id"]),
            name=doc["name"],
            email=doc["email"],
            role=doc["role"],
            is_verified=doc["is_verified"],
        )


class TokenResponse(BaseModel):
    """Access token payload returned by the Auth_API (Req 3.4).

    Does not contain a `refresh_token` field - the refresh token is only
    ever transmitted via the Refresh_Token_Cookie, never in a JSON body.
    """

    access_token: str
    token_type: str = "bearer"
