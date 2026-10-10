from embed.input import build_embed_input

DENYLIST = [
    r'(?i)updated:?\s.*$', r'(?i)\s*read more\s*$', r'(?i)the post .* appeared first on .*$',
]

def whitespace_tokenizer(text: str, max_tokens: int) -> str:
    return " ".join(text.split()[:max_tokens])

def test_title_and_excerpt_joined_with_period_space():
    result = build_embed_input("Title", "Excerpt here", [], whitespace_tokenizer)
    assert result.text == "Title. Excerpt here"
    assert result.title_only is False

def test_title_only_when_excerpt_empty():
    result = build_embed_input("Just a title", "", [], whitespace_tokenizer)
    assert result.text == "Just a title"
    assert result.title_only is True

def test_denylist_strips_volatile_fragment():
    result = build_embed_input("Title", "Body text Updated: 10:42am", DENYLIST, whitespace_tokenizer)
    assert "Updated" not in result.text
    assert result.text == "Title. Body text"

def test_whitespace_collapsed():
    result = build_embed_input("Ti\n\ntle", "Ex   cerpt", [], whitespace_tokenizer)
    assert result.text == "Ti tle. Ex cerpt"

def test_hash_is_deterministic_and_prefixed():
    a = build_embed_input("Same", "Input", [], whitespace_tokenizer)
    b = build_embed_input("Same", "Input", [], whitespace_tokenizer)
    assert a.content_hash == b.content_hash
    assert a.content_hash.startswith("e1:")

def test_different_input_different_hash():
    a = build_embed_input("A", "x", [], whitespace_tokenizer)
    b = build_embed_input("B", "x", [], whitespace_tokenizer)
    assert a.content_hash != b.content_hash

def test_truncation_uses_injected_tokenizer():
    result = build_embed_input("one two three four five", "", [], whitespace_tokenizer, max_tokens=3)
    assert result.text == "one two three"
