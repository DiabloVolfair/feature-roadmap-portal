"""Password_Reset_Token persistence shape.

`Password_Reset_Service` (not this module) is the sole owner of the
`password_reset_tokens` collection - it is the only module permitted to read
from or write to it (Req 5.7). This module exists purely to document the
shape of the plain dict documents that service persists; there is no raw
token to expose at an API boundary here, so unlike `models/user.py`, no
Pydantic schema is defined in this file.

The persisted Mongo document is a plain dict (Motor does not require a
Pydantic model to write/read it) with this shape:

    {
        "_id": ObjectId(...),           # uniquely identifies the document
        "user_id": str,                 # string form of the associated
                                         # user's _id (Req 5.1)
        "token_hash": str,              # hash_opaque_token(raw_token); the
                                         # raw token value itself is never
                                         # persisted (Req 5.1, 5.2)
        "expires_at": datetime,         # created_at + password_reset_expire_minutes,
                                         # read from Settings, never a
                                         # hardcoded literal (Req 5.1)
        "created_at": datetime,         # set once at creation, never
                                         # rewritten afterward (Req 5.1)
    }

Because the raw token is never persisted, `Password_Reset_Service` locates a
matching record by verifying a presented raw token against each record's
`token_hash` (scan-and-verify), not by an equality lookup - there is no
indexed field to query the raw value by.

Requirements: 5.1
"""
