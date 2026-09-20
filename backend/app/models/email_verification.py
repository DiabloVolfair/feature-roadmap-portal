"""Email_Verification_Token persisted document reference.

`Email_Verification_Service` (not this module) is the sole module permitted
to read from or write to the `email_verification_tokens` collection (Req
2.7). Like `users`, the persisted document is a plain dict - Motor does not
require a Pydantic model to write/read it - so no Pydantic schema is defined
here. This module exists purely to document that document's shape at a
fixed location, mirroring `user.py`'s documentation convention.

The persisted Mongo document has this shape:

    {
        "_id": ObjectId(...),      # uniquely identifies the document
        "user_id": str,            # string form of the associated user's
                                    # _id (Req 2.1)
        "token_hash": str,         # hash_opaque_token(raw_token); the raw
                                    # token value is never persisted (Req 2.2)
        "expires_at": datetime,    # created_at + email_verification_expire_hours
                                    # (Req 2.1)
        "created_at": datetime,    # set once at creation, never rewritten
                                    # afterward
    }

Requirements: 2.1
"""
