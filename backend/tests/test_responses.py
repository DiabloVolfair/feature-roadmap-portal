"""Property-based tests for the response envelope helpers.

Requirements: 7.1, 7.2
"""

from hypothesis import given, settings, strategies as st

from app.utils.responses import error_response, success_response

# Strategy: message strings of length 1-500 characters.
messages = st.text(min_size=1, max_size=500)

# Strategy: non-empty lists of error strings.
error_lists = st.lists(st.text(), min_size=1)

# Strategy: JSON-serializable data payloads (None, primitives, and nested
# dicts/lists built from those primitives).
json_primitives = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(),
    st.floats(allow_nan=False, allow_infinity=False),
    st.text(),
)
json_serializable = st.recursive(
    json_primitives,
    lambda children: st.one_of(
        st.lists(children, max_size=5),
        st.dictionaries(st.text(), children, max_size=5),
    ),
    max_leaves=10,
)


# Feature: sprint-0-foundation-setup, Property 1: Success envelope shape is invariant
@given(message=messages, data=json_serializable)
@settings(max_examples=100)
def test_success_response_shape(message, data):
    result = success_response(message, data)
    assert result == {"success": True, "message": message, "data": data}


# Feature: sprint-0-foundation-setup, Property 2: Error envelope shape is invariant
@given(message=messages, errors=error_lists)
@settings(max_examples=100)
def test_error_response_shape(message, errors):
    result = error_response(message, errors)
    assert result == {"success": False, "message": message, "errors": errors}
    assert len(result["errors"]) >= 1
